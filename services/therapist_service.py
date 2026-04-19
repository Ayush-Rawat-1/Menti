"""
Therapist service — thin wrapper around the workflow graph.

Provides a clean service boundary between the FastAPI routes and the
LangGraph workflow so the routes never import workflow internals directly.
"""
from typing import AsyncIterator, List, Dict

import workflow as workflow


class TherapistService:
    """
    Wraps the compiled workflow graph for FastAPI integration.

    initialize() is called exactly once inside FastAPI's lifespan handler,
    which guarantees single-call semantics without any flag bookkeeping.
    """

    async def initialize(self) -> None:
        """
        Compile the graph against the open DB pool.
        Must be called after setup_database() and before serving requests.
        """
        await workflow.setup()

    async def chat_stream(
        self, user_id: str, thread_id: str, message: str
    ) -> AsyncIterator[str]:
        """Stream therapist response token-by-token via SSE."""
        async for line in workflow.chat_stream(user_id, thread_id, message):
            yield line

    async def chat(self, user_id: str, thread_id: str, message: str) -> str:
        """Return the full therapist response as a single string (for tests/CLI)."""
        return await workflow.chat(user_id, thread_id, message)

    async def get_conversation_history(
        self, user_id: str, thread_id: str
    ) -> List[Dict[str, str]]:
        """
        Fetch conversation history from the LangGraph checkpoint.
        Returns a list of {"role": "user"|"assistant", "content": "..."} dicts.
        System messages are skipped.
        """
        config = workflow.get_config(user_id, thread_id)
        checkpoint = await workflow.get_app().checkpointer.aget(config=config)

        if checkpoint is None or checkpoint.get("channel_values") is None:
            return []

        messages = checkpoint["channel_values"].get("messages", [])
        result = []
        for msg in messages:
            msg_type = getattr(msg, "type", None)
            if msg_type == "system":
                continue
            role = "user" if msg_type == "human" else "assistant" if msg_type == "ai" else "unknown"
            result.append({"role": role, "content": getattr(msg, "content", "")})

        return result


therapist_service = TherapistService()
