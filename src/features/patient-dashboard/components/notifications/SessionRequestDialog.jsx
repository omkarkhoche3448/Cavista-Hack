import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Stethoscope, AlertTriangle, Video } from "lucide-react";
import { toast } from "sonner";

export default function SessionRequestDialog({ session, open, onRespond, onClose }) {
  function handleAccept() {
    onRespond("accept");
    toast.success("Session accepted", {
      description: `Connecting with ${session.doctor_name}...`,
    });
  }

  function handleReject() {
    onRespond("reject");
    toast.info("Session declined");
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Session Request
          </DialogTitle>
          <DialogDescription>
            A doctor wants to start a consultation with you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Doctor info */}
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {session.doctor_name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{session.doctor_name}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5" />
                {session.doctor_specialty}
              </p>
            </div>
            {session.is_emergency && (
              <Badge variant="destructive" className="ml-auto">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Emergency
              </Badge>
            )}
          </div>

          {/* Reason */}
          {session.chief_complaint && (
            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Reason</p>
              <p className="text-sm">{session.chief_complaint}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleReject} className="flex-1">
            Decline
          </Button>
          <Button onClick={handleAccept} className="flex-1">
            <Video className="w-4 h-4 mr-2" />
            Accept & Join
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
