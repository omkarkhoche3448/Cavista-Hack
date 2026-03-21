/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/features/auth";
import wsService from "@/services/websocketService";
import { supabase } from "@/config/supabase";

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const { session, isAuthenticated } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  // Track the token we last connected with so we don't reconnect unnecessarily
  const connectedTokenRef = useRef(null);

  // Subscribe once to WS lifecycle + notifications (state updates only happen in callbacks)
  useEffect(() => {
    const unsub1 = wsService.on("_connected", () => setIsConnected(true));
    const unsub2 = wsService.on("_disconnected", () => setIsConnected(false));
    const unsubExpired = wsService.on("_token_expired", async () => {
      connectedTokenRef.current = null;
      await supabase.auth.refreshSession();
    });
    const unsub3 = wsService.on("NOTIFICATION", (data) => {
      setNotifications((prev) => [{ ...data, id: Date.now(), read: false }, ...prev]);
    });
    const unsub4 = wsService.on("SESSION_REQUESTED", (data) => {
      setNotifications((prev) => [
        {
          ...data,
          id: Date.now(),
          read: false,
          type: "session_request",
          title: "New Session Request",
          body: `Dr. ${data.doctor_name} wants to start a session`,
        },
        ...prev,
      ]);
    });

    return () => {
      unsub1();
      unsub2();
      unsubExpired();
      unsub3();
      unsub4();
    };
  }, []);

  // Connect/disconnect when auth token changes (no direct setState in effect body)
  useEffect(() => {
    const token = session?.access_token;

    if (!isAuthenticated || !token) {
      // User logged out — disconnect
      connectedTokenRef.current = null;
      wsService.disconnect();
      return;
    }

    // Only (re)connect if the token has actually changed
    if (connectedTokenRef.current === token) {
      return;
    }

    connectedTokenRef.current = token;
    wsService.connect(token);
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
