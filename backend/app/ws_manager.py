"""
WebSocket Connection Manager
Tracks active connections in-memory and routes messages to users.
"""

import json
import uuid
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self.connection_ids: Dict[WebSocket, str] = {}
        self.ws_to_user: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> str:
        """
        Registers a new active WebSocket connection for a user.
        
        Why: Allows the server to track which users are currently online and broadcast messages to them.
        Where: Called by the /api/sessions/ws endpoint when a client successfully authenticates.
        
        Args:
            websocket (WebSocket): The raw WebSocket connection instance.
            user_id (str): The authenticated UUID of the user.
            
        Returns:
            str: A unique connection ID for this specific session.
        """
        connection_id = str(uuid.uuid4())
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        self.connection_ids[websocket] = connection_id
        self.ws_to_user[websocket] = user_id
        logger.info(f"WS connected: user={user_id} conn={connection_id}")
        return connection_id

    def disconnect(self, websocket: WebSocket):
        """
        Cleanup logic for a closed WebSocket connection.
        
        Why: Frees up memory and prevents trying to send data to dead sockets.
        Where: Called by the /api/sessions/ws endpoint when a connection is closed or lost.
        
        Args:
            websocket (WebSocket): The connection instance to remove.
        """
        user_id = self.ws_to_user.pop(websocket, None)
        conn_id = self.connection_ids.pop(websocket, None)
        if user_id and user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"WS disconnected: user={user_id} conn={conn_id}")

    def is_online(self, user_id: str) -> bool:
        """
        Checks if a user has at least one active connection.
        
        Why: Used to determine if notifications should be sent via WebSocket or deferred.
        Where: Used internally and by various business logic checks.
        
        Args:
            user_id (str): User UUID to check.
            
        Returns:
            bool: True if user is currently connected.
        """
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    async def send_to_user(self, user_id: str, event: str, data: dict = None):
        """
        Sends a JSON-formatted event to all active connections for a specific user.
        
        Why: Delivers real-time updates (e.g., "FILE_SHARED", "NOTIFICATION") to the user's browser.
        Where: Called by routers (sessions, documents, emr) whenever a real-time update is needed.
        
        Args:
            user_id (str): Recipient user UUID.
            event (str): The event name label (e.g., 'TRANSCRIPT_CHUNK').
            data (dict, optional): Payload data for the event.
        """
        message = json.dumps({"event": event, "data": data or {}})
        connections = self.active_connections.get(user_id, set()).copy()
        dead = []
        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to_session(self, session_user_ids: list, event: str, data: dict = None):
        """
        Utility to broadcast an event to multiple users at once.
        
        Why: Efficiently notifies all participants in a clinical session (doctor and patient).
        Where: Called during clinical sessions for shared updates like transcripts.
        
        Args:
            session_user_ids (list): List of user UUIDs to notify.
            event (str): The event name label.
            data (dict, optional): Payload data.
        """
        for uid in session_user_ids:
            await self.send_to_user(uid, event, data)


# Singleton instance
manager = ConnectionManager()
