"""
Chat API routes.

All routes are protected — user_id comes from the verified JWT via Depends.
Thread ownership is validated before streaming begins.
updated_at is bumped in the background only if this thread is not already
the most recent one (conditional write, see db_touch_thread).
"""
import asyncio
import json
from typing import AsyncIterator, List

from fastapi import APIRouter, Depends, HTTPException, Path, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.therapist_service import therapist_service
from database import db_touch_thread, db_get_thread
from dependencies import get_current_user

router = APIRouter(tags=["chat"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MessageRequest(BaseModel):
    message: str


class MessageResponse(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ConversationHistory(BaseModel):
    thread_id: str
    messages: List[MessageResponse]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/threads/{thread_id}/messages")
async def send_message(
    request: MessageRequest,
    thread_id: str = Path(...),
    user_id: str = Depends(get_current_user),
):
    """
    Send a message and stream the therapist's response token-by-token via SSE.

    Ownership is verified before the stream starts — a non-owner gets 404
    immediately, not after waiting for a response.

    SSE format:
        data: {"type": "token", "content": "..."}\\n\\n
        data: {"type": "done",  "content": ""}\\n\\n
    """
    # Verify ownership before doing any LLM work
    row = await db_get_thread(thread_id)
    if row is None or row["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    return StreamingResponse(
        _stream_response(user_id, thread_id, request.message),
        media_type="text/event-stream",
    )


@router.get("/threads/{thread_id}/messages", response_model=ConversationHistory)
async def get_conversation_history(
    thread_id: str = Path(...),
    user_id: str = Depends(get_current_user),
):
    """
    Get full conversation history from the LangGraph checkpoint.
    Returns all human + AI messages in chronological order.
    """
    # Verify ownership
    row = await db_get_thread(thread_id)
    if row is None or row["user_id"] != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    messages = await therapist_service.get_conversation_history(user_id, thread_id)
    return ConversationHistory(
        thread_id=thread_id,
        messages=[MessageResponse(role=m["role"], content=m["content"]) for m in messages],
    )


# ---------------------------------------------------------------------------
# Internal streaming helper
# ---------------------------------------------------------------------------

async def _stream_response(
    user_id: str,
    thread_id: str,
    message: str,
) -> AsyncIterator[str]:
    """
    Thin wrapper around therapist_service.chat_stream.

    On the first token, schedules a background task to conditionally bump
    updated_at — only fires a DB write if this thread is not already the
    most recent one for the user (see db_touch_thread).

    The graph owns all message and memory persistence.
    """
    touch_scheduled = False

    try:
        async for line in therapist_service.chat_stream(user_id, thread_id, message):
            if not touch_scheduled:
                asyncio.create_task(db_touch_thread(thread_id, user_id))
                touch_scheduled = True
            yield line

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"