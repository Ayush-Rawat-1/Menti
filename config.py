from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str

    # Google OAuth
    google_client_id: str

    # JWT — used to sign and verify your own access tokens
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    # Frontend URL — needed for CORS and cookie domain
    frontend_url: str

    # OpenRouter
    openrouter_api_key: str

    # LangSmith tracing (optional)
    langchain_tracing_v2: bool = False
    langchain_endpoint: str | None = None
    langchain_api_key: str | None = None
    langchain_project: str | None = None

    class Config:
        env_file = ".env"


settings = Settings()