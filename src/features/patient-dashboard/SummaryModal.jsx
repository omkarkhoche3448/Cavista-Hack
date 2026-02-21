import { useState, useEffect } from "react";
import {
    Dialog,
    DialogHeader,
    DialogTitle,
    DialogContent,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Heart, ClipboardList, Pill, AlertTriangle, Check, FileText, CalendarDays } from "lucide-react";
import { getPatientSummary } from "@/services/emrService";
import { useAuth } from "@/features/auth";

export default function SummaryModal({ open, onOpenChange, session }) {
    const { session: authSession } = useAuth();
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const token = authSession?.access_token;

    useEffect(() => {
        if (open && session?.id && token) {
            fetchSummary();
        }
    }, [open, session?.id, token]);

    async function fetchSummary() {
        setLoading(true);
        setError(null);
        try {
            const data = await getPatientSummary(token, session.id);
            setSummary(data);
        } catch (err) {
            console.error("Failed to fetch summary:", err);
            setError("Failed to load visit summary. It might still be processing.");
        } finally {
            setLoading(false);
        }
    }

    if (!session) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto p-0 gap-0">
                <DialogHeader className="p-6 pb-0">
                    <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-xs uppercase tracking-wider">
                            Visit Summary
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {new Date(session.created_at).toLocaleDateString()}
                        </span>
                    </div>
                    <DialogTitle className="text-2xl font-bold">
                        Visit with {session.doctor_name}
                    </DialogTitle>
                    <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                        <Heart className="w-4 h-4 text-primary" />
                        {session.chief_complaint || "General Health Consultation"}
                    </p>
                </DialogHeader>

                <div className="p-6 pt-4">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">Generating your summary...</p>
                        </div>
                    ) : error ? (
                        <div className="py-12 text-center space-y-4">
                            <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm inline-block mx-auto">
                                {error}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Your doctor is likely still finalizing the report. Please check back in a few minutes.
                            </p>
                            <Button variant="outline" onClick={fetchSummary}>
                                Retry
                            </Button>
                        </div>
                    ) : summary ? (
                        <div className="space-y-8 animate-in fade-in duration-500">
                            {/* Summary Text */}
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-primary" />
                                    Doctor&apos;s Overview
                                </h3>
                                <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                                    <p className="text-base leading-relaxed whitespace-pre-wrap italic">
                                        &quot;{summary.summary_text}&quot;
                                    </p>
                                </div>
                            </div>

                            {/* Key Takeaways */}
                            {summary.key_takeaways?.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <Check className="w-4 h-4" />
                                        Key Takeaways
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {summary.key_takeaways.map((item, i) => (
                                            <div key={i} className="flex items-start gap-2 bg-green-50/50 dark:bg-green-950/10 p-3 rounded-lg border border-green-100 dark:border-green-900/30">
                                                <Check className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                                <span className="text-sm">{item.point || item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Medications */}
                            {summary.medications_list?.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <Pill className="w-4 h-4" />
                                        Prescribed Medications
                                    </h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {summary.medications_list.map((med, i) => (
                                            <div key={i} className="p-4 border rounded-xl bg-card shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="font-bold text-primary">{med.name}</p>
                                                    <Badge variant="outline" className="text-[10px] bg-primary/5">Active</Badge>
                                                </div>
                                                {med.what_it_does && (
                                                    <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                                                        {med.what_it_does}
                                                    </p>
                                                )}
                                                <div className="text-sm bg-muted/50 p-2 rounded text-foreground font-medium flex items-center gap-2">
                                                    <span className="w-1 h-1 bg-primary rounded-full" />
                                                    {med.how_to_take}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Warnings */}
                            {summary.warnings?.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-destructive flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        Important Warnings
                                    </h3>
                                    <div className="space-y-2">
                                        {summary.warnings.map((w, i) => (
                                            <div key={i} className="p-4 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl text-sm text-red-900 dark:text-red-300 flex items-start gap-3">
                                                <div className="w-5 h-5 bg-red-100 dark:bg-red-900/50 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <AlertTriangle className="w-3 h-3 text-red-600" />
                                                </div>
                                                {w.warning || w}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Follow up */}
                            {summary.follow_up_notes && (
                                <div className="pt-6 border-t">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Instructions / Next Steps</h3>
                                    <p className="text-sm text-foreground bg-muted/20 p-4 rounded-lg border border-dashed">
                                        {summary.follow_up_notes}
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-20 text-center text-muted-foreground">
                            <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
                            <p>No summary content found.</p>
                        </div>
                    )}
                </div>

                <div className="p-6 pt-0 flex justify-end">
                    <Button onClick={() => onOpenChange(false)}>
                        Close Summary
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
