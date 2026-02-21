import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG = {
  uploading: { label: "Uploading", className: "bg-amber-500/10 text-amber-600 border-amber-200 animate-pulse" },
  uploaded: { label: "Uploaded", className: "bg-blue-500/10 text-blue-600 border-blue-200" },
  processing: { label: "Processing", className: "bg-purple-500/10 text-purple-600 border-purple-200 animate-pulse" },
  ready: { label: "Ready", className: "bg-green-500/10 text-green-600 border-green-200" },
  failed: { label: "Failed", className: "bg-red-500/10 text-red-600 border-red-200" },
};

export default function DocumentStatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.uploaded;

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
