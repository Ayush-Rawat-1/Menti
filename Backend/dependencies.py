"""
FastAPI dependencies.

get_current_user is the single auth dependency used by every protected route.
It verifies the JWT, extracts user_id, and injects it into the route handler.
No DB call — pure local JWT verification.
"""
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from config import settings

_bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    """
    Verify the Bearer JWT and return the user_id (sub claim).

    Raises 401 if:
      - Authorization header is missing (HTTPBearer handles this)
      - Token signature is invalid
      - Token is expired
      - Token type is not "access" (guards against using refresh token as access token)

    Used as: user_id: str = Depends(get_current_user)
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise credentials_exception

    # Ensure this is an access token — prevents refresh tokens being used here
    if payload.get("type") != "access":
        raise credentials_exception

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    return user_id