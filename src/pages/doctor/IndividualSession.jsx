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
  UserCheck,
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
  const [isPatientJoined] = useState(false);

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

  // Start mic audio recording only
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

  // Pause mic audio recording
  const handleStopRecording = useCallback(() => {
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
    <div className="flex gap-4 h-[calc(100vh-10rem)]">

      {/* Left — Clinical Registry */}
      <div className="w-72 flex-shrink-0 flex flex-col animate-in slide-in-from-left duration-500">
        <Card className="flex-1 overflow-hidden flex flex-col border-border/60 shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/20 px-4 pt-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Clinical Registry
              </span>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                {documents.length} {documents.length === 1 ? "file" : "files"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 space-y-2">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-40">
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <p className="text-xs font-medium max-w-[130px] leading-relaxed">No files shared yet</p>
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
                              <ChevronRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{typeof f === "string" ? f : f.finding || f.value || JSON.stringify(f)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {Array.isArray(doc.analysis_result.recommendations) && doc.analysis_result.recommendations.length > 0 && (
                        <div>
                          <p className="font-semibold mb-0.5">Recommendations:</p>
                          {doc.analysis_result.recommendations.map((r, ri) => (
                            <div key={ri} className="flex items-start gap-1 ml-1">
                              <ChevronRight className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{typeof r === "string" ? r : r.recommendation || JSON.stringify(r)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {Array.isArray(doc.analysis_result.risk_flags) && doc.analysis_result.risk_flags.length > 0 && (
                        <div>
                          <p className="font-semibold mb-0.5">Risk Flags:</p>
                          {doc.analysis_result.risk_flags.map((flag, fi) => (
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
              <div className="space-y-2 pt-2">
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

      {/* Right — Session Main Area */}
      <div className="flex-1 flex flex-col min-w-0 gap-3">

        {/* Session Header */}
        <div className="flex items-center justify-between bg-card px-5 py-3.5 rounded-2xl border border-border shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-heading leading-none">
                  {sessionData.patient_name}
                </h2>
                <Badge variant={sessionData.status === "active" ? "success" : "info"} className={sessionData.status === "active" ? "animate-pulse" : ""}>
                  {sessionData.status === "active" ? "Active" : "Joined"}
                </Badge>
                {isPatientJoined && (
                  <Badge variant="outline" className="text-primary border-primary/30 flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    Patient Online
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Stethoscope className="w-3 h-3" />
                {sessionData.chief_complaint || "General consultation"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right pr-4 border-r border-border hidden sm:block">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Duration</p>
              <p className="text-2xl font-mono font-bold text-primary tabular-nums">{formatDuration(duration)}</p>
            </div>
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <Button onClick={handleStartRecording} className="gap-2 rounded-full shadow-sm shadow-primary/20 bg-primary hover:opacity-90 transition-opacity">
                  <Mic className="w-4 h-4" />
                  Start Recording
                </Button>
              ) : (
                <Button
                  onClick={handleStopRecording}
                  variant="outline"
                  className="gap-2 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/5 transition-all"
                >
                  <MicOff className="w-4 h-4" />
                  Pause
                </Button>
              )}
              <Button
                onClick={handleEndSession}
                variant="destructive"
                disabled={isEnding}
                className="gap-2 rounded-xl"
              >
                {isEnding ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                {isEnding ? "Processing..." : "Finish"}
              </Button>
            </div>
          </div>
        </div>

        {/* Recording banner */}
        {isRecording && (
          <div className="flex items-center gap-2 px-4 py-2 bg-destructive/5 border border-destructive/15 rounded-xl flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />
            <span className="text-sm text-destructive font-medium">Recording — speak clearly into your microphone</span>
          </div>
        )}

        {/* Main Content Area */}
        {isRecording ? (
          <div className="flex-1 rounded-2xl border border-border/60 flex flex-col items-center justify-center overflow-hidden relative bg-card">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/3 via-transparent to-primary/3 pointer-events-none" />
            <div className="relative flex flex-col items-center gap-6 z-10">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
                <div className="absolute inset-[-20px] rounded-full border border-primary/20 animate-[spin_4s_linear_infinite]" />
                <div className="absolute inset-[-40px] rounded-full border border-primary/10 animate-[spin_8s_linear_infinite_reverse]" />
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-inner border border-primary/20">
                  <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse" />
                  <Mic className="w-10 h-10 relative z-10" />
                </div>
              </div>
              <div className="flex items-end gap-1 h-7">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(i => (
                  <div
                    key={i}
                    className="w-1.5 bg-primary/40 rounded-full animate-waveform"
                    style={{ height: `${20 + Math.random() * 80}%`, animationDelay: `${i * 0.1}s`, opacity: 0.3 + (i / 15) * 0.7 }}
                  />
                ))}
              </div>
              <div className="text-center space-y-1">
                <p className="text-xl font-bold font-heading text-foreground">Listening...</p>
                <p className="text-sm text-muted-foreground">Capturing clinical audio for EMR documentation</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
            {/* Status Overview Cards */}
            <div className="grid grid-cols-3 gap-3 flex-shrink-0">
              <Card className="border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Patient</p>
                    <p className={`text-sm font-bold ${isPatientJoined ? 'text-primary' : 'text-muted-foreground'}`}>
                      {isPatientJoined ? "Connected" : "Waiting..."}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Documents</p>
                    <p className="text-sm font-bold">{documents.length} {documents.length === 1 ? 'file' : 'files'}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Insights</p>
                    <p className="text-sm font-bold">{insights.length} {insights.length === 1 ? 'insight' : 'insights'}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* CTA Card */}
            <Card className="border-primary/15 bg-gradient-to-br from-card to-primary/5 flex-shrink-0">
              <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <Mic className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-bold font-heading tracking-tight">
                    {isPatientJoined ? "Ready to Begin Consultation" : "Waiting for Patient to Join"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    {isPatientJoined
                      ? "Patient is connected. Start recording to capture the consultation. Audio will be processed into EMR documentation when the session ends."
                      : "The session is active. Click \"Start Recording\" above when you're ready to begin the consultation, or wait for the patient to connect."}
                  </p>
                </div>
                {!isPatientJoined && (
                  <div className="flex items-center gap-2 text-muted-foreground/60 mt-1">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-medium">Listening for patient connection...</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Session Details */}
            {sessionData.chief_complaint && (
              <Card className="border-border flex-shrink-0">
                <CardContent className="p-4 space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Chief Complaint</p>
                  <p className="text-sm text-foreground leading-relaxed">{sessionData.chief_complaint}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* AI Insights — only visible when data arrives */}
        {aiInsight && (
          <div className="flex-shrink-0 grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {aiInsight.key_observations?.length > 0 && (
              <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Key Observations</p>
                <div className="space-y-1.5">
                  {aiInsight.key_observations.map((obs, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <span className="text-xs leading-tight text-foreground/80">{obs}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiInsight.suggested_questions?.length > 0 && (
              <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Diagnostic Prompts</p>
                <div className="space-y-1.5">
                  {aiInsight.suggested_questions.map((q, i) => (
                    <div key={i} className="p-2 rounded-lg bg-primary/5 border border-primary/10 hover:bg-primary/10 transition-colors cursor-pointer">
                      <p className="text-xs font-semibold text-primary italic">"{q}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiInsight.potential_concerns?.length > 0 && (
              <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Red Flags</p>
                <div className="space-y-1.5">
                  {aiInsight.potential_concerns.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                      <AlertTriangle className="w-3 h-3 text-destructive mt-0.5 flex-shrink-0" />
                      <span className="text-xs font-semibold text-destructive">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aiInsight.differential_diagnoses?.length > 0 && (
              <div className="p-3 rounded-xl bg-card border border-border space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Differential</p>
                <div className="flex flex-wrap gap-1">
                  {aiInsight.differential_diagnoses.map((d, i) => (
                    <Badge key={i} variant="secondary" className="text-[9px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-lg hover:bg-primary hover:text-primary-foreground transition-colors cursor-default">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
