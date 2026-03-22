#!/usr/bin/env bash
set -e

# ──────────────────────────────────────────────
# run.sh — Setup & launch backend + frontend + ai
# ──────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
AI_DIR="$ROOT_DIR/ai"
BACKEND_VENV_DIR="$BACKEND_DIR/venv"
AI_VENV_DIR="$AI_DIR/venv"
PARENT_ENV_FILE="$ROOT_DIR/.env"
BACKEND_ENV_FILE="$BACKEND_DIR/.env"
AI_ENV_FILE="$AI_DIR/.env"
AI_APP_ENV_FILE="$AI_DIR/app/.env"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}▶ Syncing environment files...${NC}"
if [ -f "$PARENT_ENV_FILE" ]; then
    cp "$PARENT_ENV_FILE" "$BACKEND_ENV_FILE"
    cp "$PARENT_ENV_FILE" "$AI_ENV_FILE"
    cp "$PARENT_ENV_FILE" "$AI_APP_ENV_FILE"

    # Export root .env so all launched processes inherit the same environment.
    set -a
    # shellcheck disable=SC1090
    source "$PARENT_ENV_FILE"
    set +a
    echo -e "${GREEN}  Synced .env to backend and ai (including ai/app).${NC}"
else
    echo -e "${YELLOW}  Warning: $PARENT_ENV_FILE not found. Skipping env sync.${NC}"
fi

echo -e "${CYAN}▶ Setting up backend...${NC}"

# Create virtual environment if it doesn't exist
if [ ! -d "$BACKEND_VENV_DIR" ]; then
    echo -e "${GREEN}  Creating Python virtual environment...${NC}"
    python3 -m venv "$BACKEND_VENV_DIR"
fi

# Activate venv
source "$BACKEND_VENV_DIR/bin/activate"

# Install backend dependencies
echo -e "${GREEN}  Installing backend Python dependencies...${NC}"
pip install --upgrade pip -q
pip install -r "$BACKEND_DIR/requirements.txt" -q

echo -e "${CYAN}▶ Setting up AI service...${NC}"

# Create AI virtual environment if it doesn't exist
if [ ! -d "$AI_VENV_DIR" ]; then
    echo -e "${GREEN}  Creating AI Python virtual environment...${NC}"
    python3 -m venv "$AI_VENV_DIR"
fi

# Activate AI venv and install dependencies
source "$AI_VENV_DIR/bin/activate"
echo -e "${GREEN}  Installing AI Python dependencies...${NC}"
pip install --upgrade pip -q
pip install -r "$AI_DIR/requirements.txt" -q

echo -e "${CYAN}▶ Setting up frontend...${NC}"

# Install frontend dependencies
cd "$ROOT_DIR"
echo -e "${GREEN}  Running npm install...${NC}"
npm install

# ──────────────────────────────────────────────
# Launch all servers
# ──────────────────────────────────────────────
echo ""
echo -e "${CYAN}▶ Starting backend, ai, and frontend...${NC}"
echo -e "${GREEN}  Backend  → http://localhost:8000${NC}"
echo -e "${GREEN}  AI       → http://localhost:8001${NC}"
echo -e "${GREEN}  Frontend → http://localhost:5173${NC}"
echo ""

# Trap to kill all processes on exit
cleanup() {
    echo -e "\n${CYAN}Shutting down...${NC}"
    kill "$BACKEND_PID" "$AI_PID" "$FRONTEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" "$AI_PID" "$FRONTEND_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
cd "$BACKEND_DIR"
source "$BACKEND_VENV_DIR/bin/activate"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start AI service
cd "$AI_DIR"
source "$AI_VENV_DIR/bin/activate"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001 &
AI_PID=$!

# Start frontend
cd "$ROOT_DIR"
npm run dev &
FRONTEND_PID=$!

# Wait for either to exit
wait -n "$BACKEND_PID" "$AI_PID" "$FRONTEND_PID"
cleanup
