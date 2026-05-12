# Mental Health Therapist API

A memory-augmented AI therapist backend built with FastAPI and LangGraph. The system maintains both short-term session context and long-term memory across conversations, streams responses token by token, and handles authentication via Google OAuth with a full JWT session management system.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Design](#database-design)
- [Authentication Flow](#authentication-flow)
- [LangGraph Workflow](#langgraph-workflow)
- [Streaming](#streaming)
- [Memory System](#memory-system)
- [API Reference](#api-reference)
- [Getting Started](#getting-started)
- [Design Decisions](#design-decisions)

---

## Architecture Overview

```
React Frontend
      │
      │  Bearer token (every request)
      │  HttpOnly cookie (refresh only)
      ▼
FastAPI Backend
      │
      ├── Auth layer (JWT verification — no DB call)
      │
      ├── /auth/*        Google OAuth, token issuance, refresh, logout
      ├── /threads/*     Thread metadata CRUD
      └── /threads/{id}/messages/*   Chat + SSE streaming
                │
                ▼
        LangGraph Graph
                │
                ├── Short-term memory → AsyncPostgresSaver (checkpoint)
                │                       keyed by thread_id
                │
                └── Long-term memory  → AsyncPostgresStore
                                        keyed by user_id
                │
                ▼
          Postgres DB
          ├── users           (application table)
          ├── threads         (application table)
          ├── refresh_tokens  (application table)
          ├── checkpoints     (LangGraph managed)
          └── store           (LangGraph managed)
```

Every request goes through the auth dependency first. JWT verification is pure local computation — no database call, no network call. The hot path (every API request) never touches the database for auth. Only the refresh endpoint does a single hash lookup.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | FastAPI (Python 3.14) |
| Package manager | uv |
| Graph runtime | LangGraph |
| LLM | GPT-4o-mini via OpenRouter |
| Database | PostgreSQL (async via psycopg3) |
| Connection pool | psycopg-pool AsyncConnectionPool |
| Checkpoint store | LangGraph AsyncPostgresSaver |
| Long-term store | LangGraph AsyncPostgresStore |
| Short-term memory | langmem SummarizationNode |
| Auth — JWT | PyJWT with [crypto] extra |
| Auth — Google | google-auth |
| Streaming | Server-Sent Events (SSE) |

---

## Project Structure

```
backend/
├── main.py                  # FastAPI app, lifespan, CORS, router registration
├── config.py                # Pydantic settings, reads from .env
├── database.py              # Pool, checkpointer, store, all CRUD helpers
├── dependencies.py          # get_current_user FastAPI dependency
│
├── routes/
│   ├── auth.py              # /auth/google, /auth/refresh, /auth/logout
│   ├── threads.py           # /threads CRUD
│   └── chat.py              # /threads/{id}/messages SSE + history
│
└── workflow.py              # LangGraph graph definition and entry points

services/
└── therapist_service.py     # Thin wrapper between routes and workflow
```

### Responsibility boundaries

**`database.py`** is the single source of truth for everything database-related. The pool, checkpointer, store, all three application tables, and every SQL helper live here. Routes never write raw SQL — they call named helpers.

**`workflow.py`** owns the entire LangGraph graph. It exposes three things to the rest of the app: `setup()` to compile the graph after the pool is open, `get_app()` to access the compiled graph, and `chat_stream()` as the streaming entry point. No route file imports LangGraph directly.

**`dependencies.py`** contains only `get_current_user`. It has no business logic, no DB calls, no awareness of what the route does. It reads the JWT, verifies the signature, returns the `user_id`. Routes declare `user_id: str = Depends(get_current_user)` and receive a verified identity.

**`therapist_service.py`** exists as a clean boundary so routes never import workflow internals. It wraps `chat_stream`, `chat`, and `get_conversation_history`.

---

## Database Design

### Application tables

**`users`**
```sql
user_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid()
google_sub  TEXT        UNIQUE NOT NULL   -- Google's stable identifier
email       TEXT        UNIQUE NOT NULL
name        TEXT        NOT NULL
avatar_url  TEXT
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

`google_sub` is the upsert conflict target, not `user_id`. Google's `sub` claim never changes even if a user changes their email. `user_id` is never touched on update so all existing JWTs remain valid after a profile change.

**`threads`**
```sql
thread_id   TEXT        PRIMARY KEY          -- UUIDv7, encodes creation time
user_id     UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

No `created_at` column — UUIDv7 encodes the creation timestamp in its first 48 bits. Thread IDs are time-ordered so B-tree inserts are always sequential, avoiding page splits.

```sql
CREATE INDEX idx_threads_last_active
    ON threads (user_id, updated_at DESC)
    INCLUDE (thread_id);
```

The covering index makes `GET /threads` an index-only scan — Postgres never touches the table heap. The `INCLUDE (thread_id)` eliminates the heap fetch entirely.

**`refresh_tokens`**
```sql
token_hash  TEXT        PRIMARY KEY   -- SHA-256 of raw token, never stored raw
user_id     UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
expires_at  TIMESTAMPTZ NOT NULL
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Raw refresh tokens are never stored. Only the SHA-256 hash is persisted. A breached database yields useless hashes with no way to reconstruct the raw tokens.

### LangGraph tables

LangGraph manages its own checkpoint and store tables via `await checkpointer.setup()` and `await store.setup()` during startup. These are not modified directly.

---

## Authentication Flow

### First login

```
React: user clicks "Sign in with Google"
  → @react-oauth/google shows popup, user approves
  → Google returns a signed ID token (JWT) to React
  → React POST /auth/google { credential: "<google_id_token>" }

Backend:
  → PyJWT PyJWKClient fetches Google's public keys (cached, refreshed ~daily)
  → Verifies RS256 signature, expiry, audience (your client_id)
  → Decodes payload: sub, email, name, picture
  → Upserts user into users table (INSERT ... ON CONFLICT DO UPDATE)
  → Creates access token  — your own HS256 JWT, 15 min expiry
  → Creates refresh token — cryptographically random 64-byte string
  → Stores SHA-256(refresh_token) in refresh_tokens table
  → Returns: { access_token, user } in body
  →          refresh_token in HttpOnly Secure SameSite=Lax cookie
```

After this point Google is out of the picture entirely. Your system issues and manages sessions independently.

### Subsequent requests

```
React sends: Authorization: Bearer <access_token>
Backend: jwt.decode(token, jwt_secret) — local, no DB, microseconds
         extracts user_id from sub claim
         injects into route handler via Depends(get_current_user)
```

### Token refresh (every 15 minutes, silent)

```
Access token expires → Axios interceptor catches 401
  → POST /auth/refresh (browser sends cookie automatically)
  → Backend: hash incoming token, look up in DB
  → Delete old token, insert new token (rotation)
  → Return new access token in body + new refresh token in cookie
  → Interceptor retries original request transparently
  → User notices nothing
```

### Token rotation security property

Each refresh token is single-use. After it is used it is deleted immediately. If an attacker steals a refresh token and tries to use it after the legitimate user already rotated it, the lookup fails — the token no longer exists. This is reuse detection. On detection you can call `db_delete_all_user_tokens(user_id)` to revoke all sessions for that user.

### Logout

```
POST /auth/logout
  → Backend deletes refresh token from DB
  → Clears the cookie
  → Access token expires naturally within 15 minutes
```

---

## LangGraph Workflow

### Graph topology

```
START
  └─► summarize           SummarizationNode — compresses session history when
  │                        token count exceeds threshold. Uses langmem
  │                        RunningSummary to maintain a rolling session summary.
  │
  └─► enhancer            Builds the [THERAPIST CONTEXT] block injected into
  │                        every downstream node. Reads short-term summary
  │                        from state and long-term memories from PostgresStore.
  │                        Derives is_new_user dynamically — callers never pass it.
  │
  └─► supervisor          Routes to questioner or explainer. Hard-gates to
  │       │                questioner below readiness score 4 (no LLM call).
  │       │                Above 4 uses structured output SupervisorDecision.
  │       │
  │       ├─► questioner  Asks ONE purposeful therapeutic question.
  │       │                Streams tokens — user sees this output.
  │       │
  │       └─► explainer   Delivers ONE targeted CBT technique or reframe.
  │                        Streams tokens — user sees this output.
  │
  └─► response_validator  Quality gate. Checks tone, safety, appropriate length.
  │                        Replaces last AI message if it fails.
  │
  └─► readiness_evaluator Updates readiness score (1-10) and session themes.
  │                        Stays inline — its output affects the next turn's
  │                        supervisor routing via checkpoint state.
  │
  └─► memory_writer       Extracts a structured insight via LLM.
                           Quality gate: only writes if score >= 0.65.
                           Fired as asyncio.create_task — does NOT block
                           the stream. Graph hits END immediately, SSE closes,
                           user gets their response. Memory write happens in
                           the background.
```

### Why memory_writer is backgrounded

The memory write involves an LLM call (structured output extraction) followed by a Postgres write. Both add latency. The user has already received their response — there is no reason to make them wait for a background administrative task. `asyncio.create_task` fires the write concurrently and the graph completes immediately.

`readiness_evaluator` intentionally stays inline despite also being a post-response node. Its output updates `readiness_score` and `session_themes` in the checkpoint, which the supervisor reads at the start of the next turn to make routing decisions. If it were backgrounded, the next message could arrive before the score is persisted, causing stale routing.

### Compilation

The graph is compiled once during FastAPI startup after the database pool is open:

```python
# main.py lifespan
await setup_database(settings.database_url)   # pool open, tables created
await therapist_service.initialize()           # compiles graph with pool
```

`workflow.py` exposes `get_app()` which raises if called before `setup()`. This prevents the graph from being used before the pool is ready.

---

## Streaming

The chat endpoint returns a `StreamingResponse` with `media_type="text/event-stream"`.

### SSE format

```
data: {"type": "token",  "content": "Hello"}\n\n
data: {"type": "token",  "content": " there"}\n\n
data: {"type": "done",   "content": ""}\n\n
data: {"type": "error",  "content": "..."}\n\n
```

### Why nodes do not need astream

`graph.astream(stream_mode="messages")` injects a streaming callback into the LangGraph run config automatically. Nodes that call `llm.ainvoke()` have their tokens intercepted by this callback and surfaced as `AIMessageChunk` objects through the graph's async iterator. Changing nodes to use `astream` would cause double processing — the node would reassemble chunks into a message while LangGraph simultaneously tries to stream from the same call.

Only tokens from `questioner` and `explainer` are forwarded to the client. Structured output nodes (`supervisor`, `response_validator`, `readiness_evaluator`) produce `AIMessage` objects with no streaming content and are filtered by checking `metadata["langgraph_node"]`.

### Thread touch optimization

On the first token of each response, a background task fires `db_touch_thread(thread_id, user_id)`. This updates `updated_at` to keep the sidebar ordering correct. The update is conditional:

```sql
UPDATE threads SET updated_at = NOW()
WHERE thread_id = %s
AND thread_id != (
    SELECT thread_id FROM threads
    WHERE user_id = %s
    ORDER BY updated_at DESC
    LIMIT 1
)
```

If this thread is already the most recently active one, the subquery finds it and the WHERE condition is false — no write happens. During an active session this means only the first message pays a write cost. Every subsequent message in the same session is a free no-op.

---

## Memory System

### Short-term memory (session)

LangGraph's `AsyncPostgresSaver` stores the full graph state as a checkpoint after each run, keyed by `thread_id`. On the next message, LangGraph loads the checkpoint and merges the new state on top. This gives the graph full access to all messages from the current session.

`langmem.SummarizationNode` compresses this history when token count exceeds the threshold (768 tokens). It maintains a `RunningSummary` in the `context` state field. The `enhancer` node reads this summary and injects it into the context block. This prevents context window overflow on long sessions while retaining the gist of what was discussed.

### Long-term memory (cross-session)

`AsyncPostgresStore` persists structured insights across sessions, keyed by `("features", user_id)`. The `memory_writer` node extracts one insight per turn via structured LLM output. The `MemoryInsight` schema has a `quality_score` field — only scores >= 0.65 are persisted. This prevents low-value observations from accumulating.

The `enhancer` node reads all stored insights for the user at the start of each turn and injects them as "Past session themes" into the context block. New users get "No previous sessions" and the graph adjusts its approach accordingly (`is_new_user` flag).

---

## API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/auth/google` | Verify Google credential, issue token pair |
| POST | `/auth/refresh` | Rotate refresh token, issue new access token |
| POST | `/auth/logout` | Revoke refresh token, clear cookie |

### Threads

| Method | Path | Description |
|---|---|---|
| GET | `/threads` | List all threads for authenticated user |
| POST | `/threads` | Create new thread |
| GET | `/threads/{thread_id}` | Get single thread |
| DELETE | `/threads/{thread_id}` | Delete thread |

### Chat

| Method | Path | Description |
|---|---|---|
| POST | `/threads/{thread_id}/messages` | Send message, stream SSE response |
| GET | `/threads/{thread_id}/messages` | Get conversation history |

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |

All routes except `/auth/*` and `/health` require `Authorization: Bearer <access_token>`.

---

## Getting Started

### Prerequisites

- Python 3.14
- PostgreSQL 14+
- uv package manager

### Installation

```bash
# Clone the repository and switch to the backend branch
git clone https://github.com/Ayush-Rawat-1/Menti.git
cd Menti
git checkout backend

# Install dependencies
uv sync

# Copy environment file and fill in your values
cp .env.example .env

# Run development server
fastapi dev backend/main.py
```

### Production

```bash
fastapi run backend/main.py --host 0.0.0.0 --port 8000
```

---

## Design Decisions

**Why UUIDv7 for thread IDs**
UUIDv4 is fully random, causing B-tree page splits on every insert as new IDs land randomly across the index. UUIDv7 is time-ordered — new IDs are always larger than old ones, so inserts always go to the rightmost B-tree page. Sequential inserts, dense index, no fragmentation. Python 3.14 supports `uuid.uuid7()` natively in the stdlib.

**Why no created_at on threads**
UUIDv7 encodes the creation timestamp in its first 48 bits. A separate `created_at` column would be redundant — you can always derive creation time from the ID itself. One less column to write on insert.

**Why the conditional updated_at update**
`updated_at` exists only to order threads in the sidebar by most recent activity. During an active session the thread is already at the top — updating the timestamp changes nothing about the ordering. The conditional subquery skips the write entirely when the thread is already most recent. Therapy sessions involve many turns; without this optimization every message would pay an unnecessary index write.

**Why refresh tokens are not JWTs**
JWTs are stateless — there is nothing to revoke. A refresh token stored in the database can be deleted, which equals instant revocation. This is necessary for logout, forced session termination, and reuse detection. The raw token is never stored — only its SHA-256 hash. A breached database cannot reconstruct the raw tokens.

**Why memory_writer is backgrounded but readiness_evaluator is not**
Both run after the response is delivered to the user. The difference is what their output feeds. `readiness_evaluator` writes to the checkpoint — the supervisor reads this score at the start of the next turn to decide routing. If backgrounded, the next message could arrive before the score is checkpointed, causing stale routing. `memory_writer` writes to the long-term store — the `enhancer` reads this at the start of each turn, but only for context enrichment, not hard routing decisions. A one-turn delay in memory persistence is acceptable. A one-turn delay in readiness scoring would cause misrouting.

**Why one pool for everything**
LangGraph's checkpointer, store, and application tables all share the same `AsyncConnectionPool`. Connection pools are expensive to create and maintain. A single pool with appropriate sizing (default min/max) handles all workloads. The pool uses `autocommit=True` and `prepare_threshold=0` as required by LangGraph's async Postgres drivers.