import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import NotificationDropdown from "./NotificationDropdown";
import SessionRequestDialog from "./SessionRequestDialog";
import { MOCK_NOTIFICATIONS, MOCK_SESSION_REQUEST } from "../../data/mockData";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [open, setOpen] = useState(false);
  const [sessionDialog, setSessionDialog] = useState(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  function markAsRead(id) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }

  function markAllAsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }

  function handleNotificationClick(notification) {
    markAsRead(notification.id);
    if (notification.type === "session_request") {
      setSessionDialog(MOCK_SESSION_REQUEST);
      setOpen(false);
    }
  }

  function handleSessionRespond(action) {
    setSessionDialog(null);
    // In a real app, this would call the API
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
