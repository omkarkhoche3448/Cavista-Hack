import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG = {
  uploading: { label: "Uploading", className: "bg-muted/50 text-muted-foreground border-border animate-pulse" },
  uploaded: { label: "Uploaded", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800" },
  processing: { label: "Processing", className: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 animate-pulse" },
  ready: { label: "Ready", className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
};

export default function DocumentStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.uploaded;

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
