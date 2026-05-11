"""
Sentinel API Service — Authentication Middleware
"""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .jwt_handler import verify_access_token

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict[str, str]:
    """Extract and validate the current user from the JWT token."""
    payload = verify_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {
        "user_id": payload["sub"],
        "email": payload.get("email", ""),
        "role": payload.get("role", "viewer"),
    }


def get_token_from_query(request: Request) -> str | None:
    """Extract JWT token from query parameters (for SSE connections)."""
    return request.query_params.get("token")
