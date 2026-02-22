/**
 * Patient Session Page — Smart router that shows either:
 *  1. Waiting Room (session in accepted/active state) — patient can select & approve docs to share
 *  2. Post-Session Summary (session completed/ended)
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { getSession } from "@/services/sessionService";
import { listDocuments, shareDocuments } from "@/services/documentService";
import { getPatientSummary } from "@/services/emrService";
import { toast } from "sonner";
import {
    Loader2,
    FileText,
    CheckCircle2,
    ChevronLeft,
    ShieldCheck,
    Send,
    Eye,
    EyeOff,
    Brain,
    Heart,
    Pill,
    Clock,
    AlertCircle,
    Calendar,
    MessageSquare,
    ArrowRight,
    Info,
    Stethoscope,
    UserCheck,
    Radio,
    Files,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";

// ─────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────
export default function PatientSessionPage() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { session: authSession } = useAuth();
    const { subscribe, send } = useWebSocket();
    const token = authSession?.access_token;

    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchSession() {
            if (!token || !sessionId) return;
            try {
                const data = await getSession(token, sessionId);
                setSessionData(data);
            } catch (err) {
                console.error("Failed to load session:", err);
            } finally {
                setLoading(false);
            }
        }
        fetchSession();
    }, [token, sessionId]);

    // Listen for real-time session status changes
    useEffect(() => {
        const unsub1 = subscribe("SESSION_STARTED", (data) => {
            if (data.session_id === sessionId) {
                setSessionData((prev) =>
                    prev ? { ...prev, status: "active" } : prev
                );
            }
        });
        const unsub2 = subscribe("SESSION_ENDED", (data) => {
            if (data.session_id === sessionId) {
                setSessionData((prev) =>
                    prev
                        ? { ...prev, status: data.status || "processing" }
                        : prev
                );
            }
        });
        const unsub3 = subscribe("AI_PROCESSING_COMPLETE", (data) => {
            if (data.session_id === sessionId) {
                setSessionData((prev) =>
                    prev ? { ...prev, status: "completed" } : prev
                );
                toast.success("Your session summary is ready!", { icon: "🎉" });
            }
        });
        return () => {
            unsub1();
            unsub2();
            unsub3();
        };
    }, [subscribe, sessionId]);

    // Join the WS session room
    useEffect(() => {
        if (sessionData && sessionId) {
            send("JOIN_SESSION", { session_id: sessionId });
        }
    }, [sessionData, sessionId, send]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-4">
                <div className="relative">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                    <div className="absolute inset-0 bg-primary/20 animate-pulse rounded-full blur-xl" />
                </div>
                <p className="text-muted-foreground font-medium animate-pulse">
                    Loading session...
                </p>
            </div>
        );
    }

    if (!sessionData) {
        return (
            <div className="text-center py-12">
                <p className="text-muted-foreground">Session not found.</p>
                <Button
                    variant="link"
                    onClick={() => navigate("/patient/dashboard")}
                    className="mt-4"
                >
                    Back to Dashboard
                </Button>
            </div>
        );
    }

    const isWaitingRoom = ["accepted", "active", "pending"].includes(
        sessionData.status
    );
    const isProcessing = sessionData.status === "processing";

    if (isWaitingRoom || isProcessing) {
        return (
            <PatientWaitingRoom
                sessionId={sessionId}
                sessionData={sessionData}
                token={token}
                subscribe={subscribe}
                isProcessing={isProcessing}
            />
        );
    }

    // Completed — show summary
    return <PatientSummaryView sessionId={sessionId} token={token} />;
}

// ─────────────────────────────────────────────────────
// Patient Waiting Room
// ─────────────────────────────────────────────────────
function PatientWaitingRoom({ sessionId, sessionData, token, subscribe, isProcessing }) {
    const navigate = useNavigate();
    const [documents, setDocuments] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isSharing, setIsSharing] = useState(false);
    const [sharedIds, setSharedIds] = useState(new Set());
    const [loadingDocs, setLoadingDocs] = useState(true);

    // Fetch all patient's uploaded documents
    useEffect(() => {
        async function fetchDocs() {
            if (!token) return;
            try {
                const docs = await listDocuments(token);
                setDocuments(docs || []);
            } catch (err) {
                console.error("Failed to load documents:", err);
            } finally {
                setLoadingDocs(false);
            }
        }
        fetchDocs();
    }, [token]);

    // Listen for document analysis complete events to update status
    useEffect(() => {
        const unsub = subscribe("DOCUMENT_ANALYSIS_COMPLETE", (data) => {
            setDocuments((prev) =>
                prev.map((d) =>
                    d.id === data.document_id ? { ...d, status: "ready" } : d
                )
            );
        });
        return unsub;
    }, [subscribe]);

    const toggleSelect = (docId) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(docId)) {
                next.delete(docId);
            } else {
                next.add(docId);
            }
            return next;
        });
    };

    const handleShareSelected = async () => {
        if (selectedIds.size === 0) {
            toast.warning("Select at least one document to share.");
            return;
        }
        setIsSharing(true);
        try {
            const ids = Array.from(selectedIds);
            await shareDocuments(token, {
                sessionId,
                documentIds: ids,
            });
            setSharedIds((prev) => new Set([...prev, ...ids]));
            setSelectedIds(new Set());
            toast.success(
                `${ids.length} document${ids.length > 1 ? "s" : ""} shared with your doctor!`,
                { icon: "📄" }
            );
        } catch (err) {
            console.error("Share failed:", err);
            toast.error("Failed to share documents. Please try again.");
        } finally {
            setIsSharing(false);
        }
    };

    const readyDocs = documents.filter((d) => d.status === "ready");
    const processingDocs = documents.filter((d) => d.status !== "ready");

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
            {/* Hero Header */}
            <div className="relative overflow-hidden bg-slate-900 px-4 py-10 text-white">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -mr-20 -mt-20 shrink-0" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl -ml-10 -mb-10 shrink-0" />

                <div className="container max-w-4xl mx-auto relative z-10">
                    <Button
                        variant="link"
                        onClick={() => navigate("/patient/dashboard")}
                        className="text-white/80 hover:text-white p-0 h-auto mb-4"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Back to Dashboard
                    </Button>

                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Badge className="bg-white/20 hover:bg-white/30 text-white border-none py-1">
                                {isProcessing ? "AI PROCESSING" : "LIVE SESSION"}
                            </Badge>
                            {!isProcessing && (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Connected
                                </div>
                            )}
                        </div>

                        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                            {isProcessing ? (
                                <>
                                    <Brain className="w-8 h-8 inline-block mr-2 text-primary animate-pulse" />
                                    Generating your report...
                                </>
                            ) : (
                                "Session with " + (sessionData.doctor_name || "your doctor")
                            )}
                        </h1>
                        <p className="text-white/70 max-w-xl text-base font-medium leading-relaxed">
                            {isProcessing
                                ? "Our AI is creating your EMR draft, clinical summary, and ICD codes. This usually takes 1–2 minutes."
                                : `Chief complaint: ${sessionData.chief_complaint || "General consultation"}. Share your medical records below so your doctor can review them during the session.`}
                        </p>
                    </div>
                </div>
            </div>

            <main className="container max-w-4xl mx-auto -mt-6 px-4 space-y-6">
                {/* Status Indicator */}
                {!isProcessing && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <Card className="border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                            <Radio className="w-7 h-7" />
                                        </div>
                                        <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                                            {sessionData.status === "active"
                                                ? "Session is Active"
                                                : "Waiting for Doctor to Start"}
                                        </h3>
                                        <p className="text-sm text-slate-500 mt-0.5">
                                            {sessionData.status === "active"
                                                ? "Your doctor is currently recording. Share files below to provide clinical context."
                                                : "Your doctor will begin the session soon. In the meantime, select which medical records to share."}
                                        </p>
                                    </div>
                                    <div className="hidden sm:flex flex-col items-end gap-1">
                                        <Badge
                                            variant="outline"
                                            className="text-primary border-primary/30 flex items-center gap-1"
                                        >
                                            <Stethoscope className="w-3 h-3" />
                                            {sessionData.doctor_name}
                                        </Badge>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Processing Indicator */}
                {isProcessing && (
                    <Card className="border-2 border-border border-dashed bg-muted/30 shadow-xl">
                        <CardContent className="p-8 text-center">
                            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-slate-900">AI Processing in Progress</h3>
                            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                                🧠 Our AI is generating your EMR draft, ICD codes, and clinical summary.
                                This usually takes 1–2 minutes. You'll be notified when it's ready.
                            </p>
                        </CardContent>
                    </Card>
                )}

                {/* Document Selection */}
                {!isProcessing && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card className="border-none shadow-2xl shadow-primary/5 bg-white dark:bg-slate-900 overflow-hidden">
                            <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl flex items-center gap-2">
                                            <Files className="w-5 h-5 text-primary" />
                                            Your Medical Records
                                        </CardTitle>
                                        <CardDescription className="mt-1">
                                            Select files to share with your doctor. Only approved files
                                            will be visible.
                                        </CardDescription>
                                    </div>
                                    {selectedIds.size > 0 && (
                                        <Button
                                            onClick={handleShareSelected}
                                            disabled={isSharing}
                                            className="gap-2 rounded-xl shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 font-bold"
                                        >
                                            {isSharing ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Send className="w-4 h-4" />
                                            )}
                                            Share {selectedIds.size} File
                                            {selectedIds.size > 1 ? "s" : ""}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="pt-4">
                                {loadingDocs ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="text-center py-12 space-y-3">
                                        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center">
                                            <FileText className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h4 className="font-bold text-slate-900">
                                            No documents uploaded yet
                                        </h4>
                                        <p className="text-sm text-slate-500 max-w-sm mx-auto">
                                            Upload medical records from your dashboard to share them
                                            with your doctor during sessions.
                                        </p>
                                        <Button
                                            variant="outline"
                                            onClick={() => navigate("/patient/dashboard")}
                                            className="rounded-xl"
                                        >
                                            Go to Dashboard
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Ready Documents */}
                                        {readyDocs.map((doc, i) => {
                                            const isSelected = selectedIds.has(doc.id);
                                            const isShared = sharedIds.has(doc.id);

                                            return (
                                                <motion.div
                                                    key={doc.id}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.04 }}
                                                    onClick={() => {
                                                        if (!isShared) toggleSelect(doc.id);
                                                    }}
                                                    className={`relative group flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${isShared
                                                            ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 cursor-default"
                                                            : isSelected
                                                                ? "bg-primary/5 border-primary/30 shadow-md shadow-primary/5"
                                                                : "bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-700 hover:border-primary/20 hover:shadow-md"
                                                        }`}
                                                >
                                                    {/* Checkbox */}
                                                    <div className="flex-shrink-0">
                                                        {isShared ? (
                                                            <div className="w-6 h-6 rounded-md bg-emerald-500 flex items-center justify-center">
                                                                <CheckCircle2 className="w-4 h-4 text-white" />
                                                            </div>
                                                        ) : (
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={() => toggleSelect(doc.id)}
                                                                className="w-5 h-5"
                                                            />
                                                        )}
                                                    </div>

                                                    {/* Doc Icon */}
                                                    <div
                                                        className={`p-2.5 rounded-xl ${isShared
                                                                ? "bg-emerald-100 text-emerald-600"
                                                                : "bg-slate-100 dark:bg-slate-700 text-slate-500 group-hover:bg-primary/10 group-hover:text-primary"
                                                            } transition-colors`}
                                                    >
                                                        <FileText className="w-5 h-5" />
                                                    </div>

                                                    {/* Doc Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                                                                {doc.title || doc.file_name}
                                                            </h4>
                                                            <Badge
                                                                variant="secondary"
                                                                className="text-[9px] font-black uppercase tracking-wider px-2 py-0"
                                                            >
                                                                {doc.document_type || "document"}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                                                            {doc.file_name} •{" "}
                                                            {new Date(doc.created_at).toLocaleDateString()}
                                                        </p>
                                                        {/* Summary preview */}
                                                        {doc.analysis_result?.summary && (
                                                            <p className="text-xs text-slate-500 mt-1 line-clamp-1 italic">
                                                                "{doc.analysis_result.summary}"
                                                            </p>
                                                        )}
                                                    </div>

                                                    {/* Status */}
                                                    <div className="flex-shrink-0">
                                                        {isShared ? (
                                                            <Badge className="bg-emerald-500 text-white border-none text-[10px] font-bold">
                                                                <Eye className="w-3 h-3 mr-1" />
                                                                Shared
                                                            </Badge>
                                                        ) : isSelected ? (
                                                            <Badge
                                                                variant="outline"
                                                                className="text-primary border-primary/30 text-[10px] font-bold"
                                                            >
                                                                Selected
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className="text-slate-400 border-slate-200 text-[10px] font-bold"
                                                            >
                                                                <EyeOff className="w-3 h-3 mr-1" />
                                                                Private
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}

                                        {/* Processing Documents */}
                                        {processingDocs.map((doc) => (
                                            <div
                                                key={doc.id}
                                                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 opacity-60"
                                            >
                                                <div className="flex-shrink-0">
                                                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                                </div>
                                                <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
                                                    <FileText className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm text-slate-900 truncate">
                                                        {doc.title || doc.file_name}
                                                    </h4>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        AI analysis in progress...
                                                    </p>
                                                </div>
                                                <Badge className="bg-muted text-muted-foreground border-none text-[10px] font-bold animate-pulse">
                                                    Processing
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Info Banner */}
                <div className="flex items-center justify-center gap-4 pt-4 text-muted-foreground opacity-50">
                    <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase">
                        <ShieldCheck className="w-3 h-3" />
                        HIPAA Compliant
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-border" />
                    <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase">
                        <Info className="w-3 h-3" />
                        End-to-End Encrypted
                    </div>
                </div>
            </main>
        </div>
    );
}

// ─────────────────────────────────────────────────────
// Patient Summary View (Post-Session)
// ─────────────────────────────────────────────────────
function PatientSummaryView({ sessionId, token }) {
    const navigate = useNavigate();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchSummary() {
            setLoading(true);
            setError(null);
            try {
                const data = await getPatientSummary(token, sessionId);
                setSummary(data);
            } catch (err) {
                console.error("Fetch summary error:", err);
                setError(
                    "Your session summary is being prepared by our AI. Please check back in a few minutes."
                );
            } finally {
                setLoading(false);
            }
        }
        if (token && sessionId) fetchSummary();
    }, [token, sessionId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-4">
                <div className="relative">
                    <Loader2 className="w-12 h-12 animate-spin text-primary" />
                    <div className="absolute inset-0 bg-primary/20 animate-pulse rounded-full blur-xl" />
                </div>
                <p className="text-muted-foreground font-medium animate-pulse">
                    Personalizing Your Health Care Plan...
                </p>
            </div>
        );
    }

    if (error || !summary) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Brain className="w-8 h-8 text-primary animate-bounce shadow-xl" />
                </div>
                <h2 className="text-xl font-bold mb-2">AI is Working...</h2>
                <p className="text-muted-foreground max-w-md mb-6">
                    {error ||
                        "We're almost there! Your doctor's notes are being translated into a summary for you."}
                </p>
                <Button
                    onClick={() => window.location.reload()}
                    variant="outline"
                    className="rounded-full"
                >
                    Check Again
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
            {/* Hero Header */}
            <div className="relative overflow-hidden bg-primary px-4 py-12 text-primary-foreground">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 shrink-0" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-3xl -ml-10 -mb-10 shrink-0" />

                <div className="container max-w-4xl mx-auto relative z-10">
                    <Button
                        variant="link"
                        onClick={() => navigate("/patient/dashboard")}
                        className="text-primary-foreground/80 hover:text-white p-0 h-auto mb-6"
                    >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Back to Dashboard
                    </Button>

                    <div className="space-y-4">
                        <Badge className="bg-white/20 hover:bg-white/30 text-white border-none py-1">
                            CONSULTATION SUMMARY
                        </Badge>
                        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                            Your Path to Wellness
                        </h1>
                        <p className="text-primary-foreground/80 max-w-xl text-lg font-medium leading-relaxed">
                            Your session from{" "}
                            {new Date().toLocaleDateString()} has been analyzed.
                            Here is your personalized care plan and next steps.
                        </p>
                    </div>
                </div>
            </div>

            <main className="container max-w-4xl mx-auto -mt-8 px-4 grid grid-cols-1 gap-6">
                {/* Main Summary Card */}
                <Card className="border-none shadow-2xl shadow-primary/10 overflow-hidden bg-white dark:bg-slate-900 border-t-4 border-t-primary">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Heart className="w-5 h-5 text-rose-500 fill-rose-500" />
                            Doctor's Brief
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <p className="text-lg font-medium leading-relaxed text-slate-700 dark:text-slate-300">
                            {summary.summary_text}
                        </p>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Action Items */}
                    <Card className="border-none shadow-xl shadow-blue-500/5">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-blue-600 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Next Steps
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {summary.key_takeaways?.map((item, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 group hover:shadow-md transition-all"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                                            {i + 1}
                                        </div>
                                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            {typeof item === "string" ? item : item.point}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Medications */}
                    <Card className="border-none shadow-xl shadow-emerald-500/5 bg-emerald-50/50 dark:bg-emerald-950/10">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                                <Pill className="w-4 h-4" />
                                Medication Guide
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {summary.medications_list?.length > 0 ? (
                                <div className="space-y-3">
                                    {summary.medications_list.map((med, i) => (
                                        <div
                                            key={i}
                                            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900 shadow-sm relative overflow-hidden group"
                                        >
                                            <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/5 rounded-bl-full group-hover:bg-emerald-500/10 transition-colors" />
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600">
                                                    <Clock className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                                        {med.name}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {med.how_to_take}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-6 opacity-40">
                                    <p className="text-xs">No new medications prescribed.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Warnings & Follow Up */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="border-none shadow-xl shadow-destructive/5 border-l-4 border-l-destructive/60 bg-destructive/5 dark:bg-destructive/10">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-destructive flex items-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                Important Warnings
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {summary.warnings?.map((w, i) => (
                                    <p
                                        key={i}
                                        className="text-sm font-medium text-foreground dark:text-foreground/80 flex items-start gap-2"
                                    >
                                        <span className="text-destructive font-bold">•</span>
                                        {typeof w === "string" ? w : w.warning}
                                    </p>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-xl shadow-primary/5 bg-slate-900 text-white">
                        <CardHeader>
                            <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary-foreground/60 flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                Follow-up Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-sm font-medium leading-relaxed opacity-90">
                                {summary.follow_up_notes ||
                                    "Your doctor will contact you if any further tests are needed. Stay healthy!"}
                            </p>
                            <Button
                                variant="secondary"
                                className="w-full gap-2 group"
                            >
                                <MessageSquare className="w-4 h-4" />
                                Message Doctor
                                <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {/* Footer Info */}
                <div className="flex items-center justify-center pt-8 gap-4 text-muted-foreground opacity-50">
                    <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase">
                        <Info className="w-3 h-3" />
                        AI Synchronized
                    </div>
                    <div className="w-1.5 h-1.5 rounded-full bg-border" />
                    <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest uppercase">
                        <CheckCircle2 className="w-3 h-3" />
                        Verified Record
                    </div>
                </div>
            </main>
        </div>
    );
}
