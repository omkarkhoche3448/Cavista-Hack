import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Users,
  FileText,
  CalendarDays,
  Mic,
  Clock,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  User,
  Activity,
  FileBarChart,
  Loader2,
  Wifi,
  WifiOff,
  LayoutDashboard,
  AlertTriangle,
  Mail,
  X,
  StopCircle
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { listSessions, startSession, createSession } from "@/services/sessionService";

// Form validation constants
const INITIAL_FORM_STATE = { email: "", chiefComplaint: "", isEmergency: false };
const COMPLAINT_MAX_LENGTH = 500;

// Validate email format
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const STATUS_BADGE = {
  pending: { variant: "warning", label: "Pending" },
  accepted: { variant: "info", label: "Accepted" },
  active: { variant: "success", label: "Active" },
  processing: { variant: "info", label: "Processing" },
  completed: { variant: "secondary", label: "Completed" },
  rejected: { variant: "destructive", label: "Rejected" },
};

const SessionCard = ({ session, onStart, isStarting }) => {
  const isAccepted = session.status === "accepted";
  const isActive = session.status === "active";

  return (
    <Card className="group transition-all duration-300 hover:shadow-card-lg hover:border-primary/50 hover:-translate-y-0.5 overflow-hidden shadow-card">
      <CardContent className="p-5">
        {/* Header with status */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold font-heading text-foreground truncate">{session.patient_name}</p>
              <p className="text-sm text-muted-foreground truncate">{session.patient_email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {session.is_emergency && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
              </Badge>
            )}
            <Badge className={`whitespace-nowrap ${session.status === 'active' ? 'bg-primary/10 text-primary' :
              session.status === 'accepted' ? 'bg-accent/10 text-accent-foreground' :
                session.status === 'pending' ? 'bg-secondary text-secondary-foreground' :
                  session.status === 'completed' ? 'bg-muted text-muted-foreground' :
                    'bg-muted text-muted-foreground'
              }`}>
              {STATUS_BADGE[session.status]?.label ?? session.status}
            </Badge>
          </div>
        </div>

        {/* Chief Complaint */}
        {session.chief_complaint && (
          <div className="mb-4 p-3 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground line-clamp-2">{session.chief_complaint}</p>
          </div>
        )}

        {/* Footer with time and action */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(session.created_at).toLocaleDateString()} {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          {(isAccepted || isActive) && (
            <Button
              size="sm"
              variant="hero"
              className="gap-2 rounded-lg"
              onClick={() => onStart(session.id, isActive)}
              disabled={isStarting === session.id}
            >
              {isStarting === session.id ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {isActive ? "Resuming..." : "Starting..."}
                </>
              ) : (
                <>
                  <ArrowRight className="w-3 h-3" />
                  {isActive ? "Resume" : "Start"}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default function DoctorDashboard() {
  const { profile, session: authSession, loading: authLoading } = useAuth();
  const { subscribe, isConnected } = useWebSocket();
  const navigate = useNavigate();
  const token = authSession?.access_token;

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isStarting, setIsStarting] = useState(null);

  // Inline session form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [showMicAnimation, setShowMicAnimation] = useState(false);
  // Track session ID for approval animation
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [requestSent, setRequestSent] = useState(false);

  // Close form and reset state - define early so it can be used in useEffect
  const closeForm = useCallback(() => {
    setShowForm(false);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setError(null);
  }, []);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSessionId, setRecordingSessionId] = useState(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);

  // Start microphone recording and stream to WebSocket
  const startRecording = useCallback(async (sessionId) => {
    try {
      const constraints = { audio: { echoCancellation: true, noiseSuppression: true } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // Convert blob to base64 and send via WebSocket
          const reader = new FileReader();
          reader.onload = () => {
            const base64Audio = reader.result.split(',')[1];
            // Send audio chunk via WebSocket
            const message = {
              event: 'AUDIO_CHUNK',
              data: {
                session_id: sessionId,
                audio_chunk: base64Audio,
                timestamp: Date.now()
              }
            };
            // console.log('[Recording] Audio chunk sent', message.data.session_id);
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorder.start(1000); // Send audio chunks every 1 second
      setIsRecording(true);
      setRecordingSessionId(sessionId);
      console.log('[Recording] Started for session:', sessionId);
    } catch (err) {
      console.error('[Recording] Failed to start:', err);
    }
  }, []);

  // Stop microphone recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
    }

    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
    setRecordingSessionId(null);
    console.log('[Recording] Stopped');
  }, []);

  const fetchSessions = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      console.log("[DoctorDashboard] Fetching sessions with token...");
      const data = await listSessions(token, { pageSize: 50 });
      console.log("[DoctorDashboard] API Result:", data);
      const sessionsArray = Array.isArray(data) ? data : (data?.sessions || []);
      setSessions(sessionsArray);
    } catch (err) {
      console.error("[DoctorDashboard] Failed to fetch sessions:", err);
      setError(err.message || "Failed to load sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Wait for auth to finish before fetching sessions
  useEffect(() => {
    if (!authLoading) {
      fetchSessions();
    }
  }, [authLoading, fetchSessions]);

  // Real-time updates via WebSocket
  useEffect(() => {
    const unsub1 = subscribe("SESSION_ACCEPTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "accepted" } : s)
      );
      // If the pending session was approved, hide animation and reset form
      if (pendingSessionId && data.session_id === pendingSessionId) {
        setShowMicAnimation(false);
        closeForm();
        setPendingSessionId(null);
        setRequestSent(false);
      }
    });
    const unsub2 = subscribe("SESSION_REJECTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "rejected" } : s)
      );
      // If the pending session was rejected, hide animation and reset form
      if (pendingSessionId && data.session_id === pendingSessionId) {
        setShowMicAnimation(false);
        closeForm();
        setPendingSessionId(null);
        setRequestSent(false);
      }
    });
    const unsub3 = subscribe("SESSION_STARTED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "active" } : s)
      );
    });
    const unsub4 = subscribe("SESSION_ENDED", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: data.status || "processing" } : s)
      );
      // Stop recording when session ends
      if (isRecording && recordingSessionId === data.session_id) {
        stopRecording();
      }
    });
    const unsub5 = subscribe("EMR_DRAFT_READY", (data) => {
      setSessions((prev) =>
        prev.map((s) => s.id === data.session_id ? { ...s, status: "processing" } : s)
      );
    });
    const unsub6 = subscribe("TRANSCRIPTION_COMPLETE", (data) => {
      toast.success("Consultation recording transcribed!");
      // We could update specific session recording_url if needed
    });
    return () => {
      unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6();
      stopRecording();
    };
  }, [subscribe, pendingSessionId, closeForm, startRecording, isRecording, recordingSessionId, stopRecording]);

  // Validate form fields
  const validateForm = useCallback(() => {
    const errors = {};

    if (!formData.email.trim()) {
      errors.email = "Email is required";
    } else if (!validateEmail(formData.email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    if (formData.chiefComplaint.length > COMPLAINT_MAX_LENGTH) {
      errors.chiefComplaint = `Chief complaint exceeds ${COMPLAINT_MAX_LENGTH} characters`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Called when doctor creates a new session via the inline form
  const handleCreateSession = useCallback(async () => {
    if (!validateForm()) return;

    setIsCreating(true);
    setError(null);

    try {
      const newSession = await createSession(token, {
        patientEmail: formData.email.trim(),
        chiefComplaint: formData.chiefComplaint.trim() || null,
        isEmergency: formData.isEmergency,
      });
      setSessions((prev) => [newSession, ...prev]);
      setShowMicAnimation(true);
      setPendingSessionId(newSession.id);
      setIsCreating(false);
      setRequestSent(true);
      // Keep waiting UI active until WebSocket notifies approval/rejection
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to send request");
      setShowMicAnimation(false);
      setIsCreating(false);
      setRequestSent(false);
    }
  }, [formData, token, validateForm]);

  // Start (or resume) a session — calls /start then navigates to SessionPage
  const handleStartSession = useCallback(async (sessionId, isAlreadyActive) => {
    setIsStarting(sessionId);
    try {
      if (!isAlreadyActive) {
        await startSession(token, sessionId);
        setSessions((prev) =>
          prev.map((s) => s.id === sessionId ? { ...s, status: "active" } : s)
        );
      }
      navigate(`/doctor/session/${sessionId}`);
    } catch (err) {
      console.error("Failed to start session:", err);
    } finally {
      setIsStarting(null);
    }
  }, [token, navigate]);

  // Handle form field changes - clears field errors on change
  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  }, [formErrors]);

  // Memoize session filtering for performance
  const sessionStats = useMemo(() => ({
    activeSessions: sessions.filter((s) => ["accepted", "active"].includes(s.status)),
    pendingSessions: sessions.filter((s) => s.status === "pending"),
    completedSessions: sessions.filter((s) => ["completed", "processing"].includes(s.status))
  }), [sessions]);

  const { activeSessions, pendingSessions, completedSessions } = sessionStats;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="relative overflow-hidden p-8 rounded-2xl bg-card border shadow-card-lg">

        <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold w-fit">
              <Activity className="w-4 h-4" />
              Clinical Dashboard
            </span>
            <h1 className="text-3xl md:text-4xl font-bold font-heading text-foreground">
              Welcome, Dr. <span className="text-gradient-primary">{profile?.first_name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground">Your clinical command center is ready</p>
              {isConnected ? (
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1 px-3 py-1">
                  <Wifi className="w-3 h-3" /> Live
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground gap-1 px-3 py-1">
                  <WifiOff className="w-3 h-3" /> Offline
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="hero" className="rounded-xl px-5 gap-2">
              <Activity className="w-4 h-4" />
              Dashboard
            </Button>
            <Button
              variant="outline"
              className="rounded-xl px-5 gap-2 font-semibold"
              onClick={() => navigate("/doctor/sessions")}
            >
              <CalendarDays className="w-4 h-4" />
              Sessions
            </Button>
            <Button variant="outline" className="rounded-xl px-5 gap-2 font-semibold" onClick={() => navigate("/doctor/patients")}>
              <Users className="w-4 h-4" />
              Patients
            </Button>
          </div>
        </div>
      </div>

      {/* Start New Session CTA with Inline Form */}
      <div className="animate-in fade-in duration-500 delay-100">
        <div className="space-y-2 mb-6">
          <h2 className="text-2xl font-bold font-heading text-foreground">Initiate Patient Session</h2>
          <p className="text-muted-foreground">Send a consultation request and begin real-time patient interaction</p>
        </div>

        <div className="relative overflow-hidden">
          <Card className="relative overflow-hidden bg-card border shadow-card-lg hover:shadow-glow transition-all duration-300 group rounded-2xl">
            <CardContent className="relative p-10">
              <div className="flex items-center gap-8 min-h-[550px]">
                {/* Left side - Main CTA or Mic Animation */}
                <div className="w-1/2 transition-all duration-500 ease-in-out flex items-center justify-center">
                  {!showForm ? (
                    <div className={`flex flex-col items-center justify-center h-full text-center transition-all duration-500 w-full ${showMicAnimation ? 'opacity-0 scale-75' : 'opacity-100 scale-100'}`}>
                      <div className="relative mx-auto mb-8 w-32 h-32">
                        <div className="absolute inset-0 bg-primary/20 rounded-full opacity-30 animate-pulse" />
                        <div className="absolute inset-4 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full" />
                        <div className="absolute inset-8 bg-background rounded-full shadow-lg flex items-center justify-center">
                          <Mic className="w-14 h-14 text-primary" />
                        </div>
                      </div>

                      <div className="space-y-4 mb-12">
                        <h3 className="text-3xl font-bold font-heading text-foreground">Ready to Start?</h3>
                        <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                          Send a personalized consultation request to your patient. They'll receive it immediately and can approve to begin the session.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <Button
                          onClick={() => setShowForm(true)}
                          variant="hero"
                          size="lg"
                          className="gap-3 px-8 py-6 text-lg rounded-xl"
                        >
                          <Mic className="w-5 h-5" />
                          Create Session Request
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full text-center space-y-6">
                      <div className="p-4 rounded-full bg-primary/10">
                        <FileText className="w-8 h-8 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-lg font-bold text-foreground mb-2">Fill in Session Details</h4>
                        <p className="text-sm text-muted-foreground">Complete the form to send your request →</p>
                      </div>
                      <button
                        onClick={closeForm}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-muted transition-colors text-sm font-medium text-muted-foreground hover:text-primary"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        Back
                      </button>
                    </div>
                  )}
                </div>

                {/* Right side - Illustration or Form */}
                <div className="w-1/2 transition-all duration-500 ease-in-out">
                  {!showForm && !showMicAnimation && (
                    <div className="flex items-center justify-center h-full animate-in fade-in duration-500">
                      <svg viewBox="0 0 480 420" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-md opacity-90">
                        {/* Background circle glow */}
                        <circle cx="240" cy="210" r="180" fill="url(#ctaGlow)" opacity="0.12" />
                        <circle cx="240" cy="210" r="130" fill="url(#ctaGlow)" opacity="0.08" />

                        {/* Central monitor / screen */}
                        <rect x="145" y="95" width="190" height="135" rx="14" fill="hsl(200, 45%, 10%)" stroke="hsl(168, 70%, 34%)" strokeWidth="2" />
                        <rect x="155" y="105" width="170" height="110" rx="8" fill="hsl(200, 50%, 6%)" />
                        {/* Monitor stand */}
                        <rect x="220" y="230" width="40" height="20" rx="2" fill="hsl(200, 30%, 18%)" />
                        <rect x="200" y="248" width="80" height="6" rx="3" fill="hsl(200, 30%, 18%)" />

                        {/* PDF Summarization on screen */}

                        {/* Doc page icon — top left of screen */}
                        <rect x="165" y="113" width="16" height="20" rx="2" fill="hsl(200, 45%, 8%)" stroke="hsl(168, 65%, 45%)" strokeWidth="1.2" opacity="0.9" />
                        {/* Folded corner */}
                        <path d="M176 113 L181 118 L176 118 Z" fill="hsl(168, 65%, 45%)" opacity="0.45" />
                        {/* Lines inside doc icon */}
                        <rect x="168" y="121" width="10" height="1.5" rx="0.75" fill="hsl(168, 65%, 45%)" opacity="0.4" />
                        <rect x="168" y="124" width="7" height="1.5" rx="0.75" fill="hsl(168, 65%, 45%)" opacity="0.3" />
                        <rect x="168" y="127" width="9" height="1.5" rx="0.75" fill="hsl(168, 65%, 45%)" opacity="0.3" />

                        {/* Summary title bar next to icon */}
                        <rect x="186" y="116" width="55" height="5" rx="2.5" fill="hsl(168, 65%, 45%)" opacity="0.65">
                          <animate attributeName="opacity" values="0.4;0.75;0.4" dur="3s" repeatCount="indefinite" />
                        </rect>
                        <rect x="186" y="124" width="40" height="3.5" rx="1.75" fill="hsl(160, 20%, 80%)" opacity="0.3" />

                        {/* Divider */}
                        <rect x="165" y="137" width="148" height="1" rx="0.5" fill="hsl(168, 65%, 45%)" opacity="0.18" />

                        {/* Bullet item 1 */}
                        <rect x="168" y="143" width="5" height="5" rx="1" fill="hsl(168, 65%, 45%)" opacity="0.55" />
                        <rect x="177" y="144" width="92" height="3" rx="1.5" fill="hsl(160, 20%, 88%)" opacity="0.55" />

                        {/* Bullet item 2 */}
                        <rect x="168" y="153" width="5" height="5" rx="1" fill="hsl(168, 65%, 45%)" opacity="0.45" />
                        <rect x="177" y="154" width="68" height="3" rx="1.5" fill="hsl(160, 20%, 88%)" opacity="0.45" />

                        {/* Bullet item 3 */}
                        <rect x="168" y="163" width="5" height="5" rx="1" fill="hsl(168, 65%, 45%)" opacity="0.35" />
                        <rect x="177" y="164" width="80" height="3" rx="1.5" fill="hsl(160, 20%, 88%)" opacity="0.38" />

                        {/* Bottom fading text lines */}
                        <rect x="168" y="175" width="86" height="3" rx="1.5" fill="hsl(160, 20%, 85%)" opacity="0.28" />
                        <rect x="168" y="182" width="60" height="3" rx="1.5" fill="hsl(160, 20%, 85%)" opacity="0.2" />
                        <rect x="168" y="189" width="74" height="3" rx="1.5" fill="hsl(160, 20%, 85%)" opacity="0.15" />

                        {/* AI badge */}
                        <rect x="268" y="172" width="40" height="18" rx="9" fill="hsl(168, 70%, 34%)" opacity="0.85" />
                        <text x="288" y="185" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="sans-serif">AI</text>

                        {/* Doctor avatar - left */}
                        <circle cx="85" cy="195" r="32" fill="hsl(168, 70%, 34%)" opacity="0.15" />
                        <circle cx="85" cy="185" r="14" fill="hsl(168, 70%, 34%)" opacity="0.6" />
                        <path d="M60 220 Q60 200 85 200 Q110 200 110 220" fill="hsl(168, 70%, 34%)" opacity="0.5" />
                        {/* Stethoscope icon hint */}
                        <circle cx="95" cy="210" r="5" stroke="hsl(168, 65%, 45%)" strokeWidth="1.5" fill="none" opacity="0.7" />

                        {/* Patient avatar - right */}
                        <circle cx="395" cy="195" r="32" fill="hsl(200, 55%, 50%)" opacity="0.15" />
                        <circle cx="395" cy="185" r="14" fill="hsl(200, 55%, 50%)" opacity="0.5" />
                        <path d="M370 220 Q370 200 395 200 Q420 200 420 220" fill="hsl(200, 55%, 50%)" opacity="0.4" />

                        {/* Connection lines - doctor to screen */}
                        <path d="M117 195 L145 160" stroke="hsl(168, 65%, 45%)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4">
                          <animate attributeName="strokeDashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
                        </path>
                        {/* Connection lines - patient to screen */}
                        <path d="M363 195 L335 160" stroke="hsl(200, 55%, 50%)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4">
                          <animate attributeName="strokeDashoffset" values="0;-14" dur="2s" repeatCount="indefinite" />
                        </path>

                        {/* Voice/sound waves from doctor */}
                        <path d="M115 182 Q125 175 125 182 Q125 189 115 182" stroke="hsl(168, 65%, 45%)" strokeWidth="1.2" fill="none" opacity="0.5">
                          <animate attributeName="opacity" values="0.2;0.7;0.2" dur="1.5s" repeatCount="indefinite" />
                        </path>
                        <path d="M120 175 Q133 168 133 182 Q133 196 120 189" stroke="hsl(168, 65%, 45%)" strokeWidth="1" fill="none" opacity="0.3">
                          <animate attributeName="opacity" values="0.1;0.5;0.1" dur="1.5s" begin="0.3s" repeatCount="indefinite" />
                        </path>

                        {/* Microphone icon below screen */}
                        <rect x="232" y="275" width="16" height="22" rx="8" stroke="hsl(168, 70%, 34%)" strokeWidth="2" fill="hsl(168, 70%, 34%)" opacity="0.25" />
                        <path d="M225 290 Q225 305 240 305 Q255 305 255 290" stroke="hsl(168, 70%, 34%)" strokeWidth="2" fill="none" opacity="0.4" />
                        <line x1="240" y1="305" x2="240" y2="315" stroke="hsl(168, 70%, 34%)" strokeWidth="2" opacity="0.4" />

                        {/* Floating doc icons */}
                        <g opacity="0.35">
                          <rect x="60" y="280" width="28" height="34" rx="4" fill="hsl(200, 45%, 10%)" stroke="hsl(168, 65%, 45%)" strokeWidth="1" />
                          {/* PDF header band */}
                          <rect x="60" y="280" width="28" height="11" rx="4" fill="hsl(0, 75%, 55%)" opacity="0.9" />
                          <rect x="60" y="286" width="28" height="5" fill="hsl(0, 75%, 55%)" opacity="0.9" />
                          <text x="74" y="290" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="sans-serif">PDF</text>
                          <rect x="65" y="297" width="18" height="2" rx="1" fill="hsl(168, 65%, 45%)" opacity="0.6" />
                          <rect x="65" y="302" width="13" height="2" rx="1" fill="hsl(168, 65%, 45%)" opacity="0.4" />
                          <rect x="65" y="307" width="16" height="2" rx="1" fill="hsl(168, 65%, 45%)" opacity="0.3" />
                          <animate attributeName="transform" values="translate(0,0);translate(0,-6);translate(0,0)" dur="4s" repeatCount="indefinite" />
                        </g>

                        <g opacity="0.3">
                          <rect x="385" y="270" width="28" height="34" rx="4" fill="hsl(200, 45%, 10%)" stroke="hsl(200, 55%, 50%)" strokeWidth="1" />
                          {/* PDF header band */}
                          <rect x="385" y="270" width="28" height="11" rx="4" fill="hsl(0, 75%, 55%)" opacity="0.9" />
                          <rect x="385" y="276" width="28" height="5" fill="hsl(0, 75%, 55%)" opacity="0.9" />
                          <text x="399" y="280" textAnchor="middle" fill="white" fontSize="5" fontWeight="700" fontFamily="sans-serif">PDF</text>
                          <rect x="390" y="287" width="18" height="2" rx="1" fill="hsl(200, 55%, 50%)" opacity="0.6" />
                          <rect x="390" y="292" width="13" height="2" rx="1" fill="hsl(200, 55%, 50%)" opacity="0.4" />
                          <rect x="390" y="297" width="16" height="2" rx="1" fill="hsl(200, 55%, 50%)" opacity="0.3" />
                          <animate attributeName="transform" values="translate(0,0);translate(0,-6);translate(0,0)" dur="4s" begin="1s" repeatCount="indefinite" />
                        </g>

                        {/* Shield / security icon */}
                        <g transform="translate(228, 340)" opacity="0.3">
                          <path d="M12 0 L24 6 L24 16 Q24 26 12 30 Q0 26 0 16 L0 6 Z" fill="hsl(168, 70%, 34%)" opacity="0.3" stroke="hsl(168, 65%, 45%)" strokeWidth="1.2" />
                          <path d="M8 15 L11 18 L17 12" stroke="hsl(168, 65%, 45%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </g>

                        {/* Labels */}
                        <text x="85" y="260" textAnchor="middle" fill="hsl(168, 65%, 45%)" fontSize="10" fontWeight="600" fontFamily="sans-serif" opacity="0.7">Doctor</text>
                        <text x="395" y="260" textAnchor="middle" fill="hsl(200, 55%, 50%)" fontSize="10" fontWeight="600" fontFamily="sans-serif" opacity="0.7">Patient</text>
                        <text x="240" y="390" textAnchor="middle" fill="hsl(200, 15%, 55%)" fontSize="10" fontWeight="500" fontFamily="sans-serif" opacity="0.5">Voice-First AI Documentation</text>

                        {/* Gradient defs */}
                        <defs>
                          <radialGradient id="ctaGlow" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stopColor="hsl(168, 70%, 34%)" />
                            <stop offset="100%" stopColor="hsl(168, 70%, 34%)" stopOpacity="0" />
                          </radialGradient>
                        </defs>
                      </svg>
                    </div>
                  )}
                  {showForm && !showMicAnimation && (
                    <div className="bg-card rounded-2xl p-8 border shadow-card-lg animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
                      {/* Form Header */}
                      <div className="space-y-2 pb-4 border-b border-border">
                        <div className="flex items-center justify-between">
                          <h4 className="text-2xl font-bold font-heading text-foreground">New Request</h4>
                          <button
                            onClick={closeForm}
                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                            title="Close form"
                          >
                            <X className="w-5 h-5 text-muted-foreground" />
                          </button>
                        </div>
                        <p className="text-sm text-muted-foreground">Step 1 of 3 - Patient Information</p>
                      </div>

                      {/* Form Content */}
                      <div className="space-y-6">
                        {/* Email Field */}
                        <div className="space-y-2">
                          <Label htmlFor="email" className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Mail className="w-4 h-4 text-primary" />
                            Patient Email Address
                          </Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="patient@example.com"
                            value={formData.email}
                            onChange={(e) => handleFormChange("email", e.target.value)}
                            className={`h-11 rounded-lg transition-all ${formErrors.email
                              ? "border-destructive bg-destructive/5 focus:border-destructive"
                              : ""
                              }`}
                          />
                          {formErrors.email && (
                            <div className="flex items-center gap-2 text-sm text-destructive mt-2 animate-in fade-in">
                              <AlertTriangle className="w-4 h-4 shrink-0" />
                              <span>{formErrors.email}</span>
                            </div>
                          )}
                        </div>

                        {/* Chief Complaint Field */}
                        <div className="space-y-2">
                          <Label htmlFor="complaint" className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <FileText className="w-4 h-4 text-primary" />
                            Chief Complaint
                          </Label>
                          <Textarea
                            id="complaint"
                            placeholder="Describe the primary reason for this consultation..."
                            value={formData.chiefComplaint}
                            onChange={(e) => handleFormChange("chiefComplaint", e.target.value)}
                            className={`min-h-[100px] rounded-lg resize-none transition-all ${formErrors.chiefComplaint
                              ? "border-destructive bg-destructive/5 focus:border-destructive"
                              : ""
                              }`}
                          />
                          <div className="flex items-center justify-between">
                            {formErrors.chiefComplaint && (
                              <div className="flex items-center gap-2 text-sm text-destructive animate-in fade-in">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>{formErrors.chiefComplaint}</span>
                              </div>
                            )}
                            <span className={`text-xs font-medium ml-auto transition-colors ${formData.chiefComplaint.length > COMPLAINT_MAX_LENGTH
                              ? "text-destructive"
                              : formData.chiefComplaint.length > COMPLAINT_MAX_LENGTH * 0.8
                                ? "text-accent"
                                : "text-muted-foreground"
                              }`}>
                              {formData.chiefComplaint.length}/{COMPLAINT_MAX_LENGTH}
                            </span>
                          </div>
                        </div>

                        {/* Emergency Flag */}
                        <div className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${formData.isEmergency
                          ? "bg-destructive/5 border-destructive/20"
                          : "bg-muted border-border"
                          }`}>
                          <input
                            type="checkbox"
                            id="emergency"
                            checked={formData.isEmergency}
                            onChange={(e) => handleFormChange("isEmergency", e.target.checked)}
                            className="w-5 h-5 rounded cursor-pointer accent-destructive"
                          />
                          <Label htmlFor="emergency" className="flex items-center gap-2 font-semibold cursor-pointer flex-1">
                            <AlertTriangle className={`w-4 h-4 ${formData.isEmergency ? "text-destructive" : "text-muted-foreground"}`} />
                            <span className={formData.isEmergency ? "text-destructive" : "text-foreground"}>
                              Mark as Emergency Priority
                            </span>
                          </Label>
                        </div>

                        {/* Error Alert */}
                        {error && (
                          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3 animate-in fade-in">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold">Request Failed</p>
                              <p className="text-sm mt-1">{error}</p>
                            </div>
                          </div>
                        )}

                        {/* Submit Button */}
                        <Button
                          onClick={handleCreateSession}
                          variant="hero"
                          disabled={!formData.email.trim() || isCreating || requestSent || Object.keys(formErrors).length > 0}
                          className="w-full h-12 rounded-xl gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isCreating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Sending Request...
                            </>
                          ) : requestSent ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Request Sent Successfully!
                            </>
                          ) : (
                            <>
                              <Mail className="w-4 h-4" />
                              Send Session Request
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {showForm && showMicAnimation && (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center space-y-6 animate-in fade-in duration-500">
                        <div className="p-4 rounded-full bg-primary/10">
                          <CheckCircle className="w-8 h-8 text-primary" />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xl font-bold font-heading text-foreground">Request Sent!</h4>
                          <p className="text-sm text-muted-foreground max-w-xs">
                            Waiting for patient approval. You'll be notified when they respond.
                          </p>
                        </div>
                        <Badge className="bg-primary/10 text-primary border-0 px-3 py-1">
                          <div className="w-2 h-2 bg-primary rounded-full animate-pulse mr-2" />
                          Pending Approval
                        </Badge>
                      </div>
                    </div>
                  )}

                  {isRecording && (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-full p-8 rounded-2xl bg-destructive/5 border border-destructive/20 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xl font-bold font-heading text-destructive">Recording Session</h4>
                            <p className="text-sm text-destructive/70 mt-1">Audio is being captured and streamed</p>
                          </div>
                          <button
                            onClick={stopRecording}
                            className="p-2 rounded-lg hover:bg-destructive/10 transition-colors flex-shrink-0"
                            title="Stop recording"
                          >
                            <X className="w-5 h-5 text-destructive" />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-destructive/20 rounded-full overflow-hidden">
                              <div className="h-full bg-destructive animate-pulse" />
                            </div>
                          </div>
                          <div className="flex items-center justify-center gap-1.5 py-4">
                            <div className="w-2 bg-destructive rounded-full animate-recording-bar-1" />
                            <div className="w-2 bg-destructive rounded-full animate-recording-bar-2" style={{ animationDelay: '0.1s' }} />
                            <div className="w-2 bg-destructive rounded-full animate-recording-bar-3" style={{ animationDelay: '0.2s' }} />
                            <div className="w-2 bg-destructive rounded-full animate-recording-bar-4" style={{ animationDelay: '0.3s' }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="text-center p-3 rounded-xl bg-card border">
                            <p className="text-xs text-muted-foreground mb-1">Status</p>
                            <p className="text-sm font-bold text-destructive">
                              <span className="w-2 h-2 bg-destructive rounded-full animate-pulse inline-block mr-2" />
                              Live
                            </p>
                          </div>
                          <div className="text-center p-3 rounded-xl bg-card border">
                            <p className="text-xs text-muted-foreground mb-1">Patient Session</p>
                            <p className="text-sm font-bold text-foreground">{recordingSessionId ? 'Active' : 'N/A'}</p>
                          </div>
                        </div>

                        <Button
                          onClick={stopRecording}
                          variant="destructive"
                          className="w-full gap-2 rounded-xl font-semibold"
                        >
                          <StopCircle className="w-4 h-4" />
                          Stop Recording
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold font-heading text-foreground">Session Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {loading ? (
            [1, 2, 3].map(i => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))
          ) : (
            <>
              <Card className="group hover:shadow-card-lg hover:border-primary/30 transition-all duration-300 shadow-card rounded-xl overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Active Sessions</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Currently in progress</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    <Activity className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold font-heading text-foreground">{activeSessions.length}</p>
                </CardContent>
              </Card>

              <Card className="group hover:shadow-card-lg hover:border-accent/30 transition-all duration-300 shadow-card rounded-xl overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Awaiting approval</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white transition-all duration-300">
                    <Clock className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold font-heading text-foreground">{pendingSessions.length}</p>
                </CardContent>
              </Card>

              <Card className="group hover:shadow-card-lg hover:border-primary/30 transition-all duration-300 shadow-card rounded-xl overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">EMR generated by AI</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                    <FileBarChart className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold font-heading text-foreground">{completedSessions.length}</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
