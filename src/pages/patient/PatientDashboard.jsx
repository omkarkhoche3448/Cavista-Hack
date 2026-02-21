import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ClipboardList,
  Bell,
  WifiOff,
  Eye,
  Plus,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { listSessions, respondToSession } from "@/services/sessionService";
import { listDocuments } from "@/services/documentService";
import FileUploadModal from "../../features/patient-dashboard/FileUploadModal";
import SessionRequestCard from "../../features/patient-dashboard/SessionRequestCard";
import SummaryModal from "../../features/patient-dashboard/SummaryModal";
// SessionInvitationModal removed, it's now in DashboardLayout for global coverage

const STATUS_BADGE = {
  pending: { variant: "warning", label: "Pending" },
  accepted: { variant: "info", label: "Accepted" },
  active: { variant: "success", label: "Active" },
  processing: { variant: "info", label: "Processing" },
  completed: { variant: "secondary", label: "Completed" },
  rejected: { variant: "destructive", label: "Rejected" },
};

export default function PatientDashboard() {
  const { profile, session: authSession, loading: authLoading } = useAuth();
  const { isConnected, subscribe, notifications: wsNotifications } = useWebSocket();
  const navigate = useNavigate();
  const token = authSession?.access_token;

  const [sessions, setSessions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      console.log("[PatientDashboard] Fetching data...");
      const [sessData, docsData] = await Promise.all([
        listSessions(token),
        listDocuments(token).catch(() => []),
      ]);
      console.log("[PatientDashboard] API Results:", { sessData, docsData });
      if (Array.isArray(sessData)) {
        setSessions(sessData);
        setPendingRequests(sessData.filter((s) => s.status === "pending"));
      } else {
        console.warn("[PatientDashboard] Sessions API returned non-array:", sessData);
        setSessions([]);
        setPendingRequests([]);
      }
      setDocuments(Array.isArray(docsData) ? docsData : []);
    } catch (err) {
      console.error("[PatientDashboard] Failed to fetch data:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading) {
      fetchData();
    }
  }, [authLoading, fetchData]);

  // Listen for real-time events — direct state mutations, no refetch
  useEffect(() => {
    const unsub1 = subscribe("SESSION_REQUESTED", (data) => {
      // New session request from doctor — add it to sessions and pending
      if (data.session) {
        setSessions((prev) => {
          if (prev.some((s) => s.id === data.session.id)) return prev;
          return [data.session, ...prev];
        });
        setPendingRequests((prev) => {
          if (prev.some((s) => s.id === data.session.id)) return prev;
          return [data.session, ...prev];
        });
        // Popup is now handled by PatientDashboardLayout globally
      } else {
        fetchData();
      }
    });
    const unsub2 = subscribe("SESSION_ENDED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: data.status || "processing" } : s)
      );
    });
    const unsub3 = subscribe("SESSION_STARTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "active" } : s)
      );
      setPendingRequests((prev) => prev.filter((s) => s.id !== data.session_id));
    });
    const unsub4 = subscribe("SESSION_ACCEPTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "accepted" } : s)
      );
      setPendingRequests((prev) => prev.filter((s) => s.id !== data.session_id));
    });
    const unsub5 = subscribe("SESSION_REJECTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "rejected" } : s)
      );
      setPendingRequests((prev) => prev.filter((s) => s.id !== data.session_id));
    });
    const unsub6 = subscribe("FILE_SHARED", (data) => {
      if (data.documents) {
        setDocuments((prev) => [
          ...data.documents.filter((d) => !prev.some((p) => p.id === d.id)),
          ...prev,
        ]);
      }
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); };
  }, [subscribe, fetchData]);

  async function handleRespond(sessionId, action, reason) {
    try {
      await respondToSession(token, { sessionId, action, reason });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: action === "accept" ? "accepted" : "rejected" } : s
        )
      );
      setPendingRequests((prev) => prev.filter((s) => s.id !== sessionId));
      if (action === "accept") {
        navigate(`/patient/session/${sessionId}`);
      }
    } catch (err) {
      console.error("Failed to respond:", err);
    }
  }

  function handleFileUploaded(doc) {
    setDocuments((prev) => [doc, ...prev]);
  }

  const completedSessions = sessions.filter((s) => s.status === "completed");
  const activeSessions = sessions.filter((s) =>
    ["accepted", "active"].includes(s.status)
  );

  return (
    <div className="space-y-8">
      {/* Premium Welcome Header */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-secondary/5 border border-primary/20 animate-in fade-in duration-500">
        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 -mr-8 -mt-8">
          <ShieldCheck className="w-48 h-48 text-primary" />
        </div>

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              Welcome back, <span className="text-primary">{profile?.first_name}</span>
            </h1>
            <div className="flex items-center gap-3">
              <p className="text-muted-foreground font-medium">Your personalized health dashboard</p>
              <div className="h-4 w-[1px] bg-border hidden sm:block" />
              {isConnected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                  <Activity className="w-3 h-3" /> Live Support
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1">
                  <WifiOff className="w-3 h-3" /> Offline Mode
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowUpload(true)}
              size="lg"
              className="rounded-full px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all duration-300 gap-2 font-bold"
            >
              <Plus className="w-5 h-5" />
              Upload Records
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}

      {/* Pending Session Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-500" />
            Session Requests
          </h2>
          {pendingRequests.map((req) => (
            <SessionRequestCard
              key={req.id}
              session={req}
              onRespond={handleRespond}
            />
          ))}
        </div>
      )}

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          [1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-24 h-4 bg-muted rounded" />
                  <div className="w-8 h-8 bg-muted rounded-full" />
                </div>
                <div className="w-16 h-8 bg-muted rounded mb-2" />
                <div className="w-32 h-3 bg-muted rounded" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Medical Records</CardTitle>
                <div className="p-2 rounded-lg bg-primary/10 text-primary transition-transform">
                  <FileText className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{documents.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Files securely stored</p>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Active Sessions</CardTitle>
                <div className="p-2 rounded-lg bg-green-500/10 text-green-600 transition-transform">
                  <Activity className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{activeSessions.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Live consultations</p>
              </CardContent>
            </Card>

            <Card className="hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">Visit Summaries</CardTitle>
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 transition-transform">
                  <ClipboardList className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{completedSessions.length}</p>
                <p className="text-xs text-muted-foreground mt-1">AI-processed reviews</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Active Sessions</h2>
          {activeSessions.map((s) => (
            <Card key={s.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold">{s.doctor_name}</p>
                      <Badge variant={STATUS_BADGE[s.status]?.variant}>
                        {STATUS_BADGE[s.status]?.label}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {s.chief_complaint || "General consultation"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/patient/session/${s.id}`)}
                  >
                    Open
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Documents - Refined Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Medical Documents</h2>
          {documents.length > 0 && (
            <p className="text-sm font-medium text-muted-foreground">{documents.length} files found</p>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <Card className="border-dashed border-2 bg-muted/30">
            <CardContent className="py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold">No documents yet</h3>
              <p className="text-muted-foreground max-w-xs mx-auto mt-1 mb-6">
                Keep all your health records organized and accessible in one secure place.
              </p>
              <Button onClick={() => setShowUpload(true)} variant="outline" className="rounded-full px-8">
                Start Uploading
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <Card key={doc.id} className="group hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-pointer overflow-hidden relative">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-primary/5 text-primary group-hover:bg-primary/10 transition-colors">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{doc.title}</p>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-0.5">
                        {doc.document_type} &middot; {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="group-hover:text-primary rounded-full">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Completed Sessions / Summaries */}
      {completedSessions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Past Visits</h2>
          {completedSessions.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{s.doctor_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.chief_complaint || "General consultation"} &middot;{" "}
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedSummary(s);
                      setShowSummaryModal(true);
                    }}
                    className="gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    View Summary
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <FileUploadModal
        open={showUpload}
        onOpenChange={setShowUpload}
        onUploaded={handleFileUploaded}
      />

      <SummaryModal
        open={showSummaryModal}
        onOpenChange={setShowSummaryModal}
        session={selectedSummary}
      />
    </div>
  );
}
