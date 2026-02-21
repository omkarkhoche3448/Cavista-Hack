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
  Search,
  LayoutDashboard,
  Settings,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
      {/* Premium Welcome Header */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-secondary/5 border border-primary/20 animate-in fade-in duration-500">
        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 -mr-8 -mt-8">
          <LayoutDashboard className="w-48 h-48 text-primary" />
        </div>

        <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              Welcome, Dr. <span className="text-primary italic">{profile?.first_name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-muted-foreground font-medium">Your clinical command center is ready</p>
              <div className="h-4 w-[1px] bg-border hidden sm:block" />
              {isConnected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 px-3 py-1">
                  <Wifi className="w-3 h-3" /> Live Control
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1 px-3 py-1">
                  <WifiOff className="w-3 h-3" /> Offline
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              className="rounded-full px-6 bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 font-bold"
            >
              <Activity className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all duration-300 font-bold"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Sessions
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all duration-300 font-bold"
            >
              <Users className="w-4 h-4 mr-2" />
              Patients
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all duration-300 font-bold"
            >
              <FileBarChart className="w-4 h-4 mr-2" />
              Reports
            </Button>
          </div>
        </div>
      </div>

      {/* Start New Session CTA */}
      <div className="animate-in fade-in duration-500 delay-100">
        <div className="relative overflow-hidden">
          <Card className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 border-2 border-dashed border-primary/40 hover:border-primary hover:shadow-xl transition-all duration-300 group">
            <div className="absolute inset-0 opacity-5 pointer-events-none">
              <div className="w-full h-full" style={{
                backgroundImage: `radial-gradient(circle at 25px 25px, currentColor 2px, transparent 0)`,
                backgroundSize: '50px 50px'
              }} />
            </div>

            <CardContent className="relative p-10 text-center">
              <div className="relative mx-auto mb-8 w-24 h-24">
                <div className="absolute inset-0 bg-primary/20 rounded-full opacity-30" />
                <div className="absolute inset-3 bg-background rounded-full shadow-inner flex items-center justify-center transition-transform duration-500">
                  <Mic className="w-10 h-10 text-primary" />
                </div>
              </div>

              <div className="space-y-4 mb-10">
                <h3 className="text-4xl font-black tracking-tight text-primary">Start New Session</h3>
                <p className="text-muted-foreground text-xl max-w-lg mx-auto font-medium">
                  Initialize a new patient consultation with AI-powered voice recognition
                </p>
              </div>

              <Button
                onClick={() => setShowModal(true)}
                size="lg"
                className="group/btn relative inline-flex items-center gap-4 px-16 py-8 text-2xl font-black rounded-full shadow-xl shadow-primary/20 transition-all duration-300 active:scale-95"
              >
                <div className="absolute inset-0 bg-white/10 -skew-x-12 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />
                <span className="relative z-10 flex items-center gap-4">
                  Launch Session
                  <ArrowRight className="w-8 h-8 transition-transform duration-500 group-hover/btn:translate-x-2" />
                </span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stats - Premium Visuals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in-up duration-700 delay-200">
        {loading ? (
          [1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-3xl" />
          ))
        ) : (
          <>
            <Card className="group hover:border-green-500/50 hover:shadow-2xl hover:shadow-green-500/10 transition-all duration-500 rounded-3xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-700" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground tracking-widest uppercase">Active Sessions</CardTitle>
                <div className="p-2.5 rounded-2xl bg-green-50 text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all duration-300">
                  <Activity className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-black text-foreground">{activeSessions.length}</p>
                <p className="text-xs font-semibold text-green-600 mt-1 uppercase tracking-tighter italic">Live connections established</p>
              </CardContent>
            </Card>

            <Card className="group hover:border-yellow-500/50 hover:shadow-2xl hover:shadow-yellow-500/10 transition-all duration-500 rounded-3xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-700" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground tracking-widest uppercase">Pending Requests</CardTitle>
                <div className="p-2.5 rounded-2xl bg-yellow-50 text-yellow-600 group-hover:bg-yellow-600 group-hover:text-white transition-all duration-300">
                  <Clock className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-black text-foreground">{pendingSessions.length}</p>
                <p className="text-xs font-semibold text-yellow-600 mt-1 uppercase tracking-tighter italic">Awaiting patient acceptance</p>
              </CardContent>
            </Card>

            <Card className="group hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 rounded-3xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-700" />
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground tracking-widest uppercase">EMR Generated</CardTitle>
                <div className="p-2.5 rounded-2xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
                  <FileBarChart className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-black text-foreground">{completedSessions.length}</p>
                <p className="text-xs font-semibold text-purple-600 mt-1 uppercase tracking-tighter italic">Reports finalized by AI</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Active / Accepted Sessions */}
      {
        activeSessions.length > 0 && (
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
        )
      }

      {/* Pending Sessions */}
      {
        pendingSessions.length > 0 && (
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
        )
      }

      {/* Recent / All Sessions */}
      <div className="animate-in fade-in-up duration-700 delay-400">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">All Sessions</h2>
          {error && <span className="text-sm text-destructive font-medium">{error}</span>}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card className="border-dashed border-2 bg-muted/20">
            <CardContent className="py-20 text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <FileText className="w-10 h-10 text-muted-foreground/30" />
              </div>
              <h3 className="text-xl font-bold">No sessions found</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                You haven&apos;t started any consultations yet. Launch a session to begin real-time charting.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
