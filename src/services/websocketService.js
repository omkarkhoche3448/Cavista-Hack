/**
 * WebSocket Service — singleton that manages a persistent WS connection.
 * Reconnects automatically. Dispatches events to registered listeners.
 */

import { SESSIONS_WS_URL } from "@/api";

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map(); // event -> Set<callback>
    this.token = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.isConnecting = false;
    this.isManualClose = false;
  }

  connect(token) {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.isConnecting) return;

    this.token = token;
    this.isManualClose = false;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(`${SESSIONS_WS_URL}?token=${token}`);

      this.ws.onopen = () => {
        console.log("[WS] Connected");
        this.isConnecting = false;
        this.reconnectDelay = 1000;
        this._emit("_connected", {});
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._emit(msg.event, msg.data || {});
        } catch {
          console.warn("[WS] Non-JSON message:", event.data);
        }
      };

      this.ws.onclose = (event) => {
        console.log("[WS] Disconnected", event.code);
        this.isConnecting = false;
        this._emit("_disconnected", { code: event.code });
        if (!this.isManualClose && this.token) {
          this._scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error("[WS] Error:", error);
        this.isConnecting = false;
      };
    } catch (err) {
      console.error("[WS] Connection failed:", err);
      this.isConnecting = false;
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this.isManualClose = true;
    this.token = null;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(event, data = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    } else {
      console.warn("[WS] Not connected, cannot send:", event);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }

  _emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[WS] Listener error for ${event}:`, err);
        }
      });
    }
    // Also emit to wildcard listeners
    const wildcards = this.listeners.get("*");
    if (wildcards) {
      wildcards.forEach((cb) => {
        try {
          cb({ event, data });
        } catch (err) {
          console.error("[WS] Wildcard listener error:", err);
        }
      });
    }
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      if (this.token) {
        this.connect(this.token);
      }
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton
const wsService = new WebSocketService();
export default wsService;
