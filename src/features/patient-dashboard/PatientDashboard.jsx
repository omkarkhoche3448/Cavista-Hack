import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  CalendarDays,
  ClipboardList,
  Bell,
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  Eye,
} from "lucide-react";
import { listSessions, respondToSession } from "@/services/sessionService";
import { listDocuments, uploadDocument } from "@/services/documentService";
import FileUploadModal from "./FileUploadModal";
import SessionRequestCard from "./SessionRequestCard";
import SummaryModal from "./SummaryModal";
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Welcome, {profile?.first_name}</h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            Your health overview
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
        <Button onClick={() => setShowUpload(true)} className="gap-2">
          <Upload className="w-4 h-4" />
          Upload Document
        </Button>
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Medical Records</CardTitle>
            <FileText className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{documents.length}</p>
            <p className="text-xs text-muted-foreground">Uploaded documents</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <CalendarDays className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activeSessions.length}</p>
            <p className="text-xs text-muted-foreground">Ongoing</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Visit Summaries</CardTitle>
            <ClipboardList className="w-5 h-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{completedSessions.length}</p>
            <p className="text-xs text-muted-foreground">Completed visits</p>
          </CardContent>
        </Card>
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

      {/* Documents */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">My Documents</h2>
        {documents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet. Upload your medical records to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {documents.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_type} &middot; {doc.file_name}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {doc.document_type}
                    </Badge>
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
