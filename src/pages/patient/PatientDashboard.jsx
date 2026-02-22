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
  Trash2,
  Loader2,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { listSessions, respondToSession } from "@/services/sessionService";
import { listDocuments, deleteDocument } from "@/services/documentService";
import { motion, AnimatePresence } from "framer-motion";
import FileUploadModal from "../../features/patient-dashboard/FileUploadModal";
import SessionRequestCard from "../../features/patient-dashboard/SessionRequestCard";
import SummaryModal from "../../features/patient-dashboard/SummaryModal";
// SessionInvitationModal removed, it's now in DashboardLayout for global coverage

const STATUS_BADGE = {
  pending: { variant: "warning", label: "Pending" },
  accepted: { variant: "info", label: "Accepted" },
  active: { variant: "success", label: "Active" },
  processing: { variant: "info", label: "Processing…" },
  completed: { variant: "secondary", label: "Done ✓" },
  ended: { variant: "secondary", label: "Done ✓" },
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
      const [sessDataRaw, docsData] = await Promise.all([
        listSessions(token, { pageSize: 50 }),
        listDocuments(token).catch(() => []),
      ]);
      console.log("[PatientDashboard] API Results:", { sessDataRaw, docsData });
      const sessData = Array.isArray(sessDataRaw) ? sessDataRaw : (sessDataRaw?.sessions || []);
      setSessions(sessData);
      setPendingRequests(sessData.filter((s) => s.status === "pending"));
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
    const unsubAI = subscribe("AI_PROCESSING_COMPLETE", (data) => {
      // Flip the matching session to "completed" — WS event IS the source of truth
      setSessions((prev) =>
        prev.map((s) =>
          s.id === data.session_id ? { ...s, status: "completed" } : s
        )
      );
      toast.success("Your session report is ready! AI processing complete.", {
        icon: "🎉",
        duration: 5000,
      });
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
    const unsub7 = subscribe("DOCUMENT_ANALYSIS_COMPLETE", (data) => {
      console.log("[DOCUMENT_ANALYSIS_COMPLETE] payload:", data);
      setDocuments((prev) => {
        console.log("[DOCUMENT_ANALYSIS_COMPLETE] docs in state:", prev.map(d => ({ id: d.id, status: d.status })));
        const matched = prev.some(d => d.id === data.document_id);
        console.log("[DOCUMENT_ANALYSIS_COMPLETE] ID matched in state:", matched);
        return prev.map((d) => d.id === data.document_id ? { ...d, status: "ready" } : d);
      });
      // DB is already updated before WS fires — safe to re-fetch as guaranteed fallback
      fetchData();
      toast.success("Document analysis complete!");
    });
    return () => { unsub1(); unsub2(); unsubAI(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7(); };
  }, [subscribe, fetchData]);

  async function handleRespond(sessionId, action, reason) {
    // Fire and forget response
    respondToSession(token, { sessionId, action, reason }).catch(err => {
      console.error("Background session response failed:", err);
    });

    // Update UI immediately
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, status: action === "accept" ? "accepted" : "rejected" } : s
      )
    );
    setPendingRequests((prev) => prev.filter((s) => s.id !== sessionId));

    if (action === "accept") {
      toast.success("Joining session...");
      navigate(`/patient/session/${sessionId}`);
    } else {
      toast.info("Session request declined.");
    }
  }

  async function handleDeleteDocument(documentId) {
    if (!window.confirm("Are you sure you want to remove this record?")) return;
    try {
      await deleteDocument(token, documentId);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      toast.success("Document removed successfully");
    } catch (err) {
      console.error("Failed to delete document:", err);
      toast.error("Failed to delete document");
    }
  }

  function handleFileUploaded(doc) {
    if (doc._replaceTempId) {
      // Upload succeeded — swap placeholder for the real doc
      const { _replaceTempId, ...realDoc } = doc;
      setDocuments((prev) =>
        prev.map((d) => (d.id === _replaceTempId ? realDoc : d))
      );
    } else if (doc._markFailed) {
      // Upload failed — remove the placeholder
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } else {
      // Initial placeholder — prepend to list
      setDocuments((prev) => [doc, ...prev]);
    }
  }

  const completedSessions = sessions.filter((s) =>
    ["completed", "ended"].includes(s.status)
  );
  const processingSessions = sessions.filter((s) => s.status === "processing");
  const activeSessions = sessions.filter((s) =>
    ["accepted", "active"].includes(s.status)
  );

  return (
    <div className="max-w-7xl mx-auto space-y-10 p-4 md:p-8">
      {/* Premium Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden p-10 rounded-[3rem] bg-slate-900 text-white shadow-2xl shadow-slate-200"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-[100px] -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] -ml-32 -mb-32" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-bold tracking-wider uppercase">
              <ShieldCheck className="w-4 h-4 text-primary" /> Verified Health Profile
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-none">
              Welcome back, <br />
              <span className="text-primary">{profile?.first_name}</span>
            </h1>
            <div className="flex items-center gap-4 text-slate-400">
              {isConnected ? (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Support Active
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold">
                  <WifiOff className="w-3 h-3" /> Offline Mode
                </div>
              )}
              <span className="text-slate-600">|</span>
              <p className="text-sm font-medium">Your Sevamitra dashboard is ready</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Button
              onClick={() => setShowUpload(true)}
              size="lg"
              className="w-full sm:w-auto rounded-2xl h-14 px-8 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 transition-all active:scale-95 font-black gap-3"
            >
              <Plus className="w-6 h-6" />
              Upload Medical Records
            </Button>
          </div>
        </div>
      </motion.div>

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-[2rem]" />
          ))
        ) : (
          <>
            <motion.div whileHover={{ y: -5 }} className="relative p-8 rounded-[2rem] bg-white border border-slate-100 shadow-xl shadow-slate-100/50 group overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <FileText className="w-16 h-16 text-primary" />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Medical Records</p>
              <h3 className="text-4xl font-black text-slate-900">{documents.length}</h3>
              <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" /> Files securely stored
              </p>
            </motion.div>

            <motion.div whileHover={{ y: -5 }} className="relative p-8 rounded-[2rem] bg-white border border-slate-100 shadow-xl shadow-slate-100/50 group overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <Activity className="w-16 h-16 text-emerald-500" />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Active Trials</p>
              <h3 className="text-4xl font-black text-slate-900">{activeSessions.length}</h3>
              <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Live consultations
              </p>
            </motion.div>

            <motion.div whileHover={{ y: -5 }} className="relative p-8 rounded-[2rem] bg-white border border-slate-100 shadow-xl shadow-slate-100/50 group overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                <ClipboardList className="w-16 h-16 text-indigo-500" />
              </div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Visit Reviews</p>
              <h3 className="text-4xl font-black text-slate-900">{completedSessions.length}</h3>
              <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> AI-processed summaries
              </p>
            </motion.div>
          </>
        )}
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Active Consultations</h2>
          <div className="grid grid-cols-1 gap-4">
            {activeSessions.map((s) => (
              <motion.div
                key={s.id}
                whileHover={{ x: 5 }}
                className="group p-6 rounded-[2rem] bg-indigo-50/50 border border-indigo-100 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => navigate(`/patient/session/${s.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-primary font-black text-xl">
                      {s.doctor_name?.[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-black text-slate-900">{s.doctor_name}</p>
                        <Badge className="bg-emerald-500 text-white border-none font-bold px-3 py-0.5 text-[10px] uppercase tracking-wider">
                          {STATUS_BADGE[s.status]?.label}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-500">
                        {s.chief_complaint || "General consultation"}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="rounded-xl h-12 px-6 bg-white border border-indigo-100 text-primary hover:bg-primary hover:text-white hover:border-primary transition-all font-bold gap-2"
                  >
                    Enter Session <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Processing Sessions — shown while AI pipeline is running */}
      {processingSessions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
            Generating Your Report
          </h2>
          <div className="grid grid-cols-1 gap-4">
            {processingSessions.map((s) => (
              <div
                key={s.id}
                className="p-6 rounded-[2rem] bg-amber-50/60 border-2 border-amber-200 border-dashed animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900">{s.doctor_name}</p>
                      <p className="text-sm font-medium text-slate-500">
                        {s.chief_complaint || "General consultation"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-xs font-black uppercase tracking-widest">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    AI Processing…
                  </div>
                </div>
                <p className="text-xs text-amber-600/80 mt-4 font-medium pl-1">
                  🧠 Our AI is generating your EMR draft, ICD codes, and clinical summary.
                  This usually takes 1–2 minutes.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents - Refined Grid */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Health Documents</h2>
            <p className="text-sm font-medium text-slate-500">Securely store and share your clinical records.</p>
          </div>
          {documents.length > 0 && (
            <div className="flex items-center gap-3">
              {documents.some(d => d.status !== 'ready') && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Syncing AI Insights...</span>
                </div>
              )}
              <Badge variant="outline" className="rounded-full px-4 py-1 font-bold text-slate-600">
                {documents.length} Files
              </Badge>
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-28 w-full rounded-[2rem]" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[3rem] p-16 text-center">
            <div className="mx-auto w-20 h-20 rounded-3xl bg-white shadow-xl shadow-slate-100 flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">No medical documents found</h3>
            <p className="text-slate-500 max-w-sm mx-auto mt-2 mb-8 text-sm font-medium">
              Start by uploading your lab reports, prescriptions, or imaging results.
            </p>
            <Button onClick={() => setShowUpload(true)} variant="outline" className="rounded-2xl px-10 h-12 font-bold border-slate-200 hover:bg-white hover:shadow-lg transition-all">
              Initialize First Upload
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <AnimatePresence>
              {documents.map((doc, idx) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => {/* View logic could go here */ }}
                  className="group relative p-6 rounded-[2rem] bg-white border border-slate-100 shadow-lg shadow-slate-100/50 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all cursor-pointer overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-100 group-hover:bg-primary transition-colors" />
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className={`p-3 rounded-2xl ${doc.status === 'ready' ? 'bg-slate-50 text-slate-400 group-hover:bg-primary/5 group-hover:text-primary' : 'bg-amber-50 text-amber-500'} transition-all`}>
                        {doc.status === 'ready' ? (
                          <FileText className="w-6 h-6" />
                        ) : (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`${doc.status === 'ready' ? 'bg-slate-100 text-slate-600 group-hover:bg-primary group-hover:text-white' : 'bg-amber-100 text-amber-600 animate-pulse'} transition-colors border-none text-[10px] font-black uppercase tracking-tighter`}>
                          {doc.status === 'ready' ? doc.document_type : 'Processing AI...'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm group-hover:text-primary transition-colors line-clamp-1">{doc.title}</h4>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Added {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Completed Sessions / Summaries */}
      {completedSessions.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Visit History</h2>
          <div className="grid grid-cols-1 gap-4">
            {completedSessions.map((s) => (
              <div
                key={s.id}
                className="group p-6 rounded-[2rem] bg-white border border-slate-100 hover:border-primary/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/5 group-hover:text-primary transition-all">
                      <ClipboardList className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{s.doctor_name}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {s.chief_complaint || "General Visit"} &middot; {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/patient/session/${s.id}`)}
                    className="h-10 px-6 rounded-xl font-bold gap-2 hover:bg-primary/5 hover:text-primary transition-all"
                  >
                    <Eye className="w-4 h-4" />
                    View AI Summary
                  </Button>
                </div>
              </div>
            ))}
          </div>
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
