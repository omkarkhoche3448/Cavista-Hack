import { useState } from "react";
import { MOCK_DOCUMENTS, DOCUMENT_TYPE_LABELS } from "../../data/mockData";
import DocumentUpload from "./DocumentUpload";
import DocumentCard from "./DocumentCard";
import { FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";

export default function MyDocumentsPage() {
  const [documents, setDocuments] = useState(MOCK_DOCUMENTS);

  function handleUpload(file, documentType) {
    const newDoc = {
      id: `doc-${Date.now()}`,
      patient_id: "u-001",
      document_type: documentType,
      original_file_name: file.name,
      status: "uploaded",
      file_size_bytes: file.size,
      mime_type: file.type,
      version: 1,
      created_at: new Date().toISOString(),
    };

    setDocuments((prev) => [newDoc, ...prev]);
    toast.success("Document uploaded", {
      description: `${file.name} has been uploaded as ${DOCUMENT_TYPE_LABELS[documentType]}.`,
    });
  }

  function handleDelete(id) {
    const doc = documents.find((d) => d.id === id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    toast.success("Document removed", {
      description: doc ? `${doc.original_file_name} has been removed.` : "Document removed.",
    });
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
