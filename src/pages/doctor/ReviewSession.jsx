import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { getEMRDrafts, getPatientSummary } from "@/services/emrService";
import { getSession } from "@/services/sessionService";
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
  LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PostSessionReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const token = authSession?.access_token;

  const [emrDraft, setEmrDraft] = useState(null);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
          getPatientSummary(token, sessionId)
        ]);
        setSessionInfo(sessionData);
        if (drafts && drafts.length > 0) {
          console.log("DEBUG: Raw EMR Draft from DB:", drafts[0]);
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
            <Button size="sm" className="gap-2 shadow-lg shadow-primary/20">
              <CheckCircle2 className="w-4 h-4" />
              Approve EMR
            </Button>
          </div>
        </div>
      </div>

      <main className="container max-w-6xl mx-auto py-8 px-4 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: EMR Draft */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-primary/10 shadow-xl shadow-primary/5 overflow-hidden">
            <CardHeader className="bg-muted/30 border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-primary" />
                    Generated EMR Draft
                  </CardTitle>
                  <CardDescription>AI-synthesized clinical record from session audio & notes</CardDescription>
                </div>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">v1.0 Auto-Gen</Badge>
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

          {/* ICD-10 Coding (Placeholder for future iteration or use if data exists) */}
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