import { Link, useNavigate } from "react-router-dom";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/features/auth";
import { signOut } from "@/services/authService";
import { HeartPulse, LogOut } from "lucide-react";
import PatientSidebar from "./PatientSidebar";
import NotificationBell from "./notifications/NotificationBell";
import { useWebSocket } from "@/context/WebSocketContext";
import { respondToSession } from "@/services/sessionService";
import SessionInvitationModal from "../SessionInvitationModal";
import { useState, useEffect } from "react";

export default function PatientDashboardLayout() {
  const { profile, session: authSession } = useAuth();
  const { subscribe } = useWebSocket();
  const navigate = useNavigate();
  const token = authSession?.access_token;

  const [invitation, setInvitation] = useState(null);
  const [showInvitation, setShowInvitation] = useState(false);

  useEffect(() => {
    const unsub = subscribe("SESSION_REQUESTED", (data) => {
      if (data.session) {
        setInvitation(data.session);
        setShowInvitation(true);
      }
    });
    return () => unsub();
  }, [subscribe]);

  async function handleRespond(sessionId, action, reason) {
    try {
      await respondToSession(token, { sessionId, action, reason });
      if (action === "accept") {
        navigate(`/patient/session/${sessionId}`);
      }
    } catch (err) {
      console.error("Failed to respond to session:", err);
    }
  }

  async function handleLogout() {
    await signOut();
    navigate("/home", { replace: true });
  }

  return (
    <SidebarProvider>
      <PatientSidebar />
      <SidebarInset>
        {/* Dashboard header */}
        <header className="flex h-14 items-center justify-between border-b px-4 gap-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Link to="/home" className="flex items-center gap-2 no-underline">
              <HeartPulse className="w-6 h-6 text-primary" />
              <span className="text-lg font-bold hidden sm:inline">sewa मित्र</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <NotificationBell />
            <span className="text-sm font-medium hidden md:inline">
              {profile?.first_name || "Patient"} {profile?.last_name || ""}
            </span>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>

      <SessionInvitationModal
        open={showInvitation}
        onOpenChange={setShowInvitation}
        session={invitation}
        onRespond={handleRespond}
      />
    </SidebarProvider>
  );
}
