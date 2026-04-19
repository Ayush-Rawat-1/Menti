"""
Thread management API routes.

All routes are protected — user_id comes from the verified JWT via Depends,
never from a query parameter.
Thread ownership is validated on every single-thread operation.
"""
from uuid import uuid7
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path, status
from pydantic import BaseModel

from database import (
    db_create_thread,
    db_get_thread,
    db_list_threads,
    db_delete_thread,
)
from dependencies import get_current_user

router = APIRouter(tags=["threads"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ThreadResponse(BaseModel):
    """Full thread info returned to client."""
    id: str
    user_id: str
    updated_at: str


class ThreadListItem(BaseModel):
    """Compact thread info for sidebar listing."""
    id: str
    updated_at: str


# ---------------------------------------------------------------------------
# Ownership guard
# ---------------------------------------------------------------------------

async def _assert_owner(thread_id: str, user_id: str) -> dict:
    """
    Fetch thread and verify ownership. Raises 404 if not found, 403 if wrong user.
    Returns the thread row so callers don't need a second lookup.
    """
    row = await db_get_thread(thread_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    if row["user_id"] != user_id:
        # Return 404 not 403 — don't reveal that the thread exists to other users
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    return row


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/threads", response_model=List[ThreadListItem])
async def list_threads(user_id: str = Depends(get_current_user)):
    """
    List all threads for the authenticated user, newest activity first.
    Index-only scan — never touches the table heap.
    """
    rows = await db_list_threads(user_id)
    return [
        ThreadListItem(
            id=r["thread_id"],
            updated_at=r["updated_at"].isoformat(),
        )
        for r in rows
    ]


@router.post("/threads", response_model=ThreadResponse, status_code=201)
async def create_thread(user_id: str = Depends(get_current_user)):
    """
    Create a new conversation thread.

    thread_id is UUIDv7 — time-ordered so B-tree inserts are sequential,
    and creation time is derivable from the ID itself (no created_at column needed).
    """
    thread_id = uuid7()
    row = await db_create_thread(thread_id, user_id)
    return ThreadResponse(
        id=row["thread_id"],
        user_id=row["user_id"],
        updated_at=row["updated_at"].isoformat(),
    )


@router.get("/threads/{thread_id}", response_model=ThreadResponse)
async def get_thread(
    thread_id: str = Path(...),
    user_id: str = Depends(get_current_user),
):
    """
    Get a specific thread. Returns 404 if not found or not owned by caller.
    Direct primary key lookup — O(log n).
    """
    row = await _assert_owner(thread_id, user_id)
    return ThreadResponse(
        id=row["thread_id"],
        user_id=row["user_id"],
        updated_at=row["updated_at"].isoformat(),
    )


@router.delete("/threads/{thread_id}", status_code=200)
async def delete_thread(
    thread_id: str = Path(...),
    user_id: str = Depends(get_current_user),
):
    """
    Delete a thread. Returns 404 if not found or not owned by caller.
    Ownership is verified before deletion.
    """
    await _assert_owner(thread_id, user_id)
    await db_delete_thread(thread_id)
    return {"success": True, "thread_id": thread_id}