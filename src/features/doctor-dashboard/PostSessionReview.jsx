import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  Send,
  Pill,
  Stethoscope,
  ClipboardList,
  AlertTriangle,
  Heart,
} from "lucide-react";
import { getSession } from "@/services/sessionService";
import {
  getEMRDrafts,
  approveEMR,
  getICDMappings,
  updateICDMapping,
  getTreatments,
  approveTreatment,
  getPatientSummary,
  approvePatientSummary,
} from "@/services/emrService";

export default function PostSessionReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const token = authSession?.access_token;

  const [sessionData, setSessionData] = useState(null);
  const [emrDraft, setEmrDraft] = useState(null);
  const [icdMappings, setIcdMappings] = useState([]);
  const [treatments, setTreatments] = useState([]);
  const [patientSummary, setPatientSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    async function load() {
      if (!token || !sessionId) return;
      try {
        const [sess, drafts, icd, tx, summary] = await Promise.all([
          getSession(token, sessionId),
          getEMRDrafts(token, sessionId).catch(() => []),
          getICDMappings(token, sessionId).catch(() => []),
          getTreatments(token, sessionId).catch(() => []),
          getPatientSummary(token, sessionId).catch(() => null),
        ]);
        setSessionData(sess);
        setEmrDraft(drafts[0] || null);
        setIcdMappings(icd);
        setTreatments(tx);
        setPatientSummary(summary);
      } catch (err) {
        console.error("Failed to load review data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, sessionId]);

  async function handleApproveEMR() {
    if (!emrDraft) return;
    setApproving("emr");
    try {
      await approveEMR(token, { draftId: emrDraft.id, reviewNotes });
      setEmrDraft((prev) => ({ ...prev, status: "approved" }));
    } catch (err) {
      console.error("Failed to approve EMR:", err);
    } finally {
      setApproving("");
    }
  }

  async function handleIcdAction(mappingId, action) {
    setApproving(`icd-${mappingId}`);
    try {
      await updateICDMapping(token, mappingId, action);
      setIcdMappings((prev) =>
        prev.map((m) => (m.id === mappingId ? { ...m, approval_status: action } : m))
      );
    } catch (err) {
      console.error("Failed to update ICD mapping:", err);
    } finally {
      setApproving("");
    }
  }

  async function handleTreatmentAction(suggestionId, action) {
    setApproving(`tx-${suggestionId}`);
    try {
      await approveTreatment(token, { suggestionId, action });
      setTreatments((prev) =>
        prev.map((t) => (t.id === suggestionId ? { ...t, approval_status: action } : t))
      );
    } catch (err) {
      console.error("Failed to update treatment:", err);
    } finally {
      setApproving("");
    }
  }

  async function handleApproveSummary() {
    if (!patientSummary) return;
    setApproving("summary");
    try {
      await approvePatientSummary(token, { summaryId: patientSummary.id });
      setPatientSummary((prev) => ({ ...prev, approval_status: "approved" }));
    } catch (err) {
      console.error("Failed to approve summary:", err);
    } finally {
      setApproving("");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/doctor/dashboard")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Post-Session Review</h1>
          <p className="text-muted-foreground">
            {sessionData?.patient_name} &middot;{" "}
            {sessionData?.chief_complaint || "General consultation"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="emr">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="emr">
            <FileText className="w-4 h-4 mr-1.5" />
            EMR Draft
          </TabsTrigger>
          <TabsTrigger value="icd">
            <ClipboardList className="w-4 h-4 mr-1.5" />
            ICD Codes ({icdMappings.length})
          </TabsTrigger>
          <TabsTrigger value="treatments">
            <Pill className="w-4 h-4 mr-1.5" />
            Treatments ({treatments.length})
          </TabsTrigger>
          <TabsTrigger value="summary">
            <Heart className="w-4 h-4 mr-1.5" />
            Patient Summary
          </TabsTrigger>
        </TabsList>

        {/* EMR Draft Tab */}
        <TabsContent value="emr">
          {!emrDraft ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
                <p>AI is still generating the EMR draft...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      EMR Draft v{emrDraft.version}
                      <Badge
                        variant={
                          emrDraft.status === "approved"
                            ? "success"
                            : emrDraft.status === "pending_approval"
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {emrDraft.status}
                      </Badge>
                    </CardTitle>
                    <span className="text-xs text-muted-foreground">
                      Generated by {emrDraft.model_used}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <EMRSection title="Chief Complaint" content={emrDraft.chief_complaint} />
                  <EMRSection title="History of Present Illness" content={emrDraft.history_present_illness} />
                  <EMRSection title="Assessment" content={emrDraft.assessment} />
                  <EMRJsonSection title="Vital Signs" data={emrDraft.vital_signs} />
                  <EMRJsonSection title="Diagnoses" data={emrDraft.diagnoses} />
                  <EMRJsonSection title="Treatment Plan" data={emrDraft.treatment_plan} />
                  <EMRJsonSection title="Medications Prescribed" data={emrDraft.medications_prescribed} />
                  <EMRSection title="Follow-up Plan" content={emrDraft.follow_up_plan} />
                  <EMRSection title="Patient Instructions" content={emrDraft.patient_instructions} />
                  <EMRJsonSection title="Past Medical History" data={emrDraft.past_medical_history} />
                  <EMRJsonSection title="Allergies" data={emrDraft.allergies} />
                  <EMRJsonSection title="Current Medications" data={emrDraft.medications} />
                </CardContent>
              </Card>

              {emrDraft.status !== "approved" && (
                <Card>
                  <CardContent className="py-4 space-y-3">
                    <Textarea
                      placeholder="Review notes (optional)..."
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        onClick={handleApproveEMR}
                        disabled={approving === "emr"}
                        className="gap-2"
                      >
                        {approving === "emr" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        Approve EMR
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* ICD Codes Tab */}
        <TabsContent value="icd">
          <div className="space-y-3">
            {icdMappings.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No ICD codes mapped yet.
                </CardContent>
              </Card>
            ) : (
              icdMappings.map((mapping) => (
                <Card key={mapping.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono">
                            {mapping.icd_code}
                          </Badge>
                          {mapping.is_primary && <Badge variant="default">Primary</Badge>}
                          <Badge
                            variant={
                              mapping.approval_status === "approved"
                                ? "success"
                                : mapping.approval_status === "rejected"
                                ? "destructive"
                                : "warning"
                            }
                          >
                            {mapping.approval_status}
                          </Badge>
                        </div>
                        <p className="font-medium">{mapping.diagnosis_text}</p>
                        <p className="text-sm text-muted-foreground">
                          {mapping.icd_description}
                        </p>
                        {mapping.confidence_score && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Confidence: {(mapping.confidence_score * 100).toFixed(0)}%
                          </p>
                        )}
                      </div>
                      {mapping.approval_status === "pending" && (
                        <div className="flex gap-1 ml-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleIcdAction(mapping.id, "approved")}
                            disabled={approving === `icd-${mapping.id}`}
                          >
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleIcdAction(mapping.id, "rejected")}
                            disabled={approving === `icd-${mapping.id}`}
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Treatments Tab */}
        <TabsContent value="treatments">
          <div className="space-y-3">
            {treatments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No treatment suggestions yet.
                </CardContent>
              </Card>
            ) : (
              treatments.map((tx) => (
                <Card key={tx.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{tx.title}</p>
                          <Badge variant="outline">{tx.suggestion_type}</Badge>
                          <Badge
                            variant={
                              tx.priority === "urgent"
                                ? "destructive"
                                : tx.priority === "recommended"
                                ? "info"
                                : "secondary"
                            }
                          >
                            {tx.priority}
                          </Badge>
                          <Badge
                            variant={
                              tx.approval_status === "approved"
                                ? "success"
                                : tx.approval_status === "rejected"
                                ? "destructive"
                                : "warning"
                            }
                          >
                            {tx.approval_status}
                          </Badge>
                        </div>
                        {tx.description && (
                          <p className="text-sm text-muted-foreground">{tx.description}</p>
                        )}
                        {tx.rationale && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <strong>Rationale:</strong> {tx.rationale}
                          </p>
                        )}
                      </div>
                      {tx.approval_status === "pending" && (
                        <div className="flex gap-1 ml-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleTreatmentAction(tx.id, "approved")}
                            disabled={approving === `tx-${tx.id}`}
                          >
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleTreatmentAction(tx.id, "rejected")}
                            disabled={approving === `tx-${tx.id}`}
                          >
                            <XCircle className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Patient Summary Tab */}
        <TabsContent value="summary">
          {!patientSummary ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Patient summary not generated yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      Patient-Friendly Summary
                      <Badge
                        variant={
                          patientSummary.approval_status === "approved" ? "success" : "warning"
                        }
                      >
                        {patientSummary.approval_status}
                      </Badge>
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <p className="whitespace-pre-wrap">{patientSummary.summary_text}</p>
                  </div>

                  {patientSummary.key_takeaways?.length > 0 && (
                    <div>
                      <p className="font-medium text-sm mb-2">Key Takeaways</p>
                      <ul className="space-y-1">
                        {patientSummary.key_takeaways.map((item, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                            <span>{item.point || item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {patientSummary.medications_list?.length > 0 && (
                    <div>
                      <p className="font-medium text-sm mb-2">Medications</p>
                      <div className="space-y-2">
                        {patientSummary.medications_list.map((med, i) => (
                          <div key={i} className="p-2 rounded bg-muted/50 text-sm">
                            <p className="font-medium">{med.name}</p>
                            {med.what_it_does && (
                              <p className="text-muted-foreground text-xs">{med.what_it_does}</p>
                            )}
                            {med.how_to_take && (
                              <p className="text-xs mt-0.5">{med.how_to_take}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {patientSummary.warnings?.length > 0 && (
                    <div>
                      <p className="font-medium text-sm mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-yellow-500" />
                        Important Warnings
                      </p>
                      {patientSummary.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-sm mb-1"
                        >
                          {w.warning || w}
                        </div>
                      ))}
                    </div>
                  )}

                  {patientSummary.follow_up_notes && (
                    <div>
                      <p className="font-medium text-sm mb-1">Follow-up</p>
                      <p className="text-sm text-muted-foreground">
                        {patientSummary.follow_up_notes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {patientSummary.approval_status !== "approved" && (
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleApproveSummary}
                    disabled={approving === "summary"}
                    className="gap-2"
                  >
                    {approving === "summary" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Approve & Send to Patient
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper components
function EMRSection({ title, content }) {
  if (!content) return null;
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
      <p className="text-sm whitespace-pre-wrap">{content}</p>
      <Separator className="mt-3" />
    </div>
  );
}

function EMRJsonSection({ title, data }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return null;

  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
      {Array.isArray(data) ? (
        <div className="space-y-1.5">
          {data.map((item, i) => (
            <div key={i} className="p-2 rounded bg-muted/50 text-xs">
              {typeof item === "string" ? (
                <p>{item}</p>
              ) : (
                Object.entries(item).map(([key, val]) => (
                  <span key={key} className="mr-3">
                    <strong className="capitalize">{key.replace(/_/g, " ")}:</strong>{" "}
                    {typeof val === "object" ? JSON.stringify(val) : String(val)}
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      ) : typeof data === "object" ? (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(data).map(([key, val]) => (
            <div key={key} className="p-2 rounded bg-muted/50 text-xs">
              <strong className="capitalize">{key.replace(/_/g, " ")}:</strong>{" "}
              {String(val || "—")}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm">{String(data)}</p>
      )}
      <Separator className="mt-3" />
    </div>
  );
}
