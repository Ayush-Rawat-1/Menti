"""
FastAPI files for Memory-Augmented Therapist.

Development:
    fastapi dev files/main.py

Production:
    fastapi run files/main.py --host 0.0.0.0 --port 8000
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import chat, threads
from routes.auth import router as auth_router
from config import settings
from database import setup_database, teardown_database
from services.therapist_service import therapist_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup : open DB pool → run migrations → compile graph.
    Shutdown: close DB pool.

    Order matters — setup_database() must complete before therapist_service
    initializes so get_checkpointer() and get_store() are ready.
    """
    await setup_database(settings.database_url)
    await therapist_service.initialize()
    yield
    await teardown_database()


app = FastAPI(
    title="Mental Health Therapist API",
    description="Memory-Augmented Therapist powered by LangGraph",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — credentials (cookies) require explicit origins, never wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,      # required for HttpOnly cookie to be sent cross-origin
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)          # /auth/google, /auth/refresh, /auth/logout
app.include_router(chat.router)          # /threads/{id}/messages
app.include_router(threads.router)       # /threads


@app.get("/health")
async def health_check():
    return {"status": "healthy"}