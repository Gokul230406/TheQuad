"""
WebSocket Manager for real-time dashboard updates.
"""
import json
import logging
from typing import List, Dict, Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"[WS] Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"[WS] Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: Dict[str, Any]):
        """Broadcast a message to all connected WebSocket clients."""
        message = json.dumps(data, default=str)
        disconnected = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception as e:
                logger.warning(f"[WS] Failed to send to client: {e}")
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws)

    async def send_personal(self, websocket: WebSocket, data: Dict[str, Any]):
        """Send a message to a single client."""
        try:
            await websocket.send_text(json.dumps(data, default=str))
        except Exception as e:
            logger.warning(f"[WS] Failed to send personal message: {e}")
            self.disconnect(websocket)
