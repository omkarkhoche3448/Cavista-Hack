import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth";
import { listDocuments, deleteDocument } from "@/services/documentService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import FileUploadModal from "@/features/patient-dashboard/FileUploadModal";

const STATUS_BADGE = {
  uploading: { label: "Uploading", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  uploaded: { label: "Uploaded", className: "bg-blue-100 text-blue-700 border-blue-200" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-200" },
  ready: { label: "Ready", className: "bg-green-100 text-green-700 border-green-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-700 border-red-200" },
  deleted: { label: "Deleted", className: "bg-muted text-muted-foreground border-border" },
};

export default function Uploads() {
  const { session: authSession, loading: authLoading } = useAuth();
  const token = authSession?.access_token;

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchDocs = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listDocuments(token);
      setDocs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load documents");
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading) fetchDocs();
  }, [authLoading, fetchDocs]);

  const sortedDocs = useMemo(() => {
    return [...docs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }, [docs]);

  async function handleDelete(doc) {
    if (!token) return;
    const ok = confirm(`Delete "${doc.title || doc.file_name}"? This will hide it from your records.`);
    if (!ok) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(token, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err.message || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function handleUploaded(doc) {
    setDocs((prev) => [doc, ...prev]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Your Uploads</h1>
          <p className="text-muted-foreground mt-1">Upload and manage your medical documents for sharing during sessions.</p>
        </div>
        <Button onClick={() => setShowUpload(true)} className="gap-2 rounded-full">
          <Plus className="w-4 h-4" />
          Upload
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="shadow-card">
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-2/3" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-24" />
              </CardContent>
            </Card>
          ))
        ) : sortedDocs.length === 0 ? (
          <Card className="md:col-span-2">
            <CardContent className="py-16 text-center text-muted-foreground space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <p className="font-semibold">No documents yet</p>
              <p className="text-sm">Upload a lab report, prescription, or any record to get started.</p>
              <Button onClick={() => setShowUpload(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Upload document
              </Button>
            </CardContent>
          </Card>
        ) : (
          sortedDocs.map((doc) => {
            const status = STATUS_BADGE[doc.status] ?? { label: doc.status || "—", className: "bg-muted text-muted-foreground border-border" };
            return (
              <Card key={doc.id} className="shadow-card hover:shadow-card-lg transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base truncate">{doc.title || doc.file_name || "Untitled"}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {(doc.document_type || "other").replaceAll("_", " ")} • {doc.created_at ? new Date(doc.created_at).toLocaleString() : "—"}
                      </p>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${status.className}`}>
                      {status.label}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {doc.analysis_result?.summary && (
                    <div className="p-3 rounded-lg bg-muted/30 border">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">AI Summary</p>
                      <p className="text-sm text-foreground line-clamp-3">{doc.analysis_result.summary}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {doc.storage_url ? (
                        <a
                          href={doc.storage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          View file
                        </a>
                      ) : (
                        <Badge variant="outline" className="text-xs">No link yet</Badge>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      title="Delete"
                    >
                      {deletingId === doc.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <FileUploadModal open={showUpload} onOpenChange={setShowUpload} onUploaded={handleUploaded} />
    </div>
  );
}
