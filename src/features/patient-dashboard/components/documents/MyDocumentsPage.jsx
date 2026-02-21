import { useState, useEffect } from "react";
import { DOCUMENT_TYPE_LABELS } from "../../data/mockData";
import DocumentUpload from "./DocumentUpload";
import DocumentCard from "./DocumentCard";
import { FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { uploadDocument, listDocuments, deleteDocument } from "@/services/documentService";

export default function MyDocumentsPage() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listDocuments(token)
      .then(data => { if (!cancelled) setDocuments(Array.isArray(data) ? data : []); })
      .catch(err => console.error("[MyDocumentsPage] Failed to fetch documents:", err));
    return () => { cancelled = true; };
  }, [token]);

  async function handleUpload(file, documentType) {
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    try {
      const newDoc = await uploadDocument(token, {
        file,
        title: file.name,
        documentType,
      });
      setDocuments((prev) => [newDoc, ...prev]);
      toast.success("Document uploaded", {
        description: `${file.name} has been uploaded as ${DOCUMENT_TYPE_LABELS[documentType]}.`,
      });
    } catch (err) {
      toast.error("Upload failed", { description: err.message });
      throw err;
    }
  }

  async function handleDelete(id) {
    const doc = documents.find((d) => d.id === id);
    try {
      await deleteDocument(token, id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      toast.success("Document removed", {
        description: doc ? `${doc.title || doc.file_name} has been removed.` : "Document removed.",
      });
    } catch (err) {
      toast.error("Delete failed", { description: err.message });
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Premium Page Header */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-secondary/5 border border-primary/20 animate-in fade-in duration-500">
        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 -mr-8 -mt-8">
          <FolderOpen className="w-48 h-48 text-primary" />
        </div>

        <div className="relative">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <FolderOpen className="w-10 h-10 text-primary" />
            My Documents
          </h1>
          <p className="text-muted-foreground font-medium mt-2 max-w-xl">
            Securely store and manage your lab reports, prescriptions, and imaging files in one centralized location.
          </p>
        </div>
      </div>

      {/* Upload area */}
      <DocumentUpload onUpload={handleUpload} />

      {/* Documents list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Uploaded Documents
          <span className="text-sm font-normal text-muted-foreground">
            ({documents.length})
          </span>
        </h2>

        {documents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No documents yet</p>
            <p className="text-sm">
              Upload your medical documents above to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
