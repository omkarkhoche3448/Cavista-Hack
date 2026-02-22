import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { getPatientSummary } from "@/services/emrService";
import {
  Loader2,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Pill,
  Clock,
  Heart,
  Brain,
  MessageSquare,
  ArrowRight,
  Info,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function IndividualSessionSummary() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const token = authSession?.access_token;

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
        setError("Your session summary is being prepared by our AI. Please check back in a few minutes.");
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
        <p className="text-muted-foreground font-medium animate-pulse">Personalizing Your Health Care Plan...</p>
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
        <p className="text-muted-foreground max-w-md mb-6">{error || "We're almost there! Your doctor's notes are being translated into a summary for you."}</p>
        <Button onClick={() => window.location.reload()} variant="outline" className="rounded-full">Check Again</Button>
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
          <Button variant="link" onClick={() => navigate("/patient/dashboard")} className="text-primary-foreground/80 hover:text-white p-0 h-auto mb-6">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Button>

          <div className="space-y-4">
            <Badge className="bg-white/20 hover:bg-white/30 text-white border-none py-1">CONSULTATION SUMMARY</Badge>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Your Path to Wellness</h1>
            <p className="text-primary-foreground/80 max-w-xl text-lg font-medium leading-relaxed">
              Your session from {new Date().toLocaleDateString()} has been analyzed. Here is your personalized care plan and next steps.
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
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 group hover:shadow-md transition-all">
                    <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 group-hover:scale-110 transition-transform">{i + 1}</div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{typeof item === 'string' ? item : item.point}</p>
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
                    <div key={i} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500/5 rounded-bl-full group-hover:bg-emerald-500/10 transition-colors" />
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{med.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{med.how_to_take}</p>
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
                  <p key={i} className="text-sm font-medium text-foreground dark:text-foreground/80 flex items-start gap-2">
                    <span className="text-destructive font-bold">•</span>
                    {typeof w === 'string' ? w : w.warning}
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
                {summary.follow_up_notes || "Your doctor will contact you if any further tests are needed. Stay healthy!"}
              </p>
              <Button variant="secondary" className="w-full gap-2 group">
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