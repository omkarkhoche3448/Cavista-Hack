"""
WebSocket Connection Manager
Tracks active connections in-memory and routes messages to users.
"""

import json
import uuid
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections, keyed by user_id."""

    def __init__(self):
        # user_id -> set of WebSocket connections (a user may have multiple tabs)
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # ws -> connection_id mapping
        self.connection_ids: Dict[WebSocket, str] = {}
        # ws -> user_id mapping
        self.ws_to_user: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> str:
        """Track an already-accepted WebSocket connection."""
        connection_id = str(uuid.uuid4())

        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()

        self.active_connections[user_id].add(websocket)
        self.connection_ids[websocket] = connection_id
        self.ws_to_user[websocket] = user_id

        logger.info(f"WS connected: user={user_id} conn={connection_id}")
        return connection_id

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        user_id = self.ws_to_user.pop(websocket, None)
        conn_id = self.connection_ids.pop(websocket, None)

        if user_id and user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

        logger.info(f"WS disconnected: user={user_id} conn={conn_id}")

    def is_online(self, user_id: str) -> bool:
        """Check if a user has at least one active WS connection."""
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    async def send_to_user(self, user_id: str, event: str, data: dict = None):
        """Send a JSON event to all connections of a user."""
        message = json.dumps({"event": event, "data": data or {}})
        connections = self.active_connections.get(user_id, set()).copy()
        dead = []
        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        # Clean up dead connections
        for ws in dead:
            self.disconnect(ws)

    async def send_to_session(self, session_user_ids: list, event: str, data: dict = None):
        """Send a message to all users in a session."""
        for uid in session_user_ids:
            await self.send_to_user(uid, event, data)

    async def broadcast(self, event: str, data: dict = None):
        """Broadcast to all connected users."""
        for user_id in list(self.active_connections.keys()):
            await self.send_to_user(user_id, event, data)

    def get_online_users(self) -> list:
        """Return list of user_ids currently connected."""
        return list(self.active_connections.keys())


# Singleton instance
manager = ConnectionManager()
