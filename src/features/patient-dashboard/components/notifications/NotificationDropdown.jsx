import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, Video, FileText, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_ICONS = {
  session_request: Video,
  patient_summary_available: FileText,
  emr_approved: FileText,
  session_reminder: Calendar,
  system: AlertCircle,
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationDropdown({
  notifications,
  onClose,
  onNotificationClick,
  onMarkAllRead,
}) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-card shadow-lg z-50"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={onMarkAllRead}
          >
            <CheckCheck className="w-3 h-3 mr-1" />
            Mark all read
          </Button>
        )}
      </div>

      <ScrollArea className="max-h-80">
        {notifications.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => onNotificationClick(n)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors",
                    !n.is_read && "bg-primary/5"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-full p-1.5 shrink-0 mt-0.5",
                      n.priority === "urgent"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      {!n.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {n.type === "session_request" && (
                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                      Action
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
