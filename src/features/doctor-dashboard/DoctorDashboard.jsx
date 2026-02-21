import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  FileText,
  CalendarDays,
  Play,
  Mic,
  Clock,
  CheckCircle,
  ArrowRight,
  User,
  Activity,
  FileBarChart,
  Loader2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listSessions, startSession } from "@/services/sessionService";
import CreateSessionModal from "./CreateSessionModal";

const STATUS_BADGE = {
  pending: { variant: "warning", label: "Pending" },
  accepted: { variant: "info", label: "Accepted" },
  active: { variant: "success", label: "Active" },
  processing: { variant: "info", label: "Processing" },
  completed: { variant: "secondary", label: "Completed" },
  rejected: { variant: "destructive", label: "Rejected" },
};

const SessionCard = ({ session, onStart, isStarting }) => {
  const isAccepted = session.status === "accepted";
  const isActive = session.status === "active";

  return (
    <Card className="group transition-all duration-300 hover:shadow-lg hover:border-primary hover:-translate-y-1">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors duration-300">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{session.patient_name}</p>
              <p className="text-sm text-muted-foreground">{session.patient_email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_BADGE[session.status]?.variant ?? "secondary"}>
              {STATUS_BADGE[session.status]?.label ?? session.status}
            </Badge>
          </div>
        </div>

        {session.chief_complaint && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground line-clamp-2">{session.chief_complaint}</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{new Date(session.created_at).toLocaleString()}</span>
          </div>

          {(isAccepted || isActive) && (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => onStart(session.id, isActive)}
              disabled={isStarting === session.id}
            >
              {isStarting === session.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArrowRight className="w-3 h-3" />
              )}
              {isActive ? "Resume" : "Start"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default function DoctorDashboard() {
  const { profile, session: authSession, loading: authLoading } = useAuth();
  const { subscribe, isConnected } = useWebSocket();
  const navigate = useNavigate();
  const token = authSession?.access_token;

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [isStarting, setIsStarting] = useState(null);

  const fetchSessions = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      console.log("[DoctorDashboard] Fetching sessions with token...");
      const data = await listSessions(token);
      console.log("[DoctorDashboard] API Result:", data);
      if (Array.isArray(data)) {
        setSessions(data);
      } else {
        console.warn("[DoctorDashboard] API returned unexpected data:", data);
        setSessions([]);
      }
    } catch (err) {
      console.error("[DoctorDashboard] Failed to fetch sessions:", err);
      setError(err.message || "Failed to load sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Wait for auth to finish before fetching sessions
  useEffect(() => {
    if (!authLoading) {
      fetchSessions();
    }
  }, [authLoading, fetchSessions]);

  // Real-time updates via WebSocket
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
    const unsub3 = subscribe("SESSION_STARTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "active" } : s)
      );
    });
    const unsub4 = subscribe("SESSION_ENDED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: data.status || "processing" } : s)
      );
    });
    const unsub5 = subscribe("EMR_DRAFT_READY", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "processing" } : s)
      );
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, [subscribe]);

  // Called when doctor creates a new session via the modal
  const handleSessionCreated = useCallback((newSession) => {
    setSessions((prev) => [newSession, ...prev]);
  }, []);

  // Start (or resume) a session — calls /start then navigates to SessionPage
  async function handleStartSession(sessionId, isAlreadyActive) {
    setIsStarting(sessionId);
    try {
      if (!isAlreadyActive) {
        await startSession(token, sessionId);
        setSessions((prev) =>
          prev.map((s) => s.id === sessionId ? { ...s, status: "active" } : s)
        );
      }
      navigate(`/doctor/session/${sessionId}`);
    } catch (err) {
      console.error("Failed to start session:", err);
    } finally {
      setIsStarting(null);
    }
  }

  const activeSessions = sessions.filter((s) => ["accepted", "active"].includes(s.status));
  const pendingSessions = sessions.filter((s) => s.status === "pending");
  const completedSessions = sessions.filter((s) => ["completed", "processing"].includes(s.status));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-in fade-in-down duration-700">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold">
              Welcome, Dr. {profile?.first_name}
            </h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              Here&apos;s your dashboard overview
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

          {/* Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="default"
              className="bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300"
            >
              <Activity className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <Button
              variant="outline"
              className="hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Sessions
            </Button>
            <Button
              variant="outline"
              className="hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              <Users className="w-4 h-4 mr-2" />
              Patients
            </Button>
            <Button
              variant="outline"
              className="hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              <FileBarChart className="w-4 h-4 mr-2" />
              Reports
            </Button>
          </div>
        </div>
      </div>

      {/* Start New Session CTA */}
      <div className="animate-in fade-in-up duration-700 delay-100">
        <Card className="relative overflow-hidden bg-background border-2 border-dashed border-primary/40 hover:border-primary hover:shadow-2xl hover:shadow-primary/25 transition-all duration-700 group">
          <CardContent className="relative p-10 text-center">
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 bg-primary rounded-full animate-spin opacity-20" style={{ animationDuration: '4s' }} />
              <div className="absolute inset-2 bg-background rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                <Play className="w-8 h-8 text-primary group-hover:animate-pulse" />
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <h3 className="text-2xl font-bold text-primary">Start New Session</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Initialize a new patient consultation with AI-powered voice recording
              </p>
            </div>

            <Button
              onClick={() => setShowModal(true)}
              className="group/btn relative inline-flex items-center gap-3 px-10 py-4 text-lg font-bold rounded-full bg-primary text-white overflow-hidden transition-all duration-700 hover:shadow-2xl hover:shadow-primary/40 hover:bg-primary/90"
            >
              <Mic className="w-5 h-5 group-hover/btn:animate-pulse" />
              Launch Session
              <ArrowRight className="w-5 h-5 transition-all duration-500 group-hover/btn:translate-x-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in-up duration-700 delay-200">
        <Card className="group hover:shadow-lg hover:border-primary hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <div className="p-2 rounded-lg bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400 group-hover:scale-110 transition-transform duration-300">
              <Activity className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{activeSessions.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Ready to continue</p>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg hover:border-primary hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <div className="p-2 rounded-lg bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400 group-hover:scale-110 transition-transform duration-300">
              <Clock className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{pendingSessions.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting patient response</p>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg hover:border-primary hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">EMR Generated</CardTitle>
            <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 group-hover:scale-110 transition-transform duration-300">
              <FileBarChart className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{completedSessions.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Completed sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Active / Accepted Sessions */}
      {activeSessions.length > 0 && (
        <div className="animate-in fade-in-up duration-700 delay-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-600" />
              Active Sessions
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onStart={handleStartSession}
                isStarting={isStarting}
              />
            ))}
          </div>
        </div>
      )}

      {/* Pending Sessions */}
      {pendingSessions.length > 0 && (
        <div className="animate-in fade-in-up duration-700 delay-350">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              Awaiting Patient Response
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingSessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onStart={handleStartSession}
                isStarting={isStarting}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent / All Sessions */}
      <div className="animate-in fade-in-up duration-700 delay-400">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">All Sessions</h2>
          {error && <span className="text-sm text-destructive font-medium">{error}</span>}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No sessions yet. Click &quot;Launch Session&quot; to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onStart={handleStartSession}
                isStarting={isStarting}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Summary */}
      <div className="animate-in fade-in-up duration-700 delay-500">
        <Card className="border border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Today&apos;s Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-lg bg-background border border-border hover:border-primary transition-colors duration-300">
                <p className="text-2xl font-bold text-primary">{sessions.length}</p>
                <p className="text-sm text-muted-foreground">Total Sessions</p>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border hover:border-primary transition-colors duration-300">
                <p className="text-2xl font-bold text-primary">{activeSessions.length}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border hover:border-primary transition-colors duration-300">
                <p className="text-2xl font-bold text-primary">{completedSessions.length}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Session Modal */}
      <CreateSessionModal
        open={showModal}
        onOpenChange={setShowModal}
        onCreated={handleSessionCreated}
      />
    </div>
  );
}
