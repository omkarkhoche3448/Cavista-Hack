#!/usr/bin/env bash
set -e

# ──────────────────────────────────────────────
# run.sh — Setup & launch backend + frontend
# ──────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_DIR="$BACKEND_DIR/venv"

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
echo -e "${GREEN}  Frontend → http://localhost:5173${NC}"
echo ""

# Trap to kill both processes on exit
cleanup() {
    echo -e "\n${CYAN}Shutting down...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
cd "$BACKEND_DIR"
source "$VENV_DIR/bin/activate"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$ROOT_DIR"
npm run dev &
FRONTEND_PID=$!

# Wait for either to exit
wait -n $BACKEND_PID $FRONTEND_PID
cleanup
