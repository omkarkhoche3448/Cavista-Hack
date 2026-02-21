import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export default function CriticalWarnings({ warnings }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Important Warnings</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-1">
          {warnings.map((w, i) => (
            <li key={i} className="text-sm">{w}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
