import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FileImage, Pill, FileHeart, Shield, File, Trash2, Eye } from "lucide-react";
import { DOCUMENT_TYPE_LABELS } from "../../data/mockData";
import DocumentStatusBadge from "./DocumentStatusBadge";

const TYPE_ICONS = {
  lab_report: FileText,
  imaging: FileImage,
  prescription: Pill,
  discharge_summary: FileHeart,
  referral_letter: FileText,
  insurance: Shield,
  other: File,
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentCard({ document, onDelete }) {
  const Icon = TYPE_ICONS[document.document_type] || File;
  const uploadDate = new Date(document.created_at).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{document.original_file_name}</p>
          <p className="text-xs text-muted-foreground">
            {DOCUMENT_TYPE_LABELS[document.document_type]} &middot;{" "}
            {formatFileSize(document.file_size_bytes)} &middot; {uploadDate}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <DocumentStatusBadge status={document.status} />
          {document.status === "ready" && (
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Eye className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(document.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
