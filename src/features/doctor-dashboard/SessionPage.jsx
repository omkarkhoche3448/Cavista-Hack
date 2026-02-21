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
} from "lucide-react";
import { getSession, endSession, getTranscript } from "@/services/sessionService";
import { getSessionDocuments } from "@/services/documentService";
import { getInsights } from "@/services/emrService";

export default function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession, profile } = useAuth();
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

  const recognitionRef = useRef(null);
  const chunkIndexRef = useRef(0);
  const sessionStartTimeRef = useRef(Date.now());
  const transcriptEndRef = useRef(null);

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
        setIsRecording(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording
      if (isRecording && recognitionRef.current) {
        try {
          recognition.start();
        } catch {}
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }, [send, sessionId, isRecording]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const requestAiInsight = useCallback(() => {
    send("REQUEST_AI_INSIGHT", { session_id: sessionId });
  }, [send, sessionId]);

  async function handleEndSession() {
    if (!confirm("Are you sure you want to end this session? This will trigger AI analysis.")) return;
    setIsEnding(true);
    stopRecording();

    try {
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
      <div className="w-72 flex-shrink-0 flex flex-col">
        <Card className="flex-1 overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Patient Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-2">
            {documents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                Waiting for patient to share documents...
              </p>
            ) : (
              documents.map((doc, i) => (
                <div
                  key={doc.id || i}
                  className="p-2 rounded-lg border border-border hover:bg-muted/50 cursor-pointer text-xs"
                >
                  <p className="font-medium truncate">{doc.title || doc.file_name}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {doc.type || doc.document_type}
                  </p>
                </div>
              ))
            )}

            {insights.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  AI Insights
                </p>
                {insights.map((ins, i) => (
                  <div
                    key={ins.id || i}
                    className="p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs"
                  >
                    <p className="font-medium">{ins.summary || ins.insight?.summary || "Analyzing..."}</p>
                    {(ins.risk_flags || ins.insight?.risk_flags)?.map((flag, fi) => (
                      <div key={fi} className="flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3 text-yellow-500" />
                        <span className="text-muted-foreground">{flag.flag}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Center — Transcript */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Session Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Session with {sessionData.patient_name}
              <Badge variant="success">Active</Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              {sessionData.chief_complaint || "General consultation"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isRecording ? (
              <Button onClick={startRecording} className="gap-2">
                <Mic className="w-4 h-4" />
                Start Recording
              </Button>
            ) : (
              <Button
                onClick={stopRecording}
                variant="outline"
                className="gap-2 border-red-300 text-red-600 hover:bg-red-50"
              >
                <MicOff className="w-4 h-4" />
                Pause Recording
              </Button>
            )}
            <Button
              onClick={handleEndSession}
              variant="destructive"
              disabled={isEnding}
              className="gap-2"
            >
              {isEnding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <StopCircle className="w-4 h-4" />
              )}
              {isEnding ? "Processing..." : "End Session"}
            </Button>
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
        <Card className="flex-1 overflow-hidden flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Live Transcript</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3">
            {transcriptChunks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <Mic className="w-12 h-12 mb-4 opacity-30" />
                <p className="text-sm">Start recording to see the live transcript</p>
              </div>
            ) : (
              transcriptChunks.map((chunk, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${
                    chunk.speaker_role === "doctor" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      chunk.speaker_role === "doctor"
                        ? "bg-primary/10 text-foreground"
                        : "bg-muted text-foreground"
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
            <div ref={transcriptEndRef} />
          </CardContent>
        </Card>
      </div>

      {/* Right Sidebar — AI Summary */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <Card className="flex-1 overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4" />
                AI Assistant
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={requestAiInsight}
                className="h-7 text-xs"
                disabled={transcriptChunks.length === 0}
              >
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3">
            {!aiInsight ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                AI insights will appear here during the session. Click &quot;Refresh&quot; to get real-time analysis.
              </p>
            ) : (
              <div className="space-y-4 text-xs">
                {aiInsight.key_observations?.length > 0 && (
                  <div>
                    <p className="font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Key Observations
                    </p>
                    {aiInsight.key_observations.map((obs, i) => (
                      <div key={i} className="flex items-start gap-1.5 mb-1.5">
                        <ChevronRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                        <span>{obs}</span>
                      </div>
                    ))}
                  </div>
                )}

                {aiInsight.suggested_questions?.length > 0 && (
                  <div>
                    <p className="font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Suggested Questions
                    </p>
                    {aiInsight.suggested_questions.map((q, i) => (
                      <div key={i} className="p-2 rounded bg-muted/50 mb-1.5">
                        {q}
                      </div>
                    ))}
                  </div>
                )}

                {aiInsight.potential_concerns?.length > 0 && (
                  <div>
                    <p className="font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Potential Concerns
                    </p>
                    {aiInsight.potential_concerns.map((c, i) => (
                      <div key={i} className="flex items-start gap-1.5 mb-1.5">
                        <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}

                {aiInsight.differential_diagnoses?.length > 0 && (
                  <div>
                    <p className="font-medium uppercase tracking-wide text-muted-foreground mb-2">
                      Differential Diagnoses
                    </p>
                    {aiInsight.differential_diagnoses.map((d, i) => (
                      <Badge key={i} variant="outline" className="mr-1 mb-1">
                        {d}
                      </Badge>
                    ))}
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
