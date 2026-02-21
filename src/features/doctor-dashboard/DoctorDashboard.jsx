import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FileText,
  CalendarDays,
  Plus,
  Mic,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { listSessions, startSession } from "@/services/sessionService";
import CreateSessionModal from "./CreateSessionModal";

const STATUS_BADGE = {
  pending: { variant: "warning", label: "Pending" },
  accepted: { variant: "info", label: "Accepted" },
  active: { variant: "success", label: "Active" },
  processing: { variant: "info", label: "Processing" },
  completed: { variant: "secondary", label: "Completed" },
  rejected: { variant: "destructive", label: "Rejected" },
  ended: { variant: "secondary", label: "Ended" },
  cancelled: { variant: "outline", label: "Cancelled" },
};

export default function DoctorDashboard() {
  const { profile, session: authSession } = useAuth();
  const { isConnected, subscribe } = useWebSocket();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!authSession?.access_token) return;
    try {
      const data = await listSessions(authSession.access_token);
      setSessions(data);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [authSession?.access_token]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Listen for real-time session updates — direct state mutations, no refetch
  useEffect(() => {
    const unsub1 = subscribe("SESSION_ACCEPTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "accepted" } : s)
      );
    });
    const unsub2 = subscribe("SESSION_REJECTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "rejected" } : s)
      );
    });
    const unsub3 = subscribe("EMR_DRAFT_READY", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "processing" } : s)
      );
    });
    const unsub4 = subscribe("SESSION_ENDED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: data.status || "processing" } : s)
      );
    });
    const unsub5 = subscribe("SESSION_STARTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "active" } : s)
      );
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, [subscribe]);

  async function handleStartSession(sessionId) {
    try {
      await startSession(authSession.access_token, sessionId);
      navigate(`/doctor/session/${sessionId}`);
    } catch (err) {
      console.error("Failed to start session:", err);
    }
  }

  function handleSessionCreated(newSession) {
    setSessions((prev) => [newSession, ...prev]);
  }

  const activeSessions = sessions.filter((s) =>
    ["pending", "accepted", "active"].includes(s.status)
  );
  const processingCount = sessions.filter((s) => s.status === "processing").length;
  const completedCount = sessions.filter((s) => s.status === "completed").length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            Welcome, Dr. {profile?.first_name}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            Dashboard overview
            {isConnected ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Wifi className="w-3 h-3" /> Live
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <WifiOff className="w-3 h-3" /> Offline
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Session
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Mic className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeSessions.length}</p>
            <p className="text-xs text-muted-foreground">Ongoing & pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <CalendarDays className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{processingCount}</p>
            <p className="text-xs text-muted-foreground">AI generating EMR</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <FileText className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-muted-foreground">EMRs approved</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Sessions</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No sessions yet. Click &quot;New Session&quot; to start one.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const badge = STATUS_BADGE[s.status] || { variant: "outline", label: s.status };
              return (
                <Card key={s.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <p className="font-semibold truncate">{s.patient_name || "Patient"}</p>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {s.is_emergency && <Badge variant="destructive">Emergency</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {s.chief_complaint || "No complaint specified"} &middot;{" "}
                          {s.patient_email}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          <Clock className="w-3 h-3 inline mr-1" />
                          {new Date(s.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {s.status === "accepted" && (
                          <Button
                            size="sm"
                            onClick={() => handleStartSession(s.id)}
                            className="gap-1"
                          >
                            <Mic className="w-3 h-3" />
                            Start
                          </Button>
                        )}
                        {s.status === "active" && (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/doctor/session/${s.id}`)}
                            className="gap-1"
                          >
                            <ArrowRight className="w-3 h-3" />
                            Resume
                          </Button>
                        )}
                        {(s.status === "processing" || s.status === "completed") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/doctor/review/${s.id}`)}
                            className="gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            Review
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <CreateSessionModal
        open={showModal}
        onOpenChange={setShowModal}
        onCreated={handleSessionCreated}
      />
    </div>
  );
}
