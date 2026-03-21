# SEVAमित्र — Deploy-ready Full Stack

## What’s in this repo
- `frontend` (Vite + React): `src/`
- `backend` (FastAPI + Supabase + S3): `backend/app/`
- `ai` (FastAPI + Gemini + optional transcription): `ai/app/`

## 1) Environment files
Create these from the examples:
- Frontend: copy `.env.example` → `.env`
- Backend: copy `backend/.env.example` → `backend/.env`
- AI: copy `ai/.env.example` → `ai/.env`

## 2) Database setup (Supabase)
Run **one** of these in Supabase SQL editor:
- Fresh project: run `backend/db/schema.sql`
- Existing project: run `backend/db/migrate_to_public.sql`

## 3) Run locally (Docker)
```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- AI: `http://localhost:8001`

## 4) Run locally (without Docker)
```bash
./run.sh
```
Note: the AI service is started via Docker in the recommended path above; if you want it locally too, run:
```bash
cd ai
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

## Notes
- Keep **service role** keys on the backend only. Never expose them to the frontend.
- For production, set `CORS_ORIGINS` to your deployed frontend URL(s).
