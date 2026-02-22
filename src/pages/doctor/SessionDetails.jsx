import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { getSession, getRecordingUrl } from "@/services/sessionService";
import { getSessionDocuments } from "@/services/documentService";
import { getEMRDrafts } from "@/services/emrService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChevronLeft,
  FileText,
  Mic,
  User,
  Clock,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Calendar,
  Stethoscope,
  Pill,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";

const STATUS_CONFIG = {
  completed:  { label: "Completed",  className: "bg-green-100 text-green-800" },
  ended:      { label: "Ended",      className: "bg-gray-100 text-gray-700" },
  active:     { label: "Active",     className: "bg-blue-100 text-blue-800" },
  accepted:   { label: "Accepted",   className: "bg-blue-100 text-blue-800" },
  pending:    { label: "Pending",    className: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  rejected:   { label: "Rejected",   className: "bg-red-100 text-red-800" },
};

const EMR_SECTIONS = [
  { key: "chief_complaint",          label: "Chief Complaint",            icon: User },
  { key: "history_present_illness",  label: "History of Present Illness", icon: ClipboardList },
  { key: "past_medical_history",     label: "Past Medical History",       icon: Calendar },
  { key: "medications",              label: "Medications",                icon: Pill },
  { key: "allergies",                label: "Allergies",                  icon: AlertTriangle },
  { key: "physical_examination",     label: "Physical Examination",       icon: Stethoscope },
  { key: "assessment",               label: "Assessment",                 icon: FileText },
  { key: "treatment_plan",           label: "Treatment Plan",             icon: CheckCircle2 },
  { key: "follow_up_plan",           label: "Follow-Up Plan",             icon: Clock },
];

const formatDate = (d) => new Date(d).toLocaleDateString("en-CA");
const formatTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const formatId   = (id) => `S${String(id).slice(0, 3).toUpperCase()}`;
const formatDuration = (secs) => {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
};

function emrFieldText(val) {
  if (!val) return null;
  if (typeof val === "string") return val;
  return JSON.stringify(val, null, 2);
}

export default function SessionDetails() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const token = authSession?.access_token;

  const [sessionData, setSessionData] = useState(null);
  const [documents, setDocuments]     = useState([]);
  const [emrDraft, setEmrDraft]       = useState(null);
  const [recordingUrl, setRecordingUrl] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    if (!token || !sessionId) return;
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [sess, docs, drafts, recResult] = await Promise.all([
          getSession(token, sessionId),
          getSessionDocuments(token, sessionId).catch(() => []),
          getEMRDrafts(token, sessionId).catch(() => []),
          getRecordingUrl(token, sessionId).catch(() => null),
        ]);
        setSessionData(sess);
        setDocuments(Array.isArray(docs) ? docs : []);
        const approved = (Array.isArray(drafts) ? drafts : []).find((d) => d.status === "approved");
        setEmrDraft(approved || (Array.isArray(drafts) && drafts.length > 0 ? drafts[0] : null));
        // Prefer presigned URL from dedicated endpoint; fall back to session field
        setRecordingUrl(recResult?.recording_url ?? recResult?.url ?? sess?.recording_url ?? null);
      } catch (err) {
        console.error("SessionDetails fetch error:", err);
        setError(err.message || "Failed to load session data.");
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [token, sessionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Loading session details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-4">
        <AlertTriangle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-destructive font-medium">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[sessionData?.status] || { label: sessionData?.status || "Unknown", className: "bg-gray-100 text-gray-700" };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="flex-1 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold font-heading leading-none">{sessionData?.patient_name || "Patient"}</h1>
                <span className="text-xs font-mono text-muted-foreground">{formatId(sessionId)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {sessionData?.created_at && (
                  <span>{formatDate(sessionData.created_at)} · {formatTime(sessionData.created_at)}</span>
                )}
                {sessionData?.duration_seconds && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(sessionData.duration_seconds)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusCfg.className}`}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      <Separator />

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── LEFT — EMR ── */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" />
                  Electronic Medical Record
                </CardTitle>
                {emrDraft?.status === "approved" && (
                  <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50">
                    Approved
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!emrDraft ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  EMR is not yet available. The AI may still be processing this session.
                </p>
              ) : (
                <div className="space-y-4">
                  {EMR_SECTIONS.map(({ key, label, icon: Icon }) => {
                    const val = emrFieldText(emrDraft[key]);
                    if (!val) return null;
                    return (
                      <div key={key}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-1.5">
                          <Icon className="w-3.5 h-3.5" />
                          {label}
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{val}</p>
                        <Separator className="mt-3" />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT — Recording + Documents ── */}
        <div className="space-y-6">

          {/* Voice Recording */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mic className="w-4 h-4 text-primary" />
                Voice Recording
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recordingUrl ? (
                <audio
                  controls
                  src={recordingUrl}
                  className="w-full h-10 rounded-lg"
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">No recording available for this session.</p>
              )}
            </CardContent>
          </Card>

          {/* Shared Documents */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Shared Documents
                </CardTitle>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                  {documents.length} {documents.length === 1 ? "file" : "files"}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No documents were shared in this session.</p>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc, i) => (
                    <div
                      key={doc.id || i}
                      className="p-3 rounded-xl border border-border bg-background/60 hover:border-primary/30 hover:shadow-sm transition-all duration-200"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`p-1.5 rounded-lg shrink-0 ${doc.status === "ready" ? "bg-primary/5 text-primary" : "bg-muted/40 text-muted-foreground/40"}`}>
                          {doc.status === "ready" ? (
                            <FileText className="w-3.5 h-3.5" />
                          ) : (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-semibold text-xs truncate">{doc.title || doc.file_name}</p>
                            {doc.storage_url && (
                              <a
                                href={doc.storage_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-primary hover:underline shrink-0 flex items-center gap-0.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </a>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-tighter font-medium">
                            {doc.status === "ready" ? (doc.document_type || "Document") : "Analyzing..."}
                          </p>
                        </div>
                      </div>
                      {doc.analysis_result && (
                        <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-1.5 text-xs">
                          <p className="font-bold text-primary text-[10px] uppercase tracking-wider">Lab Analysis</p>
                          {doc.analysis_result.summary && (
                            <p className="text-muted-foreground leading-relaxed">{doc.analysis_result.summary}</p>
                          )}
                          {Array.isArray(doc.analysis_result.key_findings) && doc.analysis_result.key_findings.length > 0 && (
                            <div>
                              <p className="font-semibold mb-0.5">Key Findings:</p>
                              {doc.analysis_result.key_findings.map((f, fi) => (
                                <div key={fi} className="flex items-start gap-1 ml-1">
                                  <ChevronDown className="w-3 h-3 text-primary mt-0.5 shrink-0 -rotate-90" />
                                  <span>{f}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {Array.isArray(doc.analysis_result.risk_flags) && doc.analysis_result.risk_flags.length > 0 && (
                            <div>
                              <p className="font-semibold mb-0.5">Risk Flags:</p>
                              {doc.analysis_result.risk_flags.map((flag, fi) => (
                                <div key={fi} className="flex items-center gap-1 ml-1">
                                  <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
                                  <span className="text-yellow-700">{typeof flag === "string" ? flag : flag.flag}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
