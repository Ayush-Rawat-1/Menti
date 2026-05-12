"""
Auth routes.

POST /auth/google   — verify Google ID token, upsert user, issue token pair
POST /auth/refresh  — rotate refresh token, issue new access token
POST /auth/logout   — revoke refresh token, clear cookie
"""
import jwt
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, HTTPException, status
from fastapi.responses import JSONResponse
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import BaseModel

from config import settings
from database import (
    db_upsert_user,
    db_create_refresh_token,
    db_rotate_refresh_token,
    db_delete_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# Google request object — reused across calls, caches Google's public keys
_google_request = google_requests.Request()

# Cookie config — centralised so refresh and login set identical attributes
_COOKIE_CONFIG = {
    "key":      "refresh_token",
    "httponly": True,
    "secure":   False,       # HTTPS only — set False only in local dev
    "samesite": "lax",
    "max_age":  settings.refresh_token_expire_days * 24 * 60 * 60,
}


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class GoogleAuthRequest(BaseModel):
    """Credential from @react-oauth/google onSuccess callback."""
    credential: str


class AuthResponse(BaseModel):
    """Returned in response body after successful auth or refresh."""
    access_token: str
    user: dict  # id, name, email, avatar_url


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_access_token(user_id: str) -> str:
    """
    Issue a short-lived JWT signed with your own secret.
    Contains only what downstream needs — user_id in sub claim.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub":  user_id,
        "type": "access",       # guards against refresh tokens being used here
        "iat":  now,
        "exp":  now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)


def _set_refresh_cookie(response: JSONResponse, raw_token: str) -> None:
    """Attach the refresh token as an HttpOnly cookie to the response."""
    response.set_cookie(value=raw_token, **_COOKIE_CONFIG)


def _clear_refresh_cookie(response: JSONResponse) -> None:
    """Clear the refresh token cookie on logout."""
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="lax",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/google")
async def google_auth(request: GoogleAuthRequest):
    """
    Receive Google ID token from React, verify it, upsert user, issue token pair.

    Flow:
      1. Verify Google credential signature and audience
      2. Extract profile from decoded payload
      3. Upsert into users table (insert new or refresh profile for returning)
      4. Issue your own access token (JWT) + refresh token (random, stored as hash)
      5. Return access token in body, refresh token in HttpOnly cookie
    """
    # Step 1 — verify Google's signature
    try:
        google_payload = id_token.verify_oauth2_token(
            request.credential,
            _google_request,
            settings.google_client_id,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
        )

    # Step 2 — extract profile
    google_sub = google_payload.get("sub")
    email      = google_payload.get("email")
    name       = google_payload.get("name", "")
    avatar_url = google_payload.get("picture")

    if not google_sub or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incomplete Google profile",
        )

    # Step 3 — upsert user (one query handles both new and returning users)
    user = await db_upsert_user(google_sub, email, name, avatar_url)

    # Step 4 — issue your own tokens (Google is out of the picture from here)
    access_token = _create_access_token(user["user_id"])
    raw_refresh  = await db_create_refresh_token(user["user_id"], _refresh_token_expiry())

    # Step 5 — return
    response = JSONResponse({
        "access_token": access_token,
        "user": {
            "id":         user["user_id"],
            "name":       user["name"],
            "email":      user["email"],
            "avatar_url": user["avatar_url"],
        },
    })
    _set_refresh_cookie(response, raw_refresh)
    return response


@router.post("/refresh")
async def refresh_token(refresh_token: str | None = Cookie(default=None)):
    """
    Rotate the refresh token and issue a new access token.

    The browser sends the HttpOnly cookie automatically.
    React never touches the refresh token directly.

    Returns 401 if:
      - Cookie is missing
      - Token not found (never existed or already rotated — reuse detected)
      - Token is expired
    """
    if refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
        )

    result = await db_rotate_refresh_token(refresh_token, _refresh_token_expiry())

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id, new_raw_refresh = result
    new_access_token = _create_access_token(user_id)

    response = JSONResponse({"access_token": new_access_token})
    _set_refresh_cookie(response, new_raw_refresh)
    return response


@router.post("/logout")
async def logout(refresh_token: str | None = Cookie(default=None)):
    """
    Revoke the refresh token and clear the cookie.

    The access token expires naturally (max 15 min).
    For immediate access token invalidation a blocklist would be needed —
    not implemented here as 15 min window is acceptable for this app.
    """
    if refresh_token:
        await db_delete_refresh_token(refresh_token)

    response = JSONResponse({"message": "Logged out"})
    _clear_refresh_cookie(response)
    return response