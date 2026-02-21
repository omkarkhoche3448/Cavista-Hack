import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { useWebSocket } from "@/context/WebSocketContext";
import { getEMRDrafts, getPatientSummary, approveEMR, getEMRPdfUrl } from "@/services/emrService";
import { getSession } from "@/services/sessionService";
import { toast } from "sonner";
import {
  Loader2,
  FileText,
  User,
  ClipboardList,
  Calendar,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
  Pill,
  Clock,
  LayoutDashboard,
  ShieldCheck,
  X,
  Download,
  PenLine,
  Lock,
  Undo2,
  Edit3,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function PostSessionReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const { subscribe } = useWebSocket();
  const token = authSession?.access_token;

  const [emrDraft, setEmrDraft] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Approval state
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const isApproved = emrDraft?.status === "approved";

  // PDF download state
  const [pdfUrl, setPdfUrl] = useState(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Editable fields state
  const [editFields, setEditFields] = useState({});

  // EMR field definitions for the editor
  const EMR_SECTIONS = [
    { key: "chief_complaint", label: "Chief Complaint", icon: <User className="w-4 h-4" />, rows: 2 },
    { key: "history_present_illness", label: "History of Present Illness", icon: <ClipboardList className="w-4 h-4" />, rows: 4 },
    { key: "past_medical_history", label: "Past Medical History", icon: <Calendar className="w-4 h-4" />, rows: 3 },
    { key: "medications", label: "Medications", icon: <Pill className="w-4 h-4" />, rows: 3 },
    { key: "allergies", label: "Allergies", icon: <AlertCircle className="w-4 h-4" />, rows: 2 },
    { key: "physical_examination", label: "Physical Examination", icon: <Stethoscope className="w-4 h-4" />, rows: 4 },
    { key: "assessment", label: "Assessment", icon: <FileText className="w-4 h-4" />, rows: 4 },
    { key: "treatment_plan", label: "Treatment Plan", icon: <CheckCircle2 className="w-4 h-4" />, rows: 3 },
    { key: "follow_up_plan", label: "Follow-Up Plan", icon: <Clock className="w-4 h-4" />, rows: 2 },
  ];

  // Listen for PDF ready event
  useEffect(() => {
    if (!sessionId || !subscribe) return;

    const unsub = subscribe("EMR_PDF_READY", (data) => {
      if (data.session_id === sessionId) {
        toast.success("EMR PDF is ready!", {
          description: "The finalized document is now available for download.",
        });
        // We don't have the URL in the event, but we know it's ready now
        // next time handleDownloadPdf is called, it will fetch the URL
      }
    });

    return () => unsub && unsub();
  }, [sessionId, subscribe]);

  // Initialize edit fields when dialog opens
  function openApprovalDialog() {
    if (!emrDraft) return;
    const initial = {};
    EMR_SECTIONS.forEach(({ key }) => {
      const val = emrDraft[key];
      initial[key] = typeof val === "string" ? val : (val != null ? JSON.stringify(val, null, 2) : "");
    });
    setEditFields(initial);
    setReviewNotes("");
    setShowApprovalDialog(true);
  }

  function getOriginalValue(key) {
    const val = emrDraft?.[key];
    return typeof val === "string" ? val : (val != null ? JSON.stringify(val, null, 2) : "");
  }

  function getChangedFields() {
    const changes = {};
    EMR_SECTIONS.forEach(({ key }) => {
      if (editFields[key] !== getOriginalValue(key)) {
        changes[key] = editFields[key];
      }
    });
    return changes;
  }

  const changedFields = showApprovalDialog ? getChangedFields() : {};
  const changeCount = Object.keys(changedFields).length;

  const calculateAge = (dob) => {
    if (!dob) return "Unknown";
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [sessionData, drafts, summaryData] = await Promise.all([
          getSession(token, sessionId),
          getEMRDrafts(token, sessionId),
          getPatientSummary(token, sessionId).catch(() => null),
        ]);
        setSessionInfo(sessionData);
        if (drafts && drafts.length > 0) {
          setEmrDraft(drafts[0]);
        }
        setSummary(summaryData);
      } catch (err) {
        console.error("Fetch error:", err);
        setError("Failed to load clinical documentation. The AI might still be processing.");
      } finally {
        setLoading(false);
      }
    }
    if (token && sessionId) fetchData();
  }, [token, sessionId]);

  // ── Approve handler ──
  async function handleApproveEMR() {
    if (!emrDraft?.id) return;
    setIsApproving(true);
    try {
      const edits = changeCount > 0 ? changedFields : null;
      const result = await approveEMR(token, {
        draftId: emrDraft.id,
        reviewNotes: reviewNotes.trim() || null,
        edits,
      });
      // Update local state to reflect approval + edits
      setEmrDraft((prev) => ({ ...prev, ...changedFields, status: "approved" }));
      setShowApprovalDialog(false);
      setReviewNotes("");

      toast.success("EMR approved and finalized.", {
        description: "PDF generation has started in the background. You'll be notified when it's ready.",
      });
    } catch (err) {
      console.error("Approval error:", err);
      toast.error("Failed to approve EMR.", {
        description: err.message || "Please try again.",
      });
    } finally {
      setIsApproving(false);
    }
  }

  // ── Download PDF handler ──
  async function handleDownloadPdf() {
    // Use cached URL if we already have one
    if (pdfUrl) {
      window.open(pdfUrl, "_blank");
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const result = await getEMRPdfUrl(token, sessionId);
      if (result?.pdf_url) {
        setPdfUrl(result.pdf_url);
        window.open(result.pdf_url, "_blank");
      } else {
        toast.error("PDF not available.", { description: "The PDF may still be generating. Try again shortly." });
      }
    } catch (err) {
      console.error("PDF download error:", err);
      toast.error("Failed to fetch PDF.", { description: err.message || "Please try again." });
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-4">
        <div className="relative">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <div className="absolute inset-0 bg-primary/20 animate-pulse rounded-full blur-xl" />
        </div>
        <p className="text-muted-foreground font-medium animate-pulse">Finalizing Clinical Synthesis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold mb-2">Analysis Delayed</h2>
        <p className="text-muted-foreground max-w-md mb-6">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">Retry Fetch</Button>
      </div>
    );
  }

  const renderSection = (title, content, icon) => {
    if (!content || content === "Unknown" || content === "None" || (Array.isArray(content) && content.length === 0)) return null;

    const formatValue = (val) => {
      if (typeof val === 'string') return val;
      if (typeof val === 'number') return val.toString();
      if (typeof val === 'object' && val !== null) {
        if (val.name) return val.name;
        if (val.text) return val.text;
        if (val.diagnosis) return val.diagnosis;
        return JSON.stringify(val);
      }
      return String(val);
    };

    return (
      <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <h3 className="font-bold text-sm uppercase tracking-wider text-foreground/80">{title}</h3>
        </div>
        <div className="pl-10">
          {Array.isArray(content) ? (
            <ul className="space-y-2">
              {content.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 flex-shrink-0" />
                  {formatValue(item)}
                </li>
              ))}
            </ul>
          ) : typeof content === 'object' && content !== null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(content).map(([key, value]) => (
                <div key={key} className="flex flex-col p-2 rounded-lg bg-muted/20 border border-border/50">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-tighter">{key.replace(/_/g, ' ')}</span>
                  <span className="text-sm font-medium text-foreground/80">{formatValue(value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">{content}</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950/50">

      {/* ── Full-Screen Edit & Approve Modal ── */}
      {showApprovalDialog && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background animate-in fade-in duration-200">
          {/* Modal Header */}
          <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur-md">
            <div className="max-w-5xl mx-auto flex items-center justify-between px-6 h-16">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <Edit3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">Review, Edit & Approve EMR</h2>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    Draft {emrDraft?.id?.slice(0, 8)}… · Edit fields below, then approve
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {changeCount > 0 && (
                  <Badge className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs gap-1">
                    <PenLine className="w-3 h-3" />
                    {changeCount} edit{changeCount > 1 ? "s" : ""}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="rounded-full" onClick={() => !isApproving && setShowApprovalDialog(false)} disabled={isApproving}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Modal Body — Scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

              {/* Info banner */}
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Edit EMR Fields</p>
                    <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                      Review each section below. Click any field to make corrections. Modified fields are highlighted. You can undo individual changes before finalizing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Editable EMR Sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {EMR_SECTIONS.map(({ key, label, icon, rows }) => {
                  const isModified = editFields[key] !== getOriginalValue(key);
                  return (
                    <div
                      key={key}
                      className={`rounded-xl border p-4 transition-all duration-300 ${isModified
                        ? "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/10 shadow-md shadow-amber-500/5"
                        : "border-border bg-card hover:border-primary/20"
                        }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/70">
                          <span className="p-1 rounded-md bg-primary/10 text-primary">{icon}</span>
                          {label}
                        </label>
                        <div className="flex items-center gap-1.5">
                          {isModified && (
                            <>
                              <Badge variant="outline" className="text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700 px-1.5 py-0">
                                Modified
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 rounded-md text-muted-foreground hover:text-foreground"
                                onClick={() => setEditFields((prev) => ({ ...prev, [key]: getOriginalValue(key) }))}
                                title="Undo changes"
                              >
                                <Undo2 className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <textarea
                        className="w-full px-3 py-2.5 text-sm rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-y placeholder:text-muted-foreground/40 transition-all leading-relaxed"
                        rows={rows}
                        value={editFields[key] || ""}
                        onChange={(e) => setEditFields((prev) => ({ ...prev, [key]: e.target.value }))}
                        disabled={isApproving}
                        placeholder={`Enter ${label.toLowerCase()}…`}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Review Notes */}
              <div className="rounded-xl border border-border bg-card p-4">
                <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground/70 mb-2">
                  <span className="p-1 rounded-md bg-primary/10 text-primary"><PenLine className="w-4 h-4" /></span>
                  Review Notes <span className="text-[10px] font-normal normal-case text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none placeholder:text-muted-foreground/40 transition-all"
                  rows={3}
                  placeholder="Add any notes about this review (e.g., corrections made, concerns, additional context)…"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  disabled={isApproving}
                />
              </div>

              {/* Approval warning */}
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">This action is irreversible</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                      By approving, you certify that you have reviewed the AI-generated EMR draft, made necessary edits, and confirm it is clinically accurate. A final, immutable record will be created with a cryptographic checksum.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer — Fixed */}
          <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur-md">
            <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
              <div className="text-xs text-muted-foreground">
                {changeCount > 0 ? (
                  <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                    <PenLine className="w-3 h-3" />
                    {changeCount} field{changeCount > 1 ? "s" : ""} modified — edits will be saved with approval
                  </span>
                ) : (
                  <span>No edits made — original AI draft will be finalized</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setShowApprovalDialog(false)} disabled={isApproving} className="rounded-xl">
                  Cancel
                </Button>
                <Button
                  onClick={handleApproveEMR}
                  disabled={isApproving}
                  className="gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 px-6"
                >
                  {isApproving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {isApproving ? "Signing & Finalizing…" : "Approve & Sign EMR"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md">
        <div className="container max-w-6xl mx-auto h-16 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/doctor/dashboard")} className="rounded-full">
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold tracking-tight">Clinical Post-Session Review</h1>
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Session ID: {sessionId?.slice(0, 8)}...</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:flex gap-2" onClick={() => navigate("/doctor/dashboard")}>
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Button>

            {isApproved ? (
              <div className="flex items-center gap-2">
                <Badge className="gap-1.5 px-4 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-bold text-sm">
                  <Lock className="w-3.5 h-3.5" />
                  EMR Approved
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                >
                  {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download PDF
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="gap-2 shadow-lg shadow-primary/20"
                onClick={() => openApprovalDialog()}
                disabled={!emrDraft}
              >
                <CheckCircle2 className="w-4 h-4" />
                Review & Approve EMR
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="container max-w-6xl mx-auto py-8 px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: EMR Draft */}
        <div className="lg:col-span-2 space-y-6">
          {/* Approval banner */}
          {isApproved && (
            <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">EMR Finalized & Signed</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">
                    This record has been approved and locked. A final EMR with cryptographic checksum has been created.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20 flex-shrink-0"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
              >
                {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </Button>
            </div>
          )}

          <Card className={`border-primary/10 shadow-xl shadow-primary/5 overflow-hidden ${isApproved ? 'ring-2 ring-emerald-200 dark:ring-emerald-800' : ''}`}>
            <CardHeader className="bg-muted/30 border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-primary" />
                    Generated EMR Draft
                  </CardTitle>
                  <CardDescription>AI-synthesized clinical record from session audio & notes</CardDescription>
                </div>
                <Badge variant="outline" className={isApproved
                  ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                  : "bg-primary/5 text-primary border-primary/20"
                }>
                  {isApproved ? "✓ Approved" : "v1.0 Auto-Gen"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[70vh]">
                <div className="p-8">
                  {!emrDraft ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                      <FileText className="w-12 h-12 mb-4" />
                      <p>No EMR data available.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        {renderSection("Patient Name", sessionInfo?.patient_name, <User className="w-4 h-4" />)}
                        {renderSection("Age", calculateAge(sessionInfo?.patient_dob), <Calendar className="w-4 h-4" />)}
                        {renderSection("Gender", sessionInfo?.patient_gender, <User className="w-4 h-4" />)}
                      </div>

                      <Separator className="my-6 opacity-50" />

                      {renderSection("Chief Complaint", emrDraft.chief_complaint, <User className="w-4 h-4" />)}
                      {renderSection("History of Present Illness", emrDraft.history_present_illness, <ClipboardList className="w-4 h-4" />)}
                      {renderSection("Past Medical History", emrDraft.past_medical_history, <Calendar className="w-4 h-4" />)}
                      {renderSection("Medications", emrDraft.medications, <Pill className="w-4 h-4" />)}
                      {renderSection("Allergies", emrDraft.allergies, <AlertCircle className="w-4 h-4" />)}

                      <Separator className="my-6 opacity-50" />

                      {renderSection("Physical Examination", emrDraft.physical_examination, <Stethoscope className="w-4 h-4" />)}
                      {renderSection("Assessment", emrDraft.assessment, <FileText className="w-4 h-4" />)}

                      <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/10">
                        <h4 className="text-xs font-bold text-primary uppercase mb-3 px-1">Prescribed Plan</h4>
                        {renderSection("Plan", emrDraft.treatment_plan, <CheckCircle2 className="w-4 h-4" />)}
                        {renderSection("Follow Up", emrDraft.follow_up_plan, <Clock className="w-4 h-4" />)}
                        {renderSection("ICD-10 Codes", emrDraft.diagnoses, <AlertCircle className="w-4 h-4" />)}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Patient Summary & Metadata */}
        <div className="space-y-6">
          {/* Patient-Friendly Summary */}
          <Card className="border-blue-200 dark:border-blue-900 shadow-xl shadow-blue-500/5 bg-gradient-to-b from-blue-50 to-white dark:from-blue-950/30 dark:to-slate-950">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <CheckCircle2 className="w-4 h-4" />
                Patient-Friendly Summary
              </CardTitle>
              <CardDescription className="text-[10px]">What the patient will see in their dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary ? (
                <>
                  <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 italic">
                    "{summary.summary_text}"
                  </p>

                  {summary.key_takeaways?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Key Takeaways</p>
                      <div className="space-y-1.5">
                        {summary.key_takeaways.map((task, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/50 dark:bg-slate-900/50 border border-blue-100 dark:border-blue-900/50">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 mt-0.5" />
                            <span className="text-[11px] leading-tight font-medium">{typeof task === 'string' ? task : task.point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {summary.medications_list?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Medications</p>
                      <div className="space-y-1.5">
                        {summary.medications_list.map((med, i) => (
                          <div key={i} className="p-2 rounded-lg bg-blue-500/5 border border-blue-200 dark:border-blue-800">
                            <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400">{med.name}</p>
                            <p className="text-[10px] text-blue-600 dark:text-blue-500">{med.how_to_take}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center opacity-40">
                  <p className="text-xs">Summary not yet available.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ICD-10 Coding */}
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">ICD-10 Mapping</CardTitle>
            </CardHeader>
            <CardContent>
              {emrDraft?.diagnoses?.length > 0 ? (
                <div className="space-y-2">
                  {emrDraft.diagnoses.map((diag, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg border bg-slate-50/50 dark:bg-slate-900/50">
                      <span className="text-[11px] font-medium truncate max-w-[140px]">{diag}</span>
                      <Badge variant="secondary" className="text-[9px] font-bold font-mono">CODE PENDING</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">No diagnoses captured for coding.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}