import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Mic,
  MicOff,
  StopCircle,
  FileText,
  Brain,
  Loader2,
  AlertTriangle,
  ChevronRight,
  User,
  Stethoscope,
  Clock,
  Shield,
  Sparkles,
} from "lucide-react";
import { getSession, startSession, endSession, transcribeAudio } from "@/services/sessionService";
import { getSessionDocuments } from "@/services/documentService";
import { getInsights } from "@/services/emrService";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

export default function IndividualSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const { subscribe } = useWebSocket();
  const token = authSession?.access_token;

  const [sessionData, setSessionData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [insights, setInsights] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(0);

  const {
    startRecording: startAudioRecording,
    pauseRecording: pauseAudioRecording,
    stopRecording: stopAudioRecording,
  } = useAudioRecorder();

  // Fetch session data
  useEffect(() => {
    async function load() {
      if (!token || !sessionId) return;
      try {
        const [sess, docs, ins] = await Promise.all([
          getSession(token, sessionId),
          getSessionDocuments(token, sessionId).catch(() => []),
          getInsights(token, sessionId).catch(() => []),
        ]);
        setSessionData(sess);
        setDocuments(docs);
        setInsights(ins);
      } catch (err) {
        console.error("Failed to load session:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, sessionId]);

  // Consultation Timer
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Listen for real-time events
  useEffect(() => {
    const unsub1 = subscribe("FILE_SHARED", (data) => {
      if (data.session_id === sessionId) {
        const newDocs = (data.documents || []).filter(
          (d) => !documents.some((p) => p.id === d.id)
        );
        if (newDocs.length > 0) {
          setDocuments((prev) => [...prev, ...newDocs.filter((d) => !prev.some((p) => p.id === d.id))]);
          toast.info(
            `Patient shared ${newDocs.length} file${newDocs.length > 1 ? "s" : ""} — check Clinical Registry`,
            { icon: "📄", duration: 5000 }
          );
        }
      }
    });

    const unsub2 = subscribe("AI_INSIGHT_READY", (data) => {
      if (data.session_id === sessionId) {
        if (data.insight) {
          setAiInsight(data.insight);
        }
        if (data.document_id) {
          setInsights((prev) => [...prev, data]);
        }
      }
    });

    const unsub3 = subscribe("EMR_DRAFT_READY", (data) => {
      if (data.session_id === sessionId) {
        navigate(`/doctor/review/${sessionId}`);
      }
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [subscribe, sessionId, navigate]);

  const handleStartRecording = useCallback(async () => {
    try {
      await startSession(token, sessionId);
      setSessionData(prev => ({ ...prev, status: "active" }));
      await startAudioRecording();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      if (err.name === "NotAllowedError") {
        alert("Microphone access denied. Please allow microphone access.");
      }
    }
  }, [token, sessionId, startAudioRecording]);

  const handleStopRecording = useCallback(() => {
    pauseAudioRecording();
    setIsRecording(false);
  }, [pauseAudioRecording]);

  async function handleEndSession() {
    setIsEnding(true);
    setIsRecording(false);

    try {
      const audioResult = await stopAudioRecording();
      if (audioResult?.blob) {
        try {
          await transcribeAudio(token, sessionId, audioResult.blob);
          console.log("Audio uploaded to S3 successfully");
        } catch (uploadErr) {
          console.error("Failed to upload audio to S3:", uploadErr);
        }
      }

      await endSession(token, { sessionId, sessionNotes: "" });
    } catch (err) {
      console.error("Failed to end session:", err);
      setIsEnding(false);
    }
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

  return (
    <div className="flex flex-col h-screen gap-4 p-6">

      {/* ─── TOP HEADER BAR ─── */}
      <header className="flex items-center justify-between bg-card px-6 py-4 rounded-2xl border border-border shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary border border-primary/20">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold font-heading leading-none tracking-tight">
                {sessionData.patient_name}
              </h1>
              <Badge
                variant={sessionData.status === "active" ? "default" : "outline"}
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                  sessionData.status === "active"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "border-primary/40 text-primary"
                }`}
              >
                {{ accepted: "Accepted", active: "Active", pending: "Pending", processing: "Processing" }[sessionData.status] ?? sessionData.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
              <Stethoscope className="w-3 h-3" />
              {sessionData.chief_complaint || "General consultation"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Duration */}
          <div className="text-right pr-5 border-r border-border/60 hidden sm:block">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" />
              Duration
            </p>
            <p className="text-2xl font-mono font-bold tabular-nums text-foreground mt-0.5">
              {formatDuration(duration)}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2.5">
            {!isRecording ? (
              <Button
                onClick={handleStartRecording}
                className="gap-2 rounded-full px-5 shadow-md shadow-primary/20 bg-primary hover:bg-primary/90 transition-all"
              >
                <Mic className="w-4 h-4" />
                Start Recording
              </Button>
            ) : (
              <Button
                onClick={handleStopRecording}
                variant="outline"
                className="gap-2 rounded-full border-amber-400/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-all"
              >
                <MicOff className="w-4 h-4" />
                Pause
              </Button>
            )}
            <Button
              onClick={handleEndSession}
              variant="destructive"
              disabled={isEnding}
              className="gap-2 rounded-full px-5"
            >
              {isEnding ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
              {isEnding ? "Processing..." : "Finish"}
            </Button>
          </div>
        </div>
      </header>

      {/* ─── RECORDING BANNER ─── */}
      {isRecording && (
        <div className="flex items-center gap-3 px-5 py-2.5 bg-destructive/5 border border-destructive/15 rounded-xl flex-shrink-0 animate-in fade-in duration-300">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
          </span>
          <span className="text-sm text-destructive font-medium">Recording in progress — speak clearly into your microphone</span>
          <span className="ml-auto text-xs font-mono text-destructive/60 tabular-nums">{formatDuration(duration)}</span>
        </div>
      )}

      {/* ─── MAIN CONTENT ─── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Left — Consultation Workspace */}
        <div className="w-1/2 h-full flex flex-col min-w-0 gap-4">
          {isRecording ? (
            /* ── Recording State ── */
            <div className="flex-1 rounded-2xl border border-border/60 bg-card flex flex-col items-center justify-center overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-primary/5 pointer-events-none" />

              <div className="relative flex flex-col items-center gap-8 z-10">
                {/* Mic Orb */}
                <div className="relative">
                  <div className="absolute inset-[-12px] rounded-full border-2 border-primary/15 animate-[spin_6s_linear_infinite]" />
                  <div className="absolute inset-[-28px] rounded-full border border-primary/8 animate-[spin_10s_linear_infinite_reverse]" />
                  <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping opacity-50" />
                  <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-primary/25 to-primary/5 flex items-center justify-center text-primary border border-primary/25 shadow-lg shadow-primary/10">
                    <Mic className="w-9 h-9" />
                  </div>
                </div>

                {/* Waveform */}
                <div className="flex items-end gap-[3px] h-8">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-primary/50 rounded-full animate-waveform"
                      style={{
                        animationDelay: `${i * 0.08}s`,
                        opacity: 0.3 + Math.abs(10 - i) / 15,
                      }}
                    />
                  ))}
                </div>

                <div className="text-center space-y-1.5">
                  <p className="text-xl font-bold font-heading">Listening...</p>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Capturing clinical audio. Full EMR draft will be generated when the session ends.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* ── Idle / Waiting State ── */
            <div className="flex-1 rounded-2xl border border-border/60 bg-card flex flex-col items-center justify-center overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-muted/30 via-transparent to-primary/3 pointer-events-none" />

              <div className="relative flex flex-col items-center gap-6 z-10 max-w-md text-center px-6">
                <div className="w-20 h-20 rounded-2xl bg-primary/8 flex items-center justify-center text-primary border border-primary/15">
                  <Mic className="w-8 h-8 opacity-60" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-bold font-heading tracking-tight">Ready for Consultation</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Click "Start Recording" to begin capturing the clinical conversation. Audio will be transcribed and processed into EMR documentation automatically.
                  </p>
                </div>

                {/* Quick Stats Row */}
                <div className="flex items-center gap-4 mt-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">{documents.length} {documents.length === 1 ? "file" : "files"}</span>
                  </div>
                  <div className="w-px h-3 bg-border" />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Brain className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">{insights.length} {insights.length === 1 ? "insight" : "insights"}</span>
                  </div>
                  <div className="w-px h-3 bg-border" />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium">Encrypted</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── AI Insights Grid (appears when data arrives) ── */}
          {aiInsight && (
            <div className="grid grid-cols-2 gap-3 flex-shrink-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {aiInsight.key_observations?.length > 0 && (
                <Card className="border-border/60">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Key Observations</p>
                    </div>
                    <div className="space-y-1.5">
                      {aiInsight.key_observations.map((obs, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                          <span className="text-xs leading-relaxed text-foreground/80">{obs}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {aiInsight.suggested_questions?.length > 0 && (
                <Card className="border-border/60">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Stethoscope className="w-3.5 h-3.5 text-primary" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Suggested Questions</p>
                    </div>
                    <div className="space-y-1.5">
                      {aiInsight.suggested_questions.map((q, i) => (
                        <div key={i} className="p-2 rounded-lg bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors cursor-pointer">
                          <p className="text-xs font-medium text-primary italic">"{q}"</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {aiInsight.potential_concerns?.length > 0 && (
                <Card className="border-border/60">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Red Flags</p>
                    </div>
                    <div className="space-y-1.5">
                      {aiInsight.potential_concerns.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                          <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
                          <span className="text-xs font-medium text-destructive">{c}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {aiInsight.differential_diagnoses?.length > 0 && (
                <Card className="border-border/60">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Brain className="w-3.5 h-3.5 text-primary" />
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Differential</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {aiInsight.differential_diagnoses.map((d, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors cursor-default"
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Right — Clinical Registry */}
        <div className="w-1/2 h-full flex flex-col animate-in slide-in-from-right duration-500">
          <Card className="flex-1 overflow-hidden flex flex-col border-border/60 shadow-sm">
            <CardHeader className="py-2 px-3 border-b">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <FileText className="w-3.5 h-3.5" />
                  Clinical Registry
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {documents.length} {documents.length === 1 ? "file" : "files"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-3 space-y-2">
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-40">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium max-w-[140px] leading-relaxed">No files shared yet</p>
                </div>
              ) : (
                documents.map((doc, i) => (
                  <div
                    key={doc.id || i}
                    className="group p-3 rounded-xl border border-border bg-background/60 hover:border-primary/30 hover:shadow-sm transition-all duration-200 cursor-pointer relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight className="w-3 h-3 text-primary" />
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className={`p-1.5 rounded-lg ${doc.status === 'ready' ? 'bg-primary/5 text-primary group-hover:bg-primary/10' : 'bg-muted/40 text-muted-foreground/40'} transition-colors flex-shrink-0`}>
                        {doc.status === 'ready' ? (
                          <FileText className="w-3.5 h-3.5" />
                        ) : (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="font-semibold text-xs truncate group-hover:text-primary transition-colors">{doc.title || doc.file_name}</p>
                          {doc.storage_url && (
                            <a href={doc.storage_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex-shrink-0">View</a>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-tighter font-medium">
                          {doc.status === 'ready' ? (doc.type || doc.document_type || "Document") : "Analyzing..."}
                        </p>
                      </div>
                    </div>
                    {doc.analysis_result && (
                      <div className="mt-2.5 p-2.5 rounded-lg bg-primary/5 border border-primary/10 space-y-2 text-xs">
                        <p className="font-bold text-primary text-[10px] uppercase tracking-wider">Lab Analysis</p>
                        {doc.analysis_result.summary && (
                          <p className="text-muted-foreground leading-relaxed">{doc.analysis_result.summary}</p>
                        )}
                        {Array.isArray(doc.analysis_result.key_findings) && doc.analysis_result.key_findings.length > 0 && (
                          <div>
                            <p className="font-semibold mb-1">Key Findings:</p>
                            {doc.analysis_result.key_findings.map((f, fi) => (
                              <div key={fi} className="flex items-start gap-1.5 ml-0.5 mb-0.5">
                                <ChevronRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                                <span className="text-muted-foreground leading-relaxed">{typeof f === "string" ? f : f.finding || f.value || JSON.stringify(f)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(doc.analysis_result.recommendations) && doc.analysis_result.recommendations.length > 0 && (
                          <div>
                            <p className="font-semibold mb-1">Recommendations:</p>
                            {doc.analysis_result.recommendations.map((r, ri) => (
                              <div key={ri} className="flex items-start gap-1.5 ml-0.5 mb-0.5">
                                <ChevronRight className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                                <span className="text-muted-foreground leading-relaxed">{typeof r === "string" ? r : r.recommendation || JSON.stringify(r)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(doc.analysis_result.risk_flags) && doc.analysis_result.risk_flags.length > 0 && (
                          <div>
                            <p className="font-semibold mb-1">Risk Flags:</p>
                            {doc.analysis_result.risk_flags.map((flag, fi) => (
                              <div key={fi} className="flex items-center gap-1.5 ml-0.5 mb-0.5">
                                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                <span className="text-muted-foreground leading-relaxed">{typeof flag === "string" ? flag : flag.flag || JSON.stringify(flag)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Registry AI Insights */}
              {insights.length > 0 && (
                <div className="space-y-2 pt-3">
                  <div className="flex items-center gap-2 px-1">
                    <div className="h-px flex-1 bg-border" />
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Insights</p>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  {insights.map((ins, i) => (
                    <div key={ins.id || i} className="p-3 rounded-xl bg-primary/5 border border-primary/15 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Brain className="w-3 h-3 text-primary" />
                        <p className="font-bold text-[10px] text-primary uppercase tracking-wider">AI Synthesis</p>
                      </div>
                      <p className="text-[11px] leading-relaxed text-foreground/75 italic">
                        "{ins.summary || ins.insight?.summary || "Analyzing..."}"
                      </p>
                      {(ins.risk_flags || ins.insight?.risk_flags)?.map((flag, fi) => (
                        <div key={fi} className="flex items-start gap-1.5 p-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
                          <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
                          <span className="text-[10px] text-destructive font-bold uppercase tracking-tight">{typeof flag === "string" ? flag : flag.flag}</span>
                        </div>
                      ))}
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
