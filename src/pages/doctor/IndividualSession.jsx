import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { getSession, endSession, transcribeAudio } from "@/services/sessionService";
import { getSessionDocuments } from "@/services/documentService";
import { getInsights } from "@/services/emrService";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

export default function IndividualSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const { subscribe, send } = useWebSocket();
  const token = authSession?.access_token;

  const [sessionData, setSessionData] = useState(null);
  const [transcriptChunks, setTranscriptChunks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [insights, setInsights] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(0);

  const recognitionRef = useRef(null);
  const isRecordingRef = useRef(false);
  const chunkIndexRef = useRef(0);
  const sessionStartTimeRef = useRef(Date.now());
  const transcriptEndRef = useRef(null);

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
        sessionStartTimeRef.current = sess.started_at
          ? new Date(sess.started_at).getTime()
          : Date.now();
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
    const unsub1 = subscribe("TRANSCRIPT_CHUNK", (data) => {
      if (data.session_id === sessionId) {
        setTranscriptChunks((prev) => {
          const exists = prev.find((c) => c.chunk_index === data.chunk_index);
          if (exists) return prev;
          return [...prev, data];
        });
      }
    });

    const unsub2 = subscribe("FILE_SHARED", (data) => {
      if (data.session_id === sessionId) {
        setDocuments((prev) => [
          ...prev,
          ...(data.documents || []).filter(
            (d) => !prev.some((p) => p.id === d.id)
          ),
        ]);
      }
    });

    const unsub3 = subscribe("AI_INSIGHT_READY", (data) => {
      if (data.session_id === sessionId) {
        if (data.insight) {
          setAiInsight(data.insight);
        }
        if (data.document_id) {
          setInsights((prev) => [...prev, data]);
        }
      }
    });

    const unsub4 = subscribe("EMR_DRAFT_READY", (data) => {
      if (data.session_id === sessionId) {
        navigate(`/doctor/review/${sessionId}`);
      }
    });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [subscribe, sessionId, navigate]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptChunks]);

  // Speech Recognition
  const startRecording = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition not supported in this browser. Use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        const isFinal = result.isFinal;
        const now = Date.now();

        if (isFinal && text.trim()) {
          const chunkIndex = chunkIndexRef.current++;
          send("TRANSCRIPT_CHUNK", {
            session_id: sessionId,
            chunk_index: chunkIndex,
            text: text.trim(),
            speaker_role: "doctor",
            start_time_ms: now - sessionStartTimeRef.current - 2000,
            end_time_ms: now - sessionStartTimeRef.current,
            confidence: result[0].confidence,
            is_final: true,
          });
        }
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        alert("Microphone access denied. Please allow microphone access.");
        isRecordingRef.current = false;
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart only if we're still supposed to be recording
      if (isRecordingRef.current && recognitionRef.current) {
        try {
          recognition.start();
        } catch (err) {
          // Silently ignore restart errors
          console.debug("Speech recognition restart error:", err);
        }
      }
    };

    isRecordingRef.current = true;
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);

    // Start audio recorder
    startAudioRecording().catch(err => {
      console.error("Failed to start audio recording:", err);
    });
  }, [send, sessionId, startAudioRecording]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);

    // Pause audio recorder
    pauseAudioRecording();
  }, [pauseAudioRecording]);


  async function handleEndSession() {
    setIsEnding(true);
    stopRecording();

    try {
      // Stop and upload audio recording to local 's3' folder via backend
      const audioResult = await stopAudioRecording();
      if (audioResult?.blob) {
        try {
          await transcribeAudio(token, sessionId, audioResult.blob);
          console.log("Recording saved to s3 folder successfully");
        } catch (uploadErr) {
          console.error("Failed to upload recording to s3:", uploadErr);
        }
      }

      await endSession(token, { sessionId, sessionNotes: "" });
      // Will navigate to review page when EMR_DRAFT_READY arrives
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
      {/* Left Sidebar — Documents */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4 animate-in slide-in-from-left duration-500">
        <Card className="flex-1 overflow-hidden flex flex-col border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Clinical Registry
              </span>
              <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0">
                {documents.length} Files
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 space-y-3">
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
                      {doc.analysis_result.key_findings?.length > 0 && (
                        <div>
                          <p className="font-medium mb-0.5">Key Findings:</p>
                          {doc.analysis_result.key_findings.map((f, fi) => (
                            <div key={fi} className="flex items-start gap-1 ml-1">
                              <ChevronRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{typeof f === "string" ? f : f.finding || f.value || JSON.stringify(f)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {doc.analysis_result.recommendations?.length > 0 && (
                        <div>
                          <p className="font-medium mb-0.5">Recommendations:</p>
                          {doc.analysis_result.recommendations.map((r, ri) => (
                            <div key={ri} className="flex items-start gap-1 ml-1">
                              <ChevronRight className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">{typeof r === "string" ? r : r.recommendation || JSON.stringify(r)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {doc.analysis_result.risk_flags?.length > 0 && (
                        <div>
                          <p className="font-medium mb-0.5">Risk Flags:</p>
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Session Header */}
        <div className="flex items-center justify-between mb-6 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">
                  {sessionData.patient_name}
                </h2>
                <Badge variant="success" className="animate-pulse">Active</Badge>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Stethoscope className="w-3 h-3" />
                {sessionData.chief_complaint || "General consultation"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right mr-4 hidden sm:block">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Duration</p>
              <p className="text-2xl font-mono font-bold text-primary">{formatDuration(duration)}</p>
            </div>

            <div className="flex items-center gap-2">
              {!isRecording ? (
                <Button onClick={startRecording} className="gap-2 rounded-full shadow-lg shadow-primary/20 bg-primary hover:scale-105 transition-transform">
                  <Mic className="w-4 h-4" />
                  Start Recording
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  variant="outline"
                  className="gap-2 rounded-full border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-all"
                >
                  <MicOff className="w-4 h-4" />
                  Pause
                </Button>
              )}
              <Button
                onClick={handleEndSession}
                variant="destructive"
                disabled={isEnding}
                className="gap-2 rounded-full shadow-lg shadow-destructive/20 hover:scale-105 transition-transform"
              >
                {isEnding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <StopCircle className="w-4 h-4" />
                )}
                {isEnding ? "Processing..." : "Finish"}
              </Button>
            </div>
          </div>
        </div>

        {/* Recording Indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">
              Recording — speak clearly into your microphone
            </span>
          </div>
        )}

        {/* Transcript Area */}
        <Card className="flex-1 overflow-hidden flex flex-col relative group border-none shadow-none bg-transparent">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5 pointer-events-none opacity-50" />

          <CardHeader className="pb-2 bg-background/50 backdrop-blur-sm border-b relative z-10">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Intelligence Core
            </CardTitle>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col items-center justify-center space-y-8 relative z-10">
            {isRecording ? (
              <>
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
                  <div className="absolute inset-[-20px] rounded-full border border-primary/20 animate-[spin_4s_linear_infinite]" />
                  <div className="absolute inset-[-40px] rounded-full border border-primary/10 animate-[spin_8s_linear_infinite_reverse]" />

                  <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-inner border border-primary/20">
                    <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse" />
                    <Mic className="w-12 h-12 relative z-10" />
                  </div>
                </div>

                {/* Animated Waveform Blocks */}
                <div className="flex items-end gap-1 h-8">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(i => (
                    <div
                      key={i}
                      className="w-1.5 bg-primary/40 rounded-full animate-waveform"
                      style={{
                        height: `${20 + Math.random() * 80}%`,
                        animationDelay: `${i * 0.1}s`,
                        opacity: 0.3 + (i / 15) * 0.7
                      }}
                    />
                  ))}
                </div>

                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black tracking-tight text-foreground">Listening...</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto font-medium leading-relaxed">
                    SEVAमित्र is capturing and processing clinical audio in real-time. Full EMR draft will be available upon completion.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-24 h-24 rounded-3xl bg-muted/50 flex items-center justify-center text-muted-foreground border border-border group-hover:border-primary/20 transition-colors duration-500">
                  <Mic className="w-10 h-10 opacity-20" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-muted-foreground">Ready for Consultation</h3>
                  <p className="text-sm text-muted-foreground/60 max-w-[240px]">
                    Click the "Start Recording" button to begin the clinical session.
                  </p>
                </div>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </CardContent>
        </Card>
      </div>

      {/* Right Sidebar — AI Assistant */}
      <div className="w-80 flex-shrink-0 flex flex-col animate-in slide-in-from-right duration-500">
        <Card className="flex-1 overflow-hidden flex flex-col border-primary/10 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="relative">
                  <Brain className="w-4 h-4 text-primary" />
                  <div className="absolute inset-0 bg-primary animate-ping opacity-20" />
                </div>
                Assistant Core
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 space-y-4">
            {!aiInsight ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-40">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Brain className="w-5 h-5" />
                </div>
                <p className="text-xs font-medium max-w-[140px]">Initiating AI assistant synchronization...</p>
              </div>
            ) : (
              <div className="space-y-5 animate-in fade-in duration-500">
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
                          <span className="text-[11px] leading-tight font-extrabold text-destructive flex-1">{c}</span>
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
                          className="bg-muted border border-border text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-md hover:bg-primary hover:text-white transition-colors cursor-default"
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
  );
}
