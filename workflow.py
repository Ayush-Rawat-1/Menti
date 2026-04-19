"""
Memory-Augmented Therapist Workflow
=====================================

Graph flow:
    START
      └─► summarize           (compress session history when tokens grow)
      └─► enhancer            (enrich query with short + long-term context)
      └─► supervisor          (route based on readiness score)
            ├─► questioner    (gather info, build rapport)
            └─► explainer     (CBT tools, psychoeducation)
      └─► response_validator  (tone + quality gate)
      └─► readiness_evaluator (score 1–10, updates session themes)
      └─► memory_writer       (extract structured insight → PostgresStore, runs in background)
      └─► END

Short-term memory → LangGraph PostgresSaver (checkpoint, keyed by thread_id)
Long-term memory  → LangGraph PostgresStore (namespace per user_id)

FastAPI-ready:
    - All user context is driven by config["configurable"]["user_id"] and
      config["configurable"]["thread_id"]. No state fields need to be passed
      by the caller — the graph infers or loads everything it needs.
    - is_new_user is derived dynamically inside the graph (store lookup).
    - questions_asked list is dropped; the running summary already captures
      what has been asked, and the LLM is instructed not to repeat itself.
"""

import asyncio
import os
import time
import json
from typing import AsyncIterator, Literal, List, Optional

from langchain_openrouter import ChatOpenRouter
from langchain_core.messages import AnyMessage, SystemMessage, HumanMessage, AIMessage, AIMessageChunk
from langchain_core.messages.utils import count_tokens_approximately
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.graph.state import CompiledGraph
from langgraph.store.base import BaseStore
from langmem.short_term import SummarizationNode, RunningSummary
from pydantic import BaseModel, Field

from database import get_checkpointer, get_store


# ---------------------------------------------------------------------------
# 1. State
# ---------------------------------------------------------------------------

class State(MessagesState):
    """
    Graph state.

    Fields:
      context              : langmem short-term context dict (holds RunningSummary)
      summarized_messages  : token-safe message list from SummarizationNode
      enhanced_query       : enriched context block string built by enhancer
      is_new_user          : derived dynamically in enhancer via store lookup
      readiness_score      : int 1-10, updated each turn by readiness_evaluator
      session_themes       : themes surfaced so far this session
      next_worker          : "questioner" | "explainer", set by supervisor

    Intentionally omitted:
      questions_asked — redundant; the running summary already contains the
                        session history. The LLM is instructed not to repeat
                        questions. Keeping a growing list burns RAM for nothing.
    """
    context: dict
    summarized_messages: List[AnyMessage]
    enhanced_query: str
    is_new_user: bool
    readiness_score: int
    session_themes: List[str]
    next_worker: str


# ---------------------------------------------------------------------------
# 2. Structured output schemas
# ---------------------------------------------------------------------------

class SupervisorDecision(BaseModel):
    next_worker: Literal["questioner", "explainer"] = Field(
        description=(
            "questioner — if readiness_score < 6, or the user raised something "
            "new, or they need to feel heard. "
            "explainer  — only when readiness_score >= 6 and a concrete technique "
            "or insight would genuinely help right now."
        )
    )
    reasoning: str = Field(description="One sentence explaining the choice.")


class ValidationResult(BaseModel):
    approved: bool = Field(
        description="True if the response is empathic, safe, and appropriate."
    )
    revised_response: Optional[str] = Field(
        default=None,
        description="Corrected response if not approved. None otherwise."
    )


class ReadinessAssessment(BaseModel):
    score: int = Field(
        description=(
            "1-10. "
            "1-3 = user just arrived or only gave surface facts. "
            "4-5 = some emotion expressed, one theme emerging. "
            "6-7 = core emotion + theme understood, user somewhat open. "
            "8-10 = deep context, user has shown insight or asked for help."
        )
    )
    new_themes: List[str] = Field(
        default_factory=list,
        description="New psychological themes detected this turn, if any."
    )


class MemoryInsight(BaseModel):
    theme: str = Field(description="Core psychological theme, e.g. 'work anxiety'.")
    detail: str = Field(description="One specific detail that adds new information.")
    quality_score: float = Field(
        description="0.0-1.0 confidence this is worth saving. Only persisted if >= 0.65."
    )


# ---------------------------------------------------------------------------
# 3. LLM setup
# ---------------------------------------------------------------------------

llm = ChatOpenRouter(
    model="openai/gpt-4o-mini",
    temperature=0.7,
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

# Lower temperature for structured decisions
_cold_llm = llm.bind(temperature=0.1)

supervisor_llm = _cold_llm.with_structured_output(SupervisorDecision)
validator_llm  = _cold_llm.with_structured_output(ValidationResult)
readiness_llm  = _cold_llm.with_structured_output(ReadinessAssessment)
memory_llm     = _cold_llm.with_structured_output(MemoryInsight)

summarization_node = SummarizationNode(
    token_counter=count_tokens_approximately,
    model=llm.bind(max_tokens=256, temperature=0.2),
    max_tokens=1024,
    max_tokens_before_summary=768,
    max_summary_tokens=256,
)


# ---------------------------------------------------------------------------
# 4. Nodes
# ---------------------------------------------------------------------------

async def enhancer_node(state: State, config: RunnableConfig, store: BaseStore) -> dict:
    """
    Builds the context block injected into every downstream node.

    Two sources only:
      1. Short-term : running summary from langmem (current session).
      2. Long-term  : patient themes from PostgresStore (past sessions).

    is_new_user is derived here from the store — callers never pass it.
    """
    user_id   = config["configurable"]["user_id"]
    namespace = ("features", user_id)

    # --- Long-term memory ---
    memories = await store.asearch(namespace)
    is_new   = not bool(memories)

    if is_new:
        history_block = "No previous sessions. This is the user's first time."
    else:
        lines = [
            f"- {m.value['theme']}: {m.value['detail']}"
            for m in memories
        ]
        history_block = "Past session themes:\n" + "\n".join(lines)

    # --- Short-term memory ---
    summary_obj     = state.get("context", {}).get("running_summary")
    session_summary = getattr(summary_obj, "summary", None) or "Session just started."

    readiness = state.get("readiness_score", 1)
    themes    = state.get("session_themes", [])

    enhanced = (
        f"[THERAPIST CONTEXT]\n"
        f"Readiness: {readiness}/10 "
        f"({'still gathering info' if readiness < 6 else 'ready for guidance'})\n"
        f"Session themes so far: {', '.join(themes) if themes else 'none yet'}\n\n"
        f"Session summary:\n{session_summary}\n\n"
        f"{history_block}\n\n"
        f"User's latest message:\n{state['messages'][-1].content}"
    )

    return {
        "enhanced_query": enhanced,
        "is_new_user":    is_new,
    }


async def supervisor_node(state: State) -> dict:
    """
    Routes to questioner or explainer based on specific observable signals.
    Hard-gates below readiness 4 — no LLM call needed on obvious cases.
    """
    if state.get("readiness_score", 1) < 4:
        return {"next_worker": "questioner"}

    system = SystemMessage(content=(
        "You are the clinical supervisor of a solution-focused therapy system.\n\n"

        "YOUR JOB:\n"
        "Read the conversation context and decide whether the therapist should "
        "ask another purposeful question (questioner) or deliver a technique "
        "or insight (explainer).\n\n"

        "ROUTE TO 'explainer' ONLY IF at least ONE of these is true:\n"
        "  - The user has named their own insight or answered their own question "
        "    ('I think the real issue is...', 'I guess I just need to...').\n"
        "  - The user has explicitly asked for advice, a technique, or what they "
        "    should do ('what can I do about this?', 'how do I stop feeling this way?').\n"
        "  - The user has shown they understand the root cause and are now asking "
        "    how to act on it — the 'why' is clear and the 'what now' is the gap.\n"
        "  - The same theme has been explored across 3 or more turns with sufficient "
        "    emotional depth and no new information is emerging.\n\n"

        "ROUTE TO 'questioner' IF ANY of these are true:\n"
        "  - The user introduced something new this turn that hasn't been explored.\n"
        "  - The user is still describing the problem, not reflecting on it.\n"
        "  - The user's language is still absolute or catastrophic "
        "    ('always', 'never', 'everything', 'nothing').\n"
        "  - The user seems to need to feel heard more than helped right now.\n"
        "  - You are uncertain — default is always questioner.\n\n"

        "IMPORTANT:\n"
        "Giving techniques too early breaks trust. A user who hasn't felt fully "
        "heard will reject even the best advice. Err toward questioner.\n"
    ))

    try:
        decision: SupervisorDecision = await supervisor_llm.ainvoke([
            system,
            HumanMessage(content=state["enhanced_query"]),
        ])
        if decision and hasattr(decision, "next_worker"):
            return {"next_worker": decision.next_worker}
    except Exception:
        pass

    return {"next_worker": "questioner"}


def route_to_worker(state: State) -> str:
    return state.get("next_worker", "questioner")


async def questioner_node(state: State) -> dict:
    """
    Asks ONE purposeful question that moves the user toward resolution.
    """
    msgs = state.get("summarized_messages") or state["messages"]

    system = SystemMessage(content=(
        "You are an experienced therapist conducting a solution-focused session.\n\n"

        "WHAT YOU ARE TRYING TO DO:\n"
        "Move the user one step closer to understanding or resolving their situation. "
        "Every question you ask should have a therapeutic purpose — not just curiosity. "
        "You are steering the conversation, not just listening.\n\n"

        "HOW TO CHOOSE YOUR QUESTION:\n"
        "Look at what the user said and identify the most useful angle to probe:\n"
        "  - If they describe a problem as absolute ('I always fail', 'nothing works'), "
        "    ask a question that surfaces a counter-example or exception.\n"
        "  - If they are stuck in the situation, ask what they would advise a close "
        "    friend in the same position — creates healthy distance.\n"
        "  - If they are blaming only external factors, gently ask what, if anything, "
        "    feels within their control right now.\n"
        "  - If they are describing symptoms but not feelings, ask what emotion sits "
        "    underneath the situation.\n"
        "  - If they have made progress before, ask what was different then.\n"
        "  - If they seem stuck on what they can't change, redirect toward what a "
        "    small first step might look like.\n\n"

        "RULES:\n"
        "- Ask exactly ONE question — never two.\n"
        "- Reflect one specific thing they said before asking — shows you heard them.\n"
        "- The question must be open-ended (never yes/no).\n"
        "- Do not give advice, name techniques, or reassure them yet.\n"
        "- Do not repeat a question already asked in this session "
        "(check the session summary in context).\n"
        "- Keep the full response under 75 words.\n\n"

        "TONE:\n"
        "Warm and curious — like a therapist who genuinely believes the user already "
        "has the answer inside them and your job is to help them find it.\n\n"

        f"{state['enhanced_query']}"
    ))

    response = await llm.ainvoke([system] + msgs)
    return {"messages": [response]}


async def explainer_node(state: State) -> dict:
    """
    Delivers ONE targeted technique or insight matched to the user's situation.
    """
    msgs = state.get("summarized_messages") or state["messages"]

    system = SystemMessage(content=(
        "You are an experienced therapist delivering a targeted intervention.\n\n"

        "WHAT YOU ARE TRYING TO DO:\n"
        "The user is ready to receive help. Your job is to give them ONE concrete "
        "tool or reframe that directly addresses the specific pattern you've observed "
        "in this conversation. Not generic advice — something built for their exact situation.\n\n"

        "HOW TO CHOOSE YOUR TECHNIQUE:\n"
        "Identify which pattern best describes what this user is experiencing, "
        "then apply the matching approach:\n\n"

        "  DISTORTED THINKING (catastrophising, black-and-white, mind-reading):\n"
        "    → Cognitive reframing. Name the distortion gently, offer an alternative "
        "    interpretation using their own words as the raw material.\n\n"

        "  ACUTE ANXIETY OR OVERWHELM (racing thoughts, physical tension, panic):\n"
        "    → Grounding or breathing technique. Box breathing, 5-4-3-2-1 sensory "
        "    grounding, or physiological sigh. Explain it in steps, keep it simple.\n\n"

        "  AVOIDANCE OR PARALYSIS (knows what to do but can't start, procrastination):\n"
        "    → Behavioural activation. Help them identify the single smallest action "
        "    that would move them one inch forward. Make it laughably small.\n\n"

        "  SELF-BLAME OR SHAME (harsh self-criticism, 'I'm the problem'):\n"
        "    → Self-compassion reframe. Ask them to apply the same standard they "
        "    hold for themselves to someone they love. Surface the double standard.\n\n"

        "  RUMINATION (looping thoughts, can't stop replaying events):\n"
        "    → Cognitive defusion. Teach them to observe the thought rather than "
        "    be inside it — 'I notice I'm having the thought that...' framing.\n\n"

        "  INTERPERSONAL CONFLICT (relationship stress, feeling unheard, resentment):\n"
        "    → Communication reframe. Introduce 'I feel X when Y happens' structure, "
        "    or help them identify what they actually need from the other person.\n\n"

        "RULES:\n"
        "- Deliver ONE technique only — not a menu of options.\n"
        "- Name it clearly so they can look it up later if they want.\n"
        "- Ground it in something specific they said — not a generic explanation.\n"
        "- End with a question that invites their reaction, not a full stop.\n"
        "- Keep the full response under 130 words.\n\n"

        "TONE:\n"
        "Warm, direct, and confident — like a therapist who has seen this pattern "
        "before and knows exactly what tends to help, but remains genuinely curious "
        "about whether it lands for this particular person.\n\n"

        f"{state['enhanced_query']}"
    ))

    response = await llm.ainvoke([system] + msgs)
    return {"messages": [response]}


async def response_validator_node(state: State) -> dict:
    """
    Quality gate. Replaces the last AI message if it fails the check.
    """
    last = state["messages"][-1]
    if not isinstance(last, AIMessage):
        return {}

    system = SystemMessage(content=(
        "You are a clinical reviewer for a mental health chatbot.\n\n"
        "Approve the response only if all of these hold:\n"
        "1. Tone is warm, empathic, and non-judgmental.\n"
        "2. No unsolicited medical diagnoses.\n"
        "3. No dismissive language ('just', 'simply', 'you should').\n"
        "4. No harmful or irresponsible content.\n"
        "5. Appropriately concise — not a lecture.\n\n"
        f"Response to review:\n{last.content}"
    ))

    try:
        result: ValidationResult = await validator_llm.ainvoke([system])
        if result and not result.approved and result.revised_response:
            revised = AIMessage(content=result.revised_response)
            return {"messages": state["messages"][:-1] + [revised]}
    except Exception:
        pass

    return {}


async def readiness_evaluator_node(state: State) -> dict:
    """
    Updates the readiness score and session themes after each turn.
    """
    msgs           = state.get("summarized_messages") or state["messages"]
    current_score  = state.get("readiness_score", 1)
    current_themes = state.get("session_themes", [])

    system = SystemMessage(content=(
        f"Current readiness score: {current_score}/10\n"
        f"Themes so far: {current_themes or 'none'}\n\n"
        "Update the readiness score based on the conversation so far. "
        "List any NEW psychological themes that emerged in the latest exchange.\n"
        "Increase the score only when genuine emotional depth or insight appears."
    ))

    try:
        assessment: ReadinessAssessment = await readiness_llm.ainvoke([system] + msgs)
        if assessment:
            merged = list(set(current_themes + assessment.new_themes))
            return {
                "readiness_score": max(1, min(10, assessment.score)),
                "session_themes":  merged,
            }
    except Exception:
        pass

    return {}


async def memory_writer_node(state: State, config: RunnableConfig, store: BaseStore) -> dict:
    """
    Extracts a structured insight and persists it to PostgresStore.
    Fired as a background task so the graph completes — and the SSE stream
    closes — immediately after the response is validated. Memory writes
    do NOT block the user from receiving their response.

    Quality gate: only writes if quality_score >= 0.65.
    """
    user_id   = config["configurable"]["user_id"]
    namespace = ("features", user_id)
    recent    = state["messages"][-6:]

    system = SystemMessage(content=(
        "Extract ONE long-term memory insight from this therapy exchange.\n\n"
        "Only save if the insight is:\n"
        "  - Genuinely new (not already obvious from prior context)\n"
        "  - Psychologically meaningful (a real theme, trigger, or pattern)\n"
        "  - Specific enough to be useful in a future session\n\n"
        "If nothing worth saving long-term happened this turn, set quality_score < 0.65."
    ))

    async def _write() -> None:
        try:
            insight: MemoryInsight = await memory_llm.ainvoke([system] + recent)
            if insight and insight.quality_score >= 0.65:
                await store.aput(
                    namespace,
                    f"insight_{int(time.time())}",
                    {
                        "theme":  insight.theme,
                        "detail": insight.detail,
                        "score":  insight.quality_score,
                    },
                )
        except Exception:
            pass  # Never let a background write crash the app

    asyncio.create_task(_write())
    return {}  # Return immediately — graph proceeds to END without waiting


# ---------------------------------------------------------------------------
# 5. Graph builder
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    """
    Constructs and wires the StateGraph. Does NOT compile (no DB deps yet).
    Call compile_graph() after the DB pool is open.
    """
    builder = StateGraph(State)

    builder.add_node("summarize",           summarization_node)
    builder.add_node("enhancer",            enhancer_node)
    builder.add_node("supervisor",          supervisor_node)
    builder.add_node("questioner",          questioner_node)
    builder.add_node("explainer",           explainer_node)
    builder.add_node("response_validator",  response_validator_node)
    builder.add_node("readiness_evaluator", readiness_evaluator_node)
    builder.add_node("memory_writer",       memory_writer_node)

    builder.add_edge(START,                 "summarize")
    builder.add_edge("summarize",           "enhancer")
    builder.add_edge("enhancer",            "supervisor")

    builder.add_conditional_edges(
        "supervisor",
        route_to_worker,
        {"questioner": "questioner", "explainer": "explainer"},
    )

    builder.add_edge("questioner",          "response_validator")
    builder.add_edge("explainer",           "response_validator")
    builder.add_edge("response_validator",  "readiness_evaluator")
    builder.add_edge("readiness_evaluator", "memory_writer")
    builder.add_edge("memory_writer",       END)

    return builder


# ---------------------------------------------------------------------------
# 6. Compiled graph  (initialized lazily via setup())
# ---------------------------------------------------------------------------

_app: CompiledGraph | None = None


def get_app() -> CompiledGraph:
    """Return the compiled graph. Raises if setup() has not been called."""
    if _app is None:
        raise RuntimeError("Workflow not initialized — call setup() first.")
    return _app


async def setup() -> None:
    """
    Compile the graph against the already-open DB pool.
    Called once inside FastAPI's lifespan, after setup_database().
    """
    global _app
    _app = build_graph().compile(
        checkpointer=get_checkpointer(),
        store=get_store(),
    )


# ---------------------------------------------------------------------------
# 7. Config helpers
# ---------------------------------------------------------------------------

def get_config(user_id: str, thread_id: str) -> dict:
    """
    Builds the LangGraph run config from user_id and thread_id.

    user_id   — comes from the authenticated JWT / session token.
    thread_id — comes from the URL param. A new thread_id starts a fresh
                session (new short-term memory). The same thread_id resumes
                an existing session from checkpoint. Long-term memory is
                always keyed to user_id regardless.
    """
    return {
        "configurable": {
            "user_id":   user_id,
            "thread_id": thread_id,
        }
    }


def get_initial_state(message: str) -> dict:
    """
    Minimal state for invoking the graph.
    LangGraph merges this with the existing checkpoint for the thread_id.
    """
    return {
        "messages":        [HumanMessage(content=message)],
        "readiness_score": 1,
        "session_themes":  [],
        "next_worker":     "questioner",
        "enhanced_query":  "",
        "is_new_user":     False,  # overwritten by enhancer node
    }


# ---------------------------------------------------------------------------
# 8. Streaming entry point
# ---------------------------------------------------------------------------

async def chat_stream(
    user_id: str,
    thread_id: str,
    message: str,
) -> AsyncIterator[str]:
    """
    Streams the therapist response token-by-token as JSON-encoded SSE lines.

    Yields:
        data: {"type": "token",  "content": "..."}\\n\\n
        data: {"type": "done",   "content": ""}\\n\\n
        data: {"type": "error",  "content": "..."}\\n\\n

    Only tokens from the worker nodes (questioner / explainer) are streamed.
    Structured-output nodes (supervisor, validator, readiness_evaluator) run
    silently. memory_writer is fired as a background task and does not block
    the stream from closing.
    """
    STREAMING_NODES = {"questioner", "explainer"}

    config = get_config(user_id, thread_id)
    state  = get_initial_state(message)

    try:
        async for chunk, metadata in get_app().astream(
            state,
            config=config,
            stream_mode="messages",
        ):
            node = metadata.get("langgraph_node", "")

            if node not in STREAMING_NODES:
                continue

            if isinstance(chunk, AIMessageChunk) and chunk.content:
                payload = json.dumps({"type": "token", "content": chunk.content})
                yield f"data: {payload}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'content': ''})}\n\n"

    except Exception as e:
        error_payload = json.dumps({"type": "error", "content": str(e)})
        yield f"data: {error_payload}\n\n"


# ---------------------------------------------------------------------------
# 9. Non-streaming fallback  (useful for testing / CLI)
# ---------------------------------------------------------------------------

async def chat(user_id: str, thread_id: str, message: str) -> str:
    """
    Awaitable single-response entry point. Collects the full streamed
    response and returns it as a plain string. Handy for unit tests.
    """
    parts = []
    async for line in chat_stream(user_id, thread_id, message):
        raw = line.removeprefix("data: ").strip()
        if not raw:
            continue
        try:
            event = json.loads(raw)
            if event["type"] == "token":
                parts.append(event["content"])
        except json.JSONDecodeError:
            pass
    return "".join(parts)
