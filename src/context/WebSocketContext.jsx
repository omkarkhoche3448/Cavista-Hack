import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/features/auth";
import wsService from "@/services/websocketService";

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { session, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const listenersRef = useRef([]);

  useEffect(() => {
    if (isAuthenticated && session?.access_token) {
      wsService.connect(session.access_token);

      const unsub1 = wsService.on("_connected", () => setIsConnected(true));
      const unsub2 = wsService.on("_disconnected", () => setIsConnected(false));
      const unsub3 = wsService.on("NOTIFICATION", (data) => {
        setNotifications((prev) => [{ ...data, id: Date.now(), read: false }, ...prev]);
      });
      const unsub4 = wsService.on("SESSION_REQUESTED", (data) => {
        setNotifications((prev) => [
          { ...data, id: Date.now(), read: false, type: "session_request", title: "New Session Request", body: `Dr. ${data.doctor_name} wants to start a session` },
          ...prev,
        ]);
      });

      return () => {
        unsub1();
        unsub2();
        unsub3();
        unsub4();
        wsService.disconnect();
      };
    }
  }, [isAuthenticated, session?.access_token]);

  const subscribe = useCallback((event, callback) => {
    return wsService.on(event, callback);
  }, []);

  const send = useCallback((event, data) => {
    wsService.send(event, data);
  }, []);

  const clearNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const value = {
    isConnected,
    notifications,
    subscribe,
    send,
    clearNotification,
    wsService,
  };

  return (
    <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
