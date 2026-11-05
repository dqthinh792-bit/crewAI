# CrewAI Web App

A standalone web application inside the CrewAI repository. It leaves the original framework under `lib/` untouched.

## Features

- Admin login using an HTTP-only signed session cookie.
- Dashboard with service and model-key status.
- Run a sample two-agent CrewAI workflow (researcher -> writer).
- SQLite task history.
- Provider credentials stay on the backend and are read from environment variables.

## Requirements

- Python 3.10–3.13
- Node.js 20+
- An OpenAI API key for real agent runs

## Run locally

1. Copy `.env.example` to `.env` and set strong values for `APP_PASSWORD` and `SESSION_SECRET`. Add `OPENAI_API_KEY` to enable real AI runs.
2. Start the backend:

```bash
cd web-app/backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

3. In another terminal, start the frontend:

```bash
cd web-app/frontend
npm install
npm run dev
```

4. Open http://localhost:5173 and sign in with the username/password configured in `.env` (default username: `admin`).

The Vite dev server proxies `/api` to the backend at http://localhost:8000.

## Docker

From the repository root:

```bash
docker compose -f web-app/compose.yaml up --build
```

Then open http://localhost:8080. Configure the same environment variables in `web-app/.env` (or export them in your shell).

## Environment variables

| Variable | Purpose |
|---|---|
| `APP_USERNAME` | Admin username (default: `admin`) |
| `APP_PASSWORD` | Admin password; required for login |
| `SESSION_SECRET` | Random secret used to sign session cookies |
| `OPENAI_API_KEY` | Provider API key; backend only |
| `OPENAI_MODEL` | CrewAI model name (default: `openai/gpt-4o-mini`) |
| `DATABASE_PATH` | SQLite file path (default: `./data/crewai_web.db`) |
| `COOKIE_SECURE` | Set `true` when serving over HTTPS |

## Authentication and credential flow

1. The browser posts the admin username/password to `POST /api/auth/login`.
2. The backend compares credentials against environment variables and sets a signed, HTTP-only, SameSite=Lax session cookie.
3. Protected API routes check that server-side session state.
4. CrewAI reads `OPENAI_API_KEY` from the backend process environment. The key is never returned by any API endpoint or sent to frontend code.

This is a lightweight single-admin login for a local MVP, not a multi-user identity platform. For public production deployment, add HTTPS, rate limiting, CSRF protection appropriate to the deployment, secret management, audit logging, and a mature identity provider.

## API

- `GET /api/health` — public health check
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/dashboard` — requires login
- `GET /api/history` — requires login
- `POST /api/runs` — requires login; starts the two-agent CrewAI workflow

## Notes

- The framework repository is a monorepo. This app has its own dependency files and does not change the root workspace configuration.
- A real run requires a valid provider key and may incur provider charges.
