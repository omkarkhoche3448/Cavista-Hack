#!/usr/bin/env bash
set -e

# ──────────────────────────────────────────────
# run.sh — Setup & launch backend + frontend
# ──────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/venv"
AI_DIR="$ROOT_DIR/ai"
AI_VENV_DIR="$AI_DIR/venv"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}▶ Setting up backend...${NC}"

# Create virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${GREEN}  Creating Python virtual environment...${NC}"
    python3 -m venv "$VENV_DIR"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# Install backend dependencies
echo -e "${GREEN}  Installing Python dependencies...${NC}"
pip install --upgrade pip -q
pip install -r "$BACKEND_DIR/requirements.txt" -q

echo -e "${CYAN}▶ Setting up frontend...${NC}"

# Install frontend dependencies
cd "$ROOT_DIR"
echo -e "${GREEN}  Running npm install...${NC}"
npm install

# ──────────────────────────────────────────────
# Launch both servers
# ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Starting backend (uvicorn) and frontend (vite)...${NC}"
echo -e "${GREEN}  Backend  → http://localhost:8000${NC}"
echo -e "${GREEN}  AI       → http://localhost:8001${NC}"
echo -e "${GREEN}  Frontend → http://localhost:5173${NC}"
echo ""

# Trap to kill both processes on exit
cleanup() {
    echo -e "\n${CYAN}Shutting down...${NC}"
    kill $BACKEND_PID $AI_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $AI_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
cd "$BACKEND_DIR"
source "$VENV_DIR/bin/activate"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start AI (optional heavy deps; disable by setting START_AI=0)
START_AI="${START_AI:-1}"
if [ "$START_AI" = "1" ]; then
  echo -e "${CYAN}▶ Starting AI service...${NC}"
  if [ ! -d "$AI_VENV_DIR" ]; then
      echo -e "${GREEN}  Creating AI virtual environment...${NC}"
      python3 -m venv "$AI_VENV_DIR"
  fi
  source "$AI_VENV_DIR/bin/activate"
  pip install --upgrade pip -q
  pip install -r "$AI_DIR/requirements.txt" -q
  cd "$AI_DIR"
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8001 &
  AI_PID=$!
else
  AI_PID=""
fi

# Start frontend
cd "$ROOT_DIR"
npm run dev &
FRONTEND_PID=$!

# Wait for either to exit
wait -n $BACKEND_PID $FRONTEND_PID
cleanup
