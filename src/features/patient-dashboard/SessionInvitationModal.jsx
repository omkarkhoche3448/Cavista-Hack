import { useState } from "react";
import {
    Dialog,
    DialogHeader,
    DialogTitle,
    DialogContent,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stethoscope, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function SessionInvitationModal({ open, onOpenChange, session, onRespond }) {
    const [responding, setResponding] = useState(false);

    if (!session) return null;

    async function handle(action) {
        setResponding(true);
        try {
            await onRespond(session.id, action);
            onOpenChange(false);
        } finally {
            setResponding(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Stethoscope className="w-6 h-6 text-primary" />
                    </div>
                    <DialogTitle className="text-center text-xl">
                        Inbound Session Request
                    </DialogTitle>
                    <div className="flex justify-center gap-2 mt-2">
                        <Badge variant="warning">Awaiting Approval</Badge>
                        {session.is_emergency && <Badge variant="destructive">Emergency</Badge>}
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="text-center space-y-1">
                        <p className="font-semibold text-lg">{session.doctor_name}</p>
                        <p className="text-sm text-muted-foreground">{session.doctor_email}</p>
                    </div>

                    <div className="bg-muted/50 p-4 rounded-lg border border-border">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Chief Complaint
                        </p>
                        <p className="text-sm italic">
                            &quot;{session.chief_complaint || "Routine follow-up / general consultation"}&quot;
                        </p>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        Requested at {new Date(session.created_at).toLocaleTimeString()}
                    </div>
                </div>

                <DialogFooter className="sm:justify-center gap-3 pt-4 border-t">
                    <Button
                        variant="outline"
                        className="w-full sm:w-auto gap-2 border-red-200 text-red-600 hover:bg-red-50"
                        onClick={() => handle("reject")}
                        disabled={responding}
                    >
                        <XCircle className="w-4 h-4" />
                        Decline
                    </Button>
                    <Button
                        className="w-full sm:w-auto gap-2"
                        onClick={() => handle("accept")}
                        disabled={responding}
                    >
                        <CheckCircle className="w-4 h-4" />
                        Accept Request
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
