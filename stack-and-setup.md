# stack-and-setup.md

## Tools to install before the event
- Python 3.11+ · Node.js 20+ · Git · PostgreSQL 15+ (or Docker) · VS Code · a Chromium browser (Chrome or Edge) for the camera
- Python packages: `fastapi uvicorn sqlalchemy psycopg2-binary pyjwt argon2-cffi python-multipart apscheduler pytest`
- Front-end: `npm create vite@latest frontend -- --template react`, then `@mediapipe/tasks-vision` (or `@mediapipe/face_mesh`)

## Start commands (fill in on the day)
```
# backend
cd backend && python -m venv .venv
# Windows: .venv\Scripts\activate    Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# front-end
cd frontend && npm install && npm run dev    # port 5173

# demo apps (plain static pages or tiny Vite apps)
App A on 5174, App B on 5175
```

## Environment file `.env` (never commit)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/sankalp
JWT_SECRET=<long random string>
ACCESS_TOKEN_MINUTES=10
SSO_SESSION_HOURS=8
INACTIVITY_DAYS=60
FRONTEND_ORIGIN=http://localhost:5173
```

## Ports
Backend 8000 · Central login 5173 · App A 5174 · App B 5175 · Postgres 5432

## Camera notes
Browsers allow the camera only on `localhost` or https. Keep everything on localhost for the demo. Good front light helps; avoid a bright window behind the face.

## Seed data for the demo
Admin (us), members Rahul and one more, two products (App A, App B), one test user with a term end in the past so the cleanup job has something to do.
