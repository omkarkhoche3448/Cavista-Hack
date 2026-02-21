import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FileImage, Pill, FileHeart, Shield, File, Trash2, ExternalLink } from "lucide-react";
import { DOCUMENT_TYPE_LABELS } from "../../data/mockData";
import DocumentStatusBadge from "./DocumentStatusBadge";
import { cn } from "@/lib/utils";
const TYPE_CONFIG = {
  lab_report:        { icon: FileText,  color: "text-blue-500",   bg: "bg-blue-500/10",   border: "border-l-blue-500" },
  imaging:           { icon: FileImage, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-l-purple-500" },
  prescription:      { icon: Pill,      color: "text-emerald-500",bg: "bg-emerald-500/10",border: "border-l-emerald-500" },
  discharge_summary: { icon: FileHeart, color: "text-rose-500",   bg: "bg-rose-500/10",   border: "border-l-rose-500" },
  referral_letter:   { icon: FileText,  color: "text-amber-500",  bg: "bg-amber-500/10",  border: "border-l-amber-500" },
  insurance:         { icon: Shield,    color: "text-cyan-500",   bg: "bg-cyan-500/10",   border: "border-l-cyan-500" },
  other:             { icon: File,      color: "text-slate-400",  bg: "bg-slate-500/10",  border: "border-l-slate-400" },
};

function formatFileSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentCard({ document, onDelete }) {
  const config = TYPE_CONFIG[document.document_type] || TYPE_CONFIG.other;
  const Icon = config.icon;
  const displayName = document.title || document.file_name || document.original_file_name;
  const uploadDate = new Date(document.created_at).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card className={cn("border-l-4 hover:shadow-lg transition-all duration-200 group", config.border)}>
      <CardContent className="flex items-center gap-4 p-4">
        {/* Icon */}
        <div className={cn("rounded-xl p-3 shrink-0", config.bg)}>
          <Icon className={cn("w-6 h-6", config.color)} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-foreground">{displayName}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full border", config.bg, config.color)}>
              {DOCUMENT_TYPE_LABELS[document.document_type] || document.document_type}
            </span>
            <span className="text-xs text-muted-foreground">{formatFileSize(document.file_size_bytes)}</span>
            <span className="text-xs text-muted-foreground">&middot;</span>
            <span className="text-xs text-muted-foreground">{uploadDate}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <DocumentStatusBadge status={document.status} />

          {document.storage_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => window.open(document.storage_url, "_blank", "noopener,noreferrer")}
              title="View document"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onDelete(document.id)}
            title="Delete document"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
