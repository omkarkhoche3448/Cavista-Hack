import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/features/auth";
import { createSession } from "@/services/sessionService";

export default function CreateSessionModal({ open, onOpenChange, onCreated }) {
  const { session } = useAuth();
  const [patientEmail, setPatientEmail] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!patientEmail.trim()) return;

    setLoading(true);
    setError("");

    try {
      const result = await createSession(session.access_token, {
        patientEmail: patientEmail.trim(),
        chiefComplaint: chiefComplaint.trim() || null,
        isEmergency,
      });
      onCreated?.(result);
      onOpenChange(false);
      setPatientEmail("");
      setChiefComplaint("");
      setIsEmergency(false);
    } catch (err) {
      setError(err.message || "Failed to create session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogClose onClose={() => onOpenChange(false)} />
      <DialogHeader>
        <DialogTitle>Start New Session</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="patient-email">Patient Email</Label>
            <Input
              id="patient-email"
              type="email"
              placeholder="patient@example.com"
              value={patientEmail}
              onChange={(e) => setPatientEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="chief-complaint">Chief Complaint (optional)</Label>
            <Textarea
              id="chief-complaint"
              placeholder="Brief description of the reason for visit..."
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="emergency"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              className="rounded border-input"
            />
            <Label htmlFor="emergency" className="text-sm font-normal">
              Mark as emergency
            </Label>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
              {error}
            </p>
          )}

          <DialogFooter className="px-0 pb-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !patientEmail.trim()}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
