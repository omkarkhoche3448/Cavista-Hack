import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Upload,
  Check,
  Loader2,
  Share2,
  Heart,
  Pill,
  AlertTriangle,
  ClipboardList,
  ArrowLeft,
  Mic,
  Stethoscope,
  User,
} from "lucide-react";
import { getSession } from "@/services/sessionService";
import { listDocuments, shareDocuments, uploadDocument } from "@/services/documentService";
import { getPatientSummary } from "@/services/emrService";
import FileUploadModal from "./FileUploadModal";

export default function PatientSessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const { subscribe } = useWebSocket();
  const token = authSession?.access_token;

  const [sessionData, setSessionData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [transcriptChunks, setTranscriptChunks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    async function fetchSummary() {
      setLoadingSummary(true);
      try {
        const data = await getPatientSummary(token, sessionId);
        setSummary(data);
      } catch (err) {
        console.error("Failed to load summary:", err);
      } finally {
        setLoadingSummary(false);
      }
    }

    async function load() {
      if (!token) return;
      setLoading(true);
      try {
        const [sess, docs] = await Promise.all([
          getSession(token, sessionId),
          listDocuments(token).catch(() => []),
        ]);
        setSessionData(sess);
        setDocuments(docs);

        if (sess.status === "completed") {
          fetchSummary();
        }
      } catch (err) {
        console.error("Failed to load session:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token, sessionId]);

  // Listen for transcript and session events
  useEffect(() => {
    const unsub1 = subscribe("TRANSCRIPT_CHUNK", (data) => {
      if (data.session_id === sessionId) {
        setTranscriptChunks((prev) => {
          const exists = prev.find((c) => c.chunk_index === data.chunk_index);
          if (exists) return prev;
          return [...prev, data];
        });
      }
    });
    const unsub2 = subscribe("SESSION_ENDED", (data) => {
      if (data.session_id === sessionId) {
        setSessionData((prev) => prev ? { ...prev, status: "ended" } : prev);
      }
    });
    const unsub3 = subscribe("SESSION_STARTED", (data) => {
      if (data.session_id === sessionId) {
        setSessionData((prev) => prev ? { ...prev, status: "active" } : prev);
      }
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [subscribe, sessionId]);

  function toggleDoc(docId) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  async function handleShare() {
    if (selectedDocs.size === 0) return;
    setSharing(true);
    try {
      await shareDocuments(token, {
        sessionId,
        documentIds: Array.from(selectedDocs),
      });
      setShared(true);
    } catch (err) {
      console.error("Failed to share docs:", err);
    } finally {
      setSharing(false);
    }
  }

  function handleFileUploaded(doc) {
    setDocuments((prev) => [doc, ...prev]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Session not found.</p>
      </div>
    );
  }

  const isEnded = ["ended", "processing", "completed"].includes(sessionData.status);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/patient/dashboard")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Session with {sessionData.doctor_name}
              <Badge
                variant={
                  sessionData.status === "active"
                    ? "success"
                    : sessionData.status === "accepted"
                      ? "info"
                      : "secondary"
                }
              >
                {sessionData.status}
              </Badge>
            </h1>
            <p className="text-muted-foreground">
              {sessionData.chief_complaint || "General consultation"}
            </p>
          </div>
        </div>

        {!isEnded && (
          <Button
            variant="destructive"
            className="gap-2"
            onClick={() => {
              if (confirm("Are you sure you want to leave this session?")) {
                navigate("/patient/dashboard");
              }
            }}
          >
            <ArrowLeft className="w-4 h-4" />
            Leave Session
          </Button>
        )}
      </div>

      {isEnded && (
        <div className="space-y-6">
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10">
            <CardContent className="py-4 text-center">
              <p className="font-medium text-blue-800 dark:text-blue-300">
                {sessionData.status === "completed"
                  ? "Visit summary is ready for your review."
                  : "This session has ended. Your doctor is reviewing the details."}
              </p>
              {sessionData.status !== "completed" && (
                <p className="text-sm text-muted-foreground">
                  You&apos;ll receive a summary once the doctor approves the AI analysis.
                </p>
              )}
            </CardContent>
          </Card>

          {summary && (
            <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Heart className="w-5 h-5 text-primary" />
                  Visit Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="py-6 space-y-8">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p className="text-lg leading-relaxed whitespace-pre-wrap">
                    {summary.summary_text}
                  </p>
                </div>

                {summary.key_takeaways?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-primary" />
                      Key Takeaways
                    </h3>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {summary.key_takeaways.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 bg-muted/50 p-3 rounded-lg text-sm">
                          <Check className="w-4 h-4 text-green-600 mt-0.5" />
                          <span>{item.point || item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {summary.medications_list?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Pill className="w-4 h-4 text-primary" />
                      Medications & Instructions
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {summary.medications_list.map((med, i) => (
                        <div key={i} className="p-3 border rounded-lg bg-card shadow-sm">
                          <p className="font-bold text-primary">{med.name}</p>
                          {med.what_it_does && (
                            <p className="text-xs text-muted-foreground mb-2 italic">{med.what_it_does}</p>
                          )}
                          <p className="text-sm">{med.how_to_take}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summary.warnings?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-4 h-4" />
                      Important Precautions
                    </h3>
                    {summary.warnings.map((w, i) => (
                      <div key={i} className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-800 dark:text-red-300">
                        {w.warning || w}
                      </div>
                    ))}
                  </div>
                )}

                {summary.follow_up_notes && (
                  <div className="pt-4 border-t">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Next Steps</h3>
                    <p className="text-sm">{summary.follow_up_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {loadingSummary && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document Sharing */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Share Medical Records
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowUpload(true)}
                  className="gap-1"
                >
                  <Upload className="w-3 h-3" />
                  Add New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No documents yet. Upload some records to share with your doctor.
                </p>
              ) : (
                documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedDocs.has(doc.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                      }`}
                    onClick={() => !shared && toggleDoc(doc.id)}
                  >
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${selectedDocs.has(doc.id)
                        ? "border-primary bg-primary"
                        : "border-input"
                        }`}
                    >
                      {selectedDocs.has(doc.id) && (
                        <Check className="w-3 h-3 text-primary-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_type} &middot; {doc.file_name}
                      </p>
                    </div>
                  </div>
                ))
              )}

              {!shared && documents.length > 0 && !isEnded && (
                <Button
                  className="w-full mt-3 gap-2"
                  onClick={handleShare}
                  disabled={selectedDocs.size === 0 || sharing}
                >
                  {sharing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                  Share {selectedDocs.size} Document{selectedDocs.size !== 1 ? "s" : ""} with Doctor
                </Button>
              )}

              {shared && (
                <div className="flex items-center justify-center gap-2 py-2 text-green-600 text-sm">
                  <Check className="w-4 h-4" />
                  Documents shared successfully
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Live Transcript View (read-only for patient) */}
        <Card className="min-h-[400px] flex flex-col">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Session Transcript
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3">
            {transcriptChunks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Mic className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">
                  {sessionData.status === "active"
                    ? "Transcript will appear here as the session progresses"
                    : "Waiting for the session to start..."}
                </p>
              </div>
            ) : (
              transcriptChunks.map((chunk, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${chunk.speaker_role === "doctor" ? "justify-start" : "justify-end"
                    }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${chunk.speaker_role === "doctor"
                      ? "bg-muted text-foreground"
                      : "bg-primary/10 text-foreground"
                      }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      {chunk.speaker_role === "doctor" ? (
                        <Stethoscope className="w-3 h-3 text-primary" />
                      ) : (
                        <User className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-xs font-medium capitalize">
                        {chunk.speaker_role}
                      </span>
                    </div>
                    <p>{chunk.text || chunk.raw_text}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <FileUploadModal
        open={showUpload}
        onOpenChange={setShowUpload}
        onUploaded={handleFileUploaded}
      />
    </div>
  );
}
