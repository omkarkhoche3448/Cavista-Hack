import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationDropdown from "./NotificationDropdown";
import SessionRequestDialog from "./SessionRequestDialog";
import { useWebSocket } from "@/context/WebSocketContext";
import { respondToSession } from "@/services/sessionService";
import { useAuth } from "@/features/auth";

export default function NotificationBell() {
  const { notifications, clearNotification } = useWebSocket();
  const { session: authSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [sessionDialog, setSessionDialog] = useState(null);

  const token = authSession?.access_token;
  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAsRead(id) {
    // Current context only has clearNotification, which removes it.
    // In a real app we'd mark as read in DB. For now, we'll just clear it when clicked.
    clearNotification(id);
  }

  function markAllAsRead() {
    notifications.forEach((n) => clearNotification(n.id));
  }

  function handleNotificationClick(notification) {
    if (notification.type === "session_request") {
      setSessionDialog(notification);
      setOpen(false);
    } else {
      markAsRead(notification.id);
    }
  }

  async function handleSessionRespond(action) {
    if (!sessionDialog) return;
    try {
      await respondToSession(token, { sessionId: sessionDialog.session_id, action });
      clearNotification(sessionDialog.id);
      setSessionDialog(null);
    } catch (err) {
      console.error("Failed to respond from notification:", err);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(!open)}
        className="relative"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
            {unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          onClose={() => setOpen(false)}
          onNotificationClick={handleNotificationClick}
          onMarkAllRead={markAllAsRead}
        />
      )}

      {sessionDialog && (
        <SessionRequestDialog
          session={sessionDialog}
          open={!!sessionDialog}
          onRespond={handleSessionRespond}
          onClose={() => setSessionDialog(null)}
        />
      )}
    </div>
  );
}
