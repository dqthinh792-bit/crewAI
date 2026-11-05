from __future__ import annotations

import os
import secrets
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

from crewai import Agent, Crew, Process, Task
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

APP_USERNAME = os.getenv("APP_USERNAME", "admin")
APP_PASSWORD = os.getenv("APP_PASSWORD", "")
SESSION_SECRET = os.getenv("SESSION_SECRET", "")
MODEL_NAME = os.getenv("OPENAI_MODEL", "openai/gpt-4o-mini")
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", "./data/crewai_web.db"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


@contextmanager
def get_connection():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                status TEXT NOT NULL,
                result TEXT,
                error TEXT,
                created_at TEXT NOT NULL
            )
            """
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="CrewAI Web App API",
    version="0.1.0",
    description="A standalone web interface for running CrewAI workflows.",
    lifespan=lifespan,
)

app.add_middleware(
    SessionMiddleware,
    # Keep session access well-defined even when configuration is missing.
    # Protected endpoints still reject requests until SESSION_SECRET is set.
    secret_key=SESSION_SECRET or secrets.token_urlsafe(32),
    session_cookie="crewai_web_session",
    same_site="lax",
    https_only=COOKIE_SECURE,
    max_age=60 * 60 * 8,
)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=500)


class RunRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    objective: str = Field(
        default="Create a concise, useful report with key findings and recommendations.",
        min_length=10,
        max_length=1000,
    )


def require_login(request: Request) -> None:
    if not SESSION_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Set SESSION_SECRET in web-app/.env before using the application.",
        )
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in.")


Authenticated = Annotated[None, Depends(require_login)]


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "CrewAI Web App"}


@app.post("/api/auth/login")
async def login(payload: LoginRequest, request: Request) -> dict[str, Any]:
    if not SESSION_SECRET or not APP_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Configure SESSION_SECRET and APP_PASSWORD in web-app/.env.",
        )
    valid_user = secrets.compare_digest(payload.username, APP_USERNAME)
    valid_password = secrets.compare_digest(payload.password, APP_PASSWORD)
    if not (valid_user and valid_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")
    request.session.clear()
    request.session["authenticated"] = True
    request.session["username"] = APP_USERNAME
    return {"authenticated": True, "username": APP_USERNAME}


@app.get("/api/auth/me")
async def current_user(request: Request) -> dict[str, Any]:
    if not request.session.get("authenticated"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in.")
    return {"authenticated": True, "username": request.session.get("username", APP_USERNAME)}


@app.post("/api/auth/logout")
async def logout(request: Request) -> dict[str, bool]:
    request.session.clear()
    return {"authenticated": False}


@app.get("/api/dashboard")
async def dashboard(_: Authenticated) -> dict[str, Any]:
    with get_connection() as connection:
        total = connection.execute("SELECT COUNT(*) FROM runs").fetchone()[0]
        completed = connection.execute("SELECT COUNT(*) FROM runs WHERE status = 'completed'").fetchone()[0]
        recent = connection.execute(
            "SELECT id, topic, status, created_at FROM runs ORDER BY id DESC LIMIT 5"
        ).fetchall()
    return {
        "total_runs": total,
        "completed_runs": completed,
        "model": MODEL_NAME,
        "provider_key_configured": bool(os.getenv("OPENAI_API_KEY")),
        "recent_runs": [dict(row) for row in recent],
    }


@app.get("/api/history")
async def history(_: Authenticated) -> dict[str, Any]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, topic, status, result, error, created_at FROM runs ORDER BY id DESC LIMIT 100"
        ).fetchall()
    return {"items": [dict(row) for row in rows]}


def execute_crew(topic: str, objective: str) -> str:
    researcher = Agent(
        role="Research Analyst",
        goal=f"Investigate {topic} and identify reliable, relevant findings.",
        backstory="You are a careful analyst who separates facts from assumptions and organizes evidence.",
        llm=MODEL_NAME,
        verbose=False,
    )
    writer = Agent(
        role="Report Writer",
        goal="Turn research into a clear, structured report.",
        backstory="You write concise reports with practical recommendations and explicit caveats.",
        llm=MODEL_NAME,
        verbose=False,
    )
    research_task = Task(
        description=(
            "Research the following topic: {topic}. Identify the main concepts, important developments, "
            "benefits, limitations, and practical examples. Do not invent citations or facts."
        ),
        expected_output="A structured research brief with key findings and caveats.",
        agent=researcher,
    )
    writing_task = Task(
        description=(
            "Using the research brief, fulfill this objective: {objective}. "
            "Write a readable report with a title, summary, findings, and recommendations."
        ),
        expected_output="A well-organized report in Markdown.",
        agent=writer,
        context=[research_task],
    )
    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, writing_task],
        process=Process.sequential,
        verbose=False,
    )
    result = crew.kickoff(inputs={"topic": topic, "objective": objective})
    return str(result)


@app.post("/api/runs")
async def create_run(payload: RunRequest, _: Authenticated) -> dict[str, Any]:
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OPENAI_API_KEY is not configured on the backend. Add it to web-app/.env and restart the server.",
        )

    created_at = datetime.now(timezone.utc).isoformat()
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO runs (topic, status, created_at) VALUES (?, 'running', ?)",
            (payload.topic, created_at),
        )
        run_id = cursor.lastrowid

    try:
        result = await run_in_threadpool(execute_crew, payload.topic, payload.objective)
        with get_connection() as connection:
            connection.execute(
                "UPDATE runs SET status = 'completed', result = ? WHERE id = ?",
                (result, run_id),
            )
        return {"id": run_id, "status": "completed", "result": result}
    except Exception as exc:
        safe_error = f"{type(exc).__name__}: {exc}"[:1500]
        with get_connection() as connection:
            connection.execute(
                "UPDATE runs SET status = 'failed', error = ? WHERE id = ?",
                (safe_error, run_id),
            )
        raise HTTPException(status_code=502, detail=f"CrewAI run failed: {safe_error}") from exc
