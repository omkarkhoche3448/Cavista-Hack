import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Activity,
} from "lucide-react";
import { getSession, startSession, endSession, transcribeAudio, getTranscript } from "@/services/sessionService";
import { getSessionDocuments } from "@/services/documentService";
import { getInsights } from "@/services/emrService";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

const STATUS_BADGE = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  accepted: { label: "Accepted", className: "bg-blue-100 text-blue-700 border-blue-200" },
  active: { label: "Active", className: "bg-primary/10 text-primary border-primary/20" },
  ended: { label: "Ended", className: "bg-muted text-muted-foreground border-border" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
};

const WAVE_HEIGHTS = [35, 70, 45, 85, 50, 80, 55, 90, 60, 75, 40, 65, 52, 88, 46];

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.trim() ? [value] : [];
  return [value];
}

export default function IndividualSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const { subscribe, send } = useWebSocket();
  const token = authSession?.access_token;

  const [sessionData, setSessionData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [insights, setInsights] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [requestingInsight, setRequestingInsight] = useState(false);
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
        const [sess, docs, ins, tr] = await Promise.all([
          getSession(token, sessionId),
          getSessionDocuments(token, sessionId).catch(() => []),
          getInsights(token, sessionId).catch(() => []),
          getTranscript(token, sessionId).catch(() => []),
        ]);
        setSessionData(sess);
        setDocuments(docs);
        setInsights(ins);
        setTranscript(Array.isArray(tr) ? tr : []);
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
        setDocuments((prev) => [
          ...prev,
          ...(data.documents || []).filter(
            (d) => !prev.some((p) => p.id === d.id)
          ),
        ]);
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

    const unsub4 = subscribe("TRANSCRIPT_CHUNK", (data) => {
      if (data.session_id !== sessionId) return;
      setTranscript((prev) => {
        const chunkIndex = data.chunk_index ?? data.chunkIndex ?? 0;
        if (prev.some((c) => (c.chunk_index ?? c.chunkIndex) === chunkIndex)) return prev;
        return [...prev, { ...data, chunk_index: chunkIndex }].sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
      });
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [subscribe, sessionId, navigate]);

  // Start mic audio recording only
  const startRecording = useCallback(async () => {
    try {
      if (sessionData?.status !== "active") {
        await startSession(token, sessionId);
        setSessionData((prev) => ({ ...prev, status: "active" }));
      }
      await startAudioRecording();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
      if (err.name === "NotAllowedError") {
        alert("Microphone access denied. Please allow microphone access.");
      }
    }
  }, [token, sessionId, startAudioRecording, sessionData?.status]);

  // Pause mic audio recording
  const stopRecording = useCallback(() => {
    pauseAudioRecording();
    setIsRecording(false);
  }, [pauseAudioRecording]);


  async function handleEndSession() {
    setIsEnding(true);
    setIsRecording(false);

    try {
      // Stop recording and upload audio blob to S3 via backend
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
      // Navigates to review page when EMR_DRAFT_READY WebSocket event arrives
    } catch (err) {
      console.error("Failed to end session:", err);
      setIsEnding(false);
    }
  }

  async function handleRequestInsight() {
    if (!sessionId) return;
    setRequestingInsight(true);
    try {
      send("REQUEST_AI_INSIGHT", { session_id: sessionId });
    } finally {
      // give the server a moment to respond; this is purely UI polish
      setTimeout(() => setRequestingInsight(false), 600);
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

  const statusCfg = STATUS_BADGE[sessionData.status] ?? {
    label: sessionData.status || "—",
    className: "bg-muted text-muted-foreground border-border",
  };

  return (
    <div className="flex flex-col gap-6 min-h-[calc(100vh-10rem)] p-4 lg:p-6">
      {/* Session Header - Full Width */}
      <div className="bg-card p-4 lg:p-6 rounded-xl border shadow-card">
        <div className="flex gap-3 z-20 flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg lg:text-xl font-bold font-heading whitespace-nowrap">
                    {sessionData.patient_name}
                  </h2>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0 ${statusCfg.className}`}>
                    {statusCfg.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Duration + Buttons */}
            <div className="flex items-center gap-3 lg:gap-4 flex-wrap justify-end sm:flex-nowrap flex-shrink-0">
              <div className="flex flex-col items-end">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest leading-tight">Duration</p>
                <p className="text-lg lg:text-2xl font-mono font-bold text-primary">{formatDuration(duration)}</p>
              </div>

              <div className="flex items-center gap-2">
                {(sessionData.status === "accepted" || sessionData.status === "active") && !isRecording && (
                  <Button onClick={startRecording} variant="hero" className="gap-2 rounded-xl text-xs lg:text-sm py-2">
                    <Mic className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">{sessionData.status === "active" ? "Resume" : "Start"}</span>
                  </Button>
                )}
                {isRecording && (
                  <Button
                    onClick={stopRecording}
                    variant="outline"
                    className="gap-2 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/5 transition-all text-xs lg:text-sm py-2"
                  >
                    <MicOff className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">Pause</span>
                  </Button>
                )}
                <Button
                  onClick={handleEndSession}
                  variant="destructive"
                  disabled={isEnding}
                  className="gap-2 rounded-xl text-xs lg:text-sm py-2"
                >
                  {isEnding ? (
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  ) : (
                    <StopCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="hidden sm:inline">{isEnding ? "Processing..." : "Finish"}</span>
                  <span className="sm:hidden">{isEnding ? "..." : "End"}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Bottom Row: Chief Complaint */}
          <p className="text-xs lg:text-sm text-muted-foreground flex items-center gap-2">
            <Stethoscope className="w-4 h-4 flex-shrink-0 text-primary" />
            <span className="truncate">{sessionData.chief_complaint || "General consultation"}</span>
          </p>
        </div>
      </div>

      {/* 3-Column Layout Below Header */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] gap-6 flex-1">
        {/* Left Sidebar — Documents */}

        <div className="flex flex-col gap-6 animate-in slide-in-from-left duration-500 min-w-0">
        <Card className="flex-1 overflow-hidden flex flex-col border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 lg:pb-3 border-b bg-muted/30 px-3 lg:px-4 py-2 lg:py-3">
            <CardTitle className="text-xs lg:text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Clinical Registry
              </span>
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0">
                {documents.length} Files
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2 lg:p-3 space-y-2 lg:space-y-3">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-40">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium max-w-[140px]">Awaiting patient data synchronization...</p>
              </div>
            ) : (
              documents.map((doc, i) => (
                <div
                  key={doc.id || i}
                  className="group p-3 rounded-xl border border-border bg-background/50 hover:border-primary/30 hover:shadow-md transition-all duration-300 cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-3 h-3 text-primary" />
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/5 text-primary group-hover:bg-primary/10 transition-colors">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-bold text-xs truncate group-hover:text-primary transition-colors">{doc.title || doc.file_name}</p>
                        {doc.storage_url && (
                          <a href={doc.storage_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex-shrink-0">View</a>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-tighter font-semibold">
                        {doc.type || doc.document_type || "General Document"}
                      </p>
                    </div>
                  </div>
                  {doc.analysis_result && (
                    <div className="mt-2 p-2 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5 text-xs">
                      <p className="font-semibold text-primary text-[10px] uppercase tracking-wider">Lab Analysis</p>
                      {doc.analysis_result.summary && (
                        <p className="text-muted-foreground">{doc.analysis_result.summary}</p>
                      )}
                      {toArray(doc.analysis_result.key_findings).length > 0 && (
                        <div>
                          <p className="font-medium mb-0.5">Key Findings:</p>
                          {toArray(doc.analysis_result.key_findings).map((f, fi) => (
                            <div key={fi} className="flex items-start gap-1 ml-1">
                              <ChevronRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{typeof f === "string" ? f : f.finding || f.value || JSON.stringify(f)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {toArray(doc.analysis_result.recommendations).length > 0 && (
                        <div>
                          <p className="font-medium mb-0.5">Recommendations:</p>
                          {toArray(doc.analysis_result.recommendations).map((r, ri) => (
                            <div key={ri} className="flex items-start gap-1 ml-1">
                              <ChevronRight className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{typeof r === "string" ? r : r.recommendation || JSON.stringify(r)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {toArray(doc.analysis_result.risk_flags).length > 0 && (
                        <div>
                          <p className="font-medium mb-0.5">Risk Flags:</p>
                          {toArray(doc.analysis_result.risk_flags).map((flag, fi) => (
                            <div key={fi} className="flex items-center gap-1 ml-1">
                              <AlertTriangle className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                              <span className="text-muted-foreground">{typeof flag === "string" ? flag : flag.flag || JSON.stringify(flag)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {insights.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="h-px flex-1 bg-border" />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Registry Insights</p>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {insights.map((ins, i) => (
                  <div
                    key={ins.id || i}
                    className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20 shadow-inner space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <Brain className="w-3 h-3 text-primary" />
                      <p className="font-bold text-[11px] text-primary uppercase">AI Synthesis</p>
                    </div>
                    <p className="text-[11px] leading-relaxed font-medium text-foreground/80 italic">
                      "{ins.summary || ins.insight?.summary || "Analyzing synchronized record..."}"
                    </p>
                    {(ins.risk_flags || ins.insight?.risk_flags)?.map((flag, fi) => (
                      <div key={fi} className="flex items-start gap-2 p-1.5 rounded-lg bg-destructive/5 border border-destructive/10 animate-in fade-in duration-300">
                        <AlertTriangle className="w-3 h-3 text-destructive mt-0.5" />
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

      {/* Center — Transcript */}
      <div className="flex flex-col min-w-0 gap-6">
        {/* Recording Indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-2 bg-destructive/5 border border-destructive/20 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs lg:text-sm text-destructive font-medium">
              Recording — speak clearly into your microphone
            </span>
          </div>
        )}

        {/* Transcript Area */}
        <Card className="flex-1 overflow-hidden flex flex-col border shadow-card bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 lg:pb-3 border-b bg-muted/30 px-3 lg:px-4 py-2 lg:py-3">
            <div className="flex items-center justify-between gap-2 lg:gap-3">
              <CardTitle className="text-xs lg:text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="truncate">Live Transcript</span>
              </CardTitle>
              <div className="flex items-center gap-1 lg:gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={handleRequestInsight}
                  disabled={requestingInsight}
                  title="Ask the assistant for a quick clinical insight"
                >
                  {requestingInsight ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                </Button>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0 flex-shrink-0">
                  {transcript.length}
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 overflow-y-auto p-2 lg:p-4 space-y-2 lg:space-y-3">
            {isRecording && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <p className="text-sm font-semibold">Recording</p>
                  <p className="text-sm text-muted-foreground">Audio will be transcribed after you finish.</p>
                </div>
                <div className="mt-3 flex items-end gap-1 h-8">
                  {WAVE_HEIGHTS.map((h, idx) => (
                    <div
                      key={idx}
                      className="w-1.5 bg-primary/40 rounded-full animate-waveform"
                      style={{
                        height: `${h}%`,
                        animationDelay: `${idx * 0.1}s`,
                        opacity: 0.25 + (idx / WAVE_HEIGHTS.length) * 0.7,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {transcript.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-12 space-y-3 text-muted-foreground">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                  <Mic className="w-6 h-6 opacity-50" />
                </div>
                <p className="font-semibold">No transcript yet</p>
                <p className="text-sm max-w-sm">
                  During the session you’ll see transcript chunks here (if streaming is enabled). After finishing, transcription is stored automatically.
                </p>
              </div>
            ) : (
              transcript.map((c, idx) => (
                <div key={c.id || `${c.chunk_index}-${idx}`} className="p-3 rounded-xl border bg-background/50">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5">
                      {c.speaker_role || "unknown"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      #{c.chunk_index ?? idx}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.text || c.raw_text || ""}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right Sidebar — AI Assistant */}
      <div className="flex flex-col animate-in slide-in-from-right duration-500 min-w-0">
        <Card className="flex-1 overflow-hidden flex flex-col border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-2 lg:pb-3 border-b bg-muted/30 px-3 lg:px-4 py-2 lg:py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xs lg:text-sm flex items-center gap-2">
                <div className="relative flex-shrink-0">
                  <Brain className="w-4 h-4 text-primary" />
                  <div className="absolute inset-0 bg-primary animate-ping opacity-20" />
                </div>
                <span className="truncate">Assistant Core</span>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2 lg:p-3 space-y-3 lg:space-y-4">
            {!aiInsight ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-40">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Brain className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium max-w-[140px]">Initiating AI assistant synchronization...</p>
              </div>
            ) : (
              <div className="space-y-5 animate-in fade-in duration-500">
                {typeof aiInsight === "string" && (
                  <div className="p-3 rounded-xl border bg-background/50 space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Insight</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiInsight}</p>
                  </div>
                )}
                {aiInsight.key_observations?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Key Observations</p>
                    <div className="space-y-1.5">
                      {aiInsight.key_observations.map((obs, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-background border border-border hover:border-primary/20 transition-colors">
                          <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                          <span className="text-[11px] leading-tight font-medium">{obs}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiInsight.suggested_questions?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Diagnostic Prompts</p>
                    <div className="space-y-1.5">
                      {aiInsight.suggested_questions.map((q, i) => (
                        <div key={i} className="group p-2.5 rounded-xl bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-all cursor-pointer relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-1 opacity-20">
                            <ChevronRight className="w-3 h-3" />
                          </div>
                          <p className="text-[11px] leading-tight font-bold text-primary italic">"{q}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiInsight.potential_concerns?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Critical Red-Flags</p>
                    <div className="space-y-1.5">
                      {aiInsight.potential_concerns.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-destructive/5 border border-destructive/10">
                          <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
                          <span className="text-[11px] leading-tight font-bold text-destructive flex-1">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {aiInsight.differential_diagnoses?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-1">Differential Matrix</p>
                    <div className="flex flex-wrap gap-1 px-1">
                      {aiInsight.differential_diagnoses.map((d, i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="bg-muted border border-border text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors cursor-default"
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
