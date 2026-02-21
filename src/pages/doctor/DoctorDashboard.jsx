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
  BarChart3,
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
    <Card className="group transition-all duration-300 hover:shadow-lg hover:border-primary hover:-translate-y-1 border-gray-200/50 dark:border-gray-800/50 overflow-hidden">
      <CardContent className="p-6">
        {/* Header with status */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors duration-300">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{session.patient_name}</p>
              <p className="text-sm text-muted-foreground truncate">{session.patient_email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {session.is_emergency && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
              </Badge>
            )}
            <Badge className={`whitespace-nowrap ${session.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400' :
              session.status === 'accepted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400' :
                session.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400' :
                  session.status === 'completed' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-400'
              }`}>
              {STATUS_BADGE[session.status]?.label ?? session.status}
            </Badge>
          </div>
        </div>

        {/* Chief Complaint */}
        {session.chief_complaint && (
          <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <p className="text-sm text-muted-foreground line-clamp-2">{session.chief_complaint}</p>
          </div>
        )}

        {/* Footer with time and action */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200/50 dark:border-gray-800/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{new Date(session.created_at).toLocaleDateString()} {new Date(session.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          {(isAccepted || isActive) && (
            <Button
              size="sm"
              className="gap-2 font-semibold"
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
      const data = await listSessions(token);
      console.log("[DoctorDashboard] API Result:", data);
      if (Array.isArray(data)) {
        setSessions(data);
      } else {
        toast.warning("Incomplete session data received");
        setSessions([]);
      }
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
      {/* Premium Welcome Header */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-secondary/5 border border-primary/20 animate-in fade-in duration-500">
        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 -mr-8 -mt-8">
          <LayoutDashboard className="w-48 h-48 text-primary" />
        </div>

        <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          <div className="space-y-3">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              Welcome, Dr. <span className="text-primary italic">{profile?.first_name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-muted-foreground font-medium">Your clinical command center is ready</p>
              <div className="h-4 w-[1px] bg-border hidden sm:block" />
              {isConnected ? (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 px-3 py-1">
                  <Wifi className="w-3 h-3" /> Live Control
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1 px-3 py-1">
                  <WifiOff className="w-3 h-3" /> Offline
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="default"
              className="rounded-full px-6 bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-300 font-bold"
            >
              <Activity className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all duration-300 font-bold"
              onClick={() => navigate("/doctor/sessions")}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Sessions
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all duration-300 font-bold"
            >
              <Users className="w-4 h-4 mr-2" />
              Patients
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-6 border-primary/20 hover:bg-primary hover:text-white transition-all duration-300 font-bold"
            >
              <FileBarChart className="w-4 h-4 mr-2" />
              Reports
            </Button>
          </div>
        </div>
      </div>

      {/* Start New Session CTA with Inline Form */}
      <div className="animate-in fade-in duration-500 delay-100">
        <div className="space-y-4 mb-6">
          <h2 className="text-3xl font-bold text-foreground">Initiate Patient Session</h2>
          <p className="text-muted-foreground text-lg">Send a consultation request and begin real-time patient interaction</p>
        </div>

        <div className="relative overflow-hidden">
          <Card className="relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5 border-2 border-dashed border-primary/40 hover:border-primary hover:shadow-xl transition-all duration-300 group">
            <div className="absolute inset-0 opacity-5 pointer-events-none">
              <div className="w-full h-full" style={{
                backgroundImage: `radial-gradient(circle at 25px 25px, currentColor 2px, transparent 0)`,
                backgroundSize: '50px 50px'
              }} />
            </div>

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
                        <h3 className="text-4xl font-black tracking-tight text-foreground">Ready to Start?</h3>
                        <p className="text-muted-foreground text-lg max-w-md mx-auto font-medium leading-relaxed">
                          Send a personalized consultation request to your patient. They'll receive it immediately and can approve to begin the session.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <Button
                          onClick={() => setShowForm(true)}
                          size="lg"
                          className="group/btn relative inline-flex items-center gap-4 px-8 py-7 text-xl font-bold rounded-full shadow-lg shadow-primary/30 transition-all duration-300 active:scale-95 hover:shadow-xl hover:shadow-primary/40"
                        >

                          <span className="relative z-10 flex items-center gap-3">
                            <Mic className="w-5 h-5" />
                            Create Session Request
                          </span>
                        </Button>
                        <p className="text-xs text-muted-foreground font-medium">Less than 1 minute to complete</p>
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

                {/* Right side - Form (fixed width, fades in/out) */}
                <div className="w-1/2 transition-all duration-500 ease-in-out">
                  {showForm && !showMicAnimation && (
                    <div className="bg-white dark:bg-gray-950 rounded-2xl p-8 border border-primary/30 shadow-2xl animate-in fade-in slide-in-from-right-4 duration-300 space-y-6">
                      {/* Form Header */}
                      <div className="space-y-2 pb-4 border-b border-primary/10">
                        <div className="flex items-center justify-between">
                          <h4 className="text-2xl font-bold text-foreground">New Request</h4>
                          <button
                            onClick={closeForm}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
                            title="Close form"
                          >
                            <X className="w-5 h-5 text-gray-500" />
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
                            className={`h-11 text-base rounded-lg border transition-all ${formErrors.email
                              ? "border-red-500 bg-red-50/50 dark:bg-red-950/20 focus:border-red-500 focus:ring-red-500"
                              : "border-gray-200 dark:border-gray-800 focus:border-primary focus:ring-primary"
                              }`}
                          />
                          {formErrors.email && (
                            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 mt-2 animate-in fade-in">
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
                            className={`min-h-[100px] text-base rounded-lg border resize-none transition-all ${formErrors.chiefComplaint
                              ? "border-red-500 bg-red-50/50 dark:bg-red-950/20 focus:border-red-500 focus:ring-red-500"
                              : "border-gray-200 dark:border-gray-800 focus:border-primary focus:ring-primary"
                              }`}
                          />
                          <div className="flex items-center justify-between">
                            {formErrors.chiefComplaint && (
                              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 animate-in fade-in">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>{formErrors.chiefComplaint}</span>
                              </div>
                            )}
                            <span className={`text-xs font-medium ml-auto transition-colors ${formData.chiefComplaint.length > COMPLAINT_MAX_LENGTH
                              ? "text-red-600 dark:text-red-400"
                              : formData.chiefComplaint.length > COMPLAINT_MAX_LENGTH * 0.8
                                ? "text-yellow-600 dark:text-yellow-400"
                                : "text-muted-foreground"
                              }`}>
                              {formData.chiefComplaint.length}/{COMPLAINT_MAX_LENGTH}
                            </span>
                          </div>
                        </div>

                        {/* Emergency Flag */}
                        <div className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${formData.isEmergency
                          ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                          : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800"
                          }`}>
                          <input
                            type="checkbox"
                            id="emergency"
                            checked={formData.isEmergency}
                            onChange={(e) => handleFormChange("isEmergency", e.target.checked)}
                            className="w-5 h-5 rounded cursor-pointer border-gray-300 text-red-600 focus:ring-red-500"
                          />
                          <Label htmlFor="emergency" className="flex items-center gap-2 font-semibold cursor-pointer flex-1">
                            <AlertTriangle className={`w-4 h-4 ${formData.isEmergency ? "text-red-600" : "text-gray-500"}`} />
                            <span className={formData.isEmergency ? "text-red-700 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}>
                              Mark as Emergency Priority
                            </span>
                          </Label>
                        </div>

                        {/* Error Alert */}
                        {error && (
                          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-start gap-3 animate-in fade-in">
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
                          disabled={!formData.email.trim() || isCreating || requestSent || Object.keys(formErrors).length > 0}
                          className="w-full h-12 text-base font-bold rounded-lg gap-2 shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="relative mx-auto w-20 h-20">
                          <div className="absolute inset-0 bg-green-500/20 rounded-full animate-pulse" />
                          <div className="absolute inset-0 rounded-full border-2 border-green-500 animate-spin" style={{ animationDuration: "3s" }} />
                          <div className="absolute inset-3 bg-green-500 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-10 h-10 text-white" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xl font-bold text-foreground">Request Sent!</h4>
                          <p className="text-sm text-muted-foreground max-w-xs">
                            Waiting for patient approval. You'll be notified when they respond.
                          </p>
                        </div>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 border-0 px-3 py-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
                          Pending Approval
                        </Badge>
                      </div>
                    </div>
                  )}

                  {isRecording && (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-full p-8 rounded-2xl bg-gradient-to-br from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/20 border border-red-200 dark:border-red-800 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xl font-bold text-red-700 dark:text-red-400">Recording Session</h4>
                            <p className="text-sm text-red-600 dark:text-red-500 mt-1">Audio is being captured and streamed</p>
                          </div>
                          <button
                            onClick={stopRecording}
                            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900 transition-colors flex-shrink-0"
                            title="Stop recording"
                          >
                            <X className="w-5 h-5 text-red-600 dark:text-red-400" />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 bg-red-200 dark:bg-red-900 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-red-500 via-red-400 to-red-500 animate-pulse" />
                            </div>
                          </div>
                          <div className="flex items-center justify-center gap-1.5 py-4">
                            <div className="w-2 bg-red-600 rounded-full animate-recording-bar-1" />
                            <div className="w-2 bg-red-600 rounded-full animate-recording-bar-2" style={{ animationDelay: '0.1s' }} />
                            <div className="w-2 bg-red-600 rounded-full animate-recording-bar-3" style={{ animationDelay: '0.2s' }} />
                            <div className="w-2 bg-red-600 rounded-full animate-recording-bar-4" style={{ animationDelay: '0.3s' }} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="text-center p-3 rounded-lg bg-white/50 dark:bg-gray-900/50">
                            <p className="text-xs text-muted-foreground mb-1">Status</p>
                            <p className="text-sm font-bold text-red-600 dark:text-red-400">
                              <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse inline-block mr-2" />
                              Live
                            </p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-white/50 dark:bg-gray-900/50">
                            <p className="text-xs text-muted-foreground mb-1">Patient Session</p>
                            <p className="text-sm font-bold text-foreground">{recordingSessionId ? 'Active' : 'N/A'}</p>
                          </div>
                        </div>

                        <Button
                          onClick={stopRecording}
                          variant="destructive"
                          className="w-full gap-2 font-semibold"
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

      {/* Stats - Premium Visuals */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-foreground">Session Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in-up duration-700 delay-200">
          {loading ? (
            [1, 2, 3].map(i => (
              <Skeleton key={i} className="h-40 w-full rounded-xl" />
            ))
          ) : (
            <>
              <Card className="group hover:border-green-500/50 hover:shadow-2xl hover:shadow-green-500/10 transition-all duration-500 rounded-xl overflow-hidden relative border-green-200/50 dark:border-green-900/30">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-700" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground tracking-widest uppercase">Active Sessions</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Currently in progress</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/40 text-green-600 group-hover:bg-green-600 group-hover:text-white transition-all duration-300">
                    <Activity className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-5xl font-black text-foreground">{activeSessions.length}</p>
                </CardContent>
              </Card>

              <Card className="group hover:border-yellow-500/50 hover:shadow-2xl hover:shadow-yellow-500/10 transition-all duration-500 rounded-xl overflow-hidden relative border-yellow-200/50 dark:border-yellow-900/30">
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-700" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground tracking-widest uppercase">Pending Requests</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/40 text-yellow-600 group-hover:bg-yellow-600 group-hover:text-white transition-all duration-300">
                    <Clock className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-5xl font-black text-foreground">{pendingSessions.length}</p>
                </CardContent>
              </Card>

              <Card className="group hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 rounded-xl overflow-hidden relative border-purple-200/50 dark:border-purple-900/30">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-700" />
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div>
                    <CardTitle className="text-sm font-semibold text-muted-foreground tracking-widest uppercase">Completed</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">EMR generated by AI</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-all duration-300">
                    <FileBarChart className="w-5 h-5" />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-5xl font-black text-foreground">{completedSessions.length}</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Active / Accepted Sessions */}
      {
        activeSessions.length > 0 && (
          <div className="animate-in fade-in-up duration-700 delay-300 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/40">
                    <Activity className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  Active Sessions
                </h2>
                <p className="text-sm text-muted-foreground mt-1">{activeSessions.length} session{activeSessions.length !== 1 ? 's' : ''} in progress</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onStart={handleStartSession}
                  isStarting={isStarting}
                />
              ))}
            </div>
          </div>
        )
      }

      {/* Pending Sessions */}
      {
        pendingSessions.length > 0 && (
          <div className="animate-in fade-in-up duration-700 delay-350 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/40">
                    <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  Pending Approvals
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Waiting for patient response on {pendingSessions.length} request{pendingSessions.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pendingSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onStart={handleStartSession}
                  isStarting={isStarting}
                />
              ))}
            </div>
          </div>
        )
      }

      {/* Recent / All Sessions */}
      <div className="animate-in fade-in-up duration-700 delay-400 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">All Sessions</h2>
            <p className="text-sm text-muted-foreground mt-1">{sessions.length} total session{sessions.length !== 1 ? 's' : ''}</p>
          </div>
          {error && <span className="text-sm text-destructive font-semibold bg-red-50 dark:bg-red-950/30 px-3 py-1 rounded-lg">{error}</span>}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card className="border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30">
            <CardContent className="py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center mb-6">
                <FileText className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-foreground">No Sessions Yet</h3>
              <p className="text-muted-foreground max-w-sm mx-auto mt-2">
                Create your first session request above to begin consulting with patients. You'll see all sessions listed here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onStart={handleStartSession}
                isStarting={isStarting}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Summary */}
      <div className="animate-in fade-in-up duration-700 delay-500">
        <Card className="border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-secondary/5 backdrop-blur-sm overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl flex items-center gap-2 text-foreground">
              <BarChart3 className="w-5 h-5 text-primary" />
              Today&apos;s Metrics
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Quick overview of your session metrics</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="p-5 rounded-lg bg-background border border-green-200/50 dark:border-green-900/30 hover:border-green-500/50 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/40">
                    <Activity className="w-4 h-4 text-green-600" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">Active</p>
                </div>
                <p className="text-3xl font-bold text-green-600">{activeSessions.length}</p>
              </div>
              <div className="p-5 rounded-lg bg-background border border-yellow-200/50 dark:border-yellow-900/30 hover:border-yellow-500/50 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-yellow-50 dark:bg-yellow-950/40">
                    <Clock className="w-4 h-4 text-yellow-600" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">Pending</p>
                </div>
                <p className="text-3xl font-bold text-yellow-600">{pendingSessions.length}</p>
              </div>
              <div className="p-5 rounded-lg bg-background border border-purple-200/50 dark:border-purple-900/30 hover:border-purple-500/50 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40">
                    <FileBarChart className="w-4 h-4 text-purple-600" />
                  </div>
                  <p className="text-sm font-semibold text-muted-foreground">Completed</p>
                </div>
                <p className="text-3xl font-bold text-purple-600">{completedSessions.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
