import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveEMR,
  getEMRDrafts,
  getICDMappings,
  getPatientSummary,
  getTreatments,
  updateICDMapping,
  approveTreatment,
  approvePatientSummary,
} from "@/services/emrService";
import { getSession } from "@/services/sessionService";
import { CheckCircle, XCircle, Loader2, FileText, ListChecks, Pill, User } from "lucide-react";

function JsonBlock({ value }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "string") return <span className="whitespace-pre-wrap">{value}</span>;
  return (
    <pre className="text-xs p-3 rounded-lg bg-muted/30 border overflow-auto max-h-72">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function PostSessionReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const token = authSession?.access_token;

  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [icdMappings, setIcdMappings] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const [approvingEmr, setApprovingEmr] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [approvingSummary, setApprovingSummary] = useState(false);

  const latestDraft = useMemo(() => drafts?.[0] ?? null, [drafts]);

  const loadAll = useCallback(async () => {
    if (!token || !sessionId) return;
    setLoading(true);
    try {
      const [sess, ds, icd, tx] = await Promise.all([
        getSession(token, sessionId),
        getEMRDrafts(token, sessionId).catch(() => []),
        getICDMappings(token, sessionId).catch(() => []),
        getTreatments(token, sessionId).catch(() => []),
      ]);
      setSessionData(sess);
      setDrafts(Array.isArray(ds) ? ds : []);
      setIcdMappings(Array.isArray(icd) ? icd : []);
      setTreatments(Array.isArray(tx) ? tx : []);

      try {
        const s = await getPatientSummary(token, sessionId);
        setSummary(s);
      } catch {
        setSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, [token, sessionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleApproveEmr() {
    if (!latestDraft?.id) return;
    setApprovingEmr(true);
    try {
      await approveEMR(token, { draftId: latestDraft.id, reviewNotes: reviewNotes || null, edits: null });
      navigate("/doctor/sessions");
    } catch (e) {
      console.error("Approve EMR failed:", e);
      alert(e.message || "Failed to approve EMR");
    } finally {
      setApprovingEmr(false);
    }
  }

  async function handleUpdateICD(mappingId, action) {
    setUpdatingId(mappingId);
    try {
      await updateICDMapping(token, mappingId, action);
      setIcdMappings((prev) => prev.map((m) => m.id === mappingId ? { ...m, approval_status: action } : m));
    } catch (e) {
      console.error("Update ICD failed:", e);
      alert(e.message || "Failed to update ICD mapping");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleApproveTreatment(suggestionId, action) {
    setUpdatingId(suggestionId);
    try {
      await approveTreatment(token, { suggestionId, action, doctorNotes: null });
      setTreatments((prev) => prev.map((t) => t.id === suggestionId ? { ...t, approval_status: action } : t));
    } catch (e) {
      console.error("Approve treatment failed:", e);
      alert(e.message || "Failed to update treatment");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleApproveSummary() {
    if (!summary?.id) return;
    setApprovingSummary(true);
    try {
      await approvePatientSummary(token, { summaryId: summary.id, edits: null });
      setSummary((prev) => prev ? { ...prev, approval_status: "approved" } : prev);
    } catch (e) {
      console.error("Approve summary failed:", e);
      alert(e.message || "Failed to approve summary");
    } finally {
      setApprovingSummary(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Card>
          <CardHeader><Skeleton className="h-6 w-44" /></CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Session not found.
      </div>
    );
  }

  const pendingIcd = icdMappings.filter((m) => m.approval_status === "pending");
  const pendingTx = treatments.filter((t) => t.approval_status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold font-heading text-foreground flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Review Session
          </h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            {sessionData.patient_name} • {sessionData.chief_complaint || "General consultation"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2">
            <ListChecks className="w-4 h-4" />
            {pendingIcd.length + pendingTx.length} pending
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="draft" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="icd">ICD</TabsTrigger>
          <TabsTrigger value="treatments">Treatments</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="draft">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">EMR Draft</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{latestDraft?.status || "—"}</Badge>
                <Button onClick={handleApproveEmr} disabled={!latestDraft?.id || approvingEmr} className="gap-2">
                  {approvingEmr ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Approve EMR
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!latestDraft ? (
                <p className="text-muted-foreground">No draft found for this session.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Chief Complaint</p>
                      <JsonBlock value={latestDraft.chief_complaint} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Assessment</p>
                      <JsonBlock value={latestDraft.assessment} />
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">History (HPI)</p>
                      <JsonBlock value={latestDraft.history_present_illness} />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Review Notes (optional)</p>
                    <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Notes for the record (optional)..." />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="icd">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">ICD Mappings</CardTitle>
              <Badge variant="outline">{pendingIcd.length} pending</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {icdMappings.length === 0 ? (
                <p className="text-muted-foreground">No ICD mappings generated.</p>
              ) : (
                icdMappings.map((m) => (
                  <div key={m.id} className="p-4 rounded-xl border bg-card flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{m.diagnosis_text}</p>
                      <p className="text-sm text-muted-foreground">
                        {m.icd_code ? `${m.icd_code} — ${m.icd_description || ""}` : "No match"}
                      </p>
                      <Badge variant="outline" className="mt-2">{m.approval_status}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={updatingId === m.id || m.approval_status === "approved"}
                        onClick={() => handleUpdateICD(m.id, "approved")}
                      >
                        {updatingId === m.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={updatingId === m.id || m.approval_status === "rejected"}
                        onClick={() => handleUpdateICD(m.id, "rejected")}
                      >
                        <XCircle className="w-3 h-3" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="treatments">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Pill className="w-4 h-4 text-primary" /> Treatment Suggestions
              </CardTitle>
              <Badge variant="outline">{pendingTx.length} pending</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {treatments.length === 0 ? (
                <p className="text-muted-foreground">No treatment suggestions generated.</p>
              ) : (
                treatments.map((t) => (
                  <div key={t.id} className="p-4 rounded-xl border bg-card flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{t.title}</p>
                      {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        {t.suggestion_type && <Badge variant="outline">{t.suggestion_type}</Badge>}
                        <Badge variant="outline">{t.approval_status}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={updatingId === t.id || t.approval_status === "approved"}
                        onClick={() => handleApproveTreatment(t.id, "approved")}
                      >
                        {updatingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={updatingId === t.id || t.approval_status === "rejected"}
                        onClick={() => handleApproveTreatment(t.id, "rejected")}
                      >
                        <XCircle className="w-3 h-3" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Patient Summary</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{summary?.approval_status || "—"}</Badge>
                <Button
                  onClick={handleApproveSummary}
                  disabled={!summary?.id || approvingSummary || summary?.approval_status === "approved"}
                  className="gap-2"
                >
                  {approvingSummary ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Approve Summary
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!summary ? (
                <p className="text-muted-foreground">No summary found yet.</p>
              ) : (
                <>
                  <div className="p-4 rounded-xl border bg-muted/20">
                    <p className="whitespace-pre-wrap">{summary.summary_text}</p>
                  </div>
                  {summary.key_takeaways?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Takeaways</p>
                      <ul className="list-disc pl-5 space-y-1 text-sm">
                        {summary.key_takeaways.map((k, i) => (
                          <li key={i}>{k.point || k}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
