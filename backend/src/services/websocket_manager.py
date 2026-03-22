from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.connection_ids: Dict[WebSocket, str] = {}
        self.ws_to_user: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> str:
        connection_id = str(uuid.uuid4())
        self.active_connections[user_id].add(websocket)
        self.connection_ids[websocket] = connection_id
        self.ws_to_user[websocket] = user_id
        logger.info("WS connected user=%s connection_id=%s", user_id, connection_id)
        return connection_id

    def disconnect(self, websocket: WebSocket) -> None:
        user_id = self.ws_to_user.pop(websocket, None)
        conn_id = self.connection_ids.pop(websocket, None)
        if user_id:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info("WS disconnected user=%s connection_id=%s", user_id, conn_id)

    async def send_to_user(self, user_id: str, event: str, data: dict | None = None) -> None:
        message = json.dumps({"event": event, "data": data or {}})
        dead: list[WebSocket] = []
        for ws in list(self.active_connections.get(user_id, set())):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to_session(self, session_user_ids: list[str], event: str, data: dict | None = None) -> None:
        for user_id in session_user_ids:
            await self.send_to_user(user_id, event, data)


manager = ConnectionManager()

