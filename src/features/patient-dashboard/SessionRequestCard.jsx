import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Stethoscope, Clock } from "lucide-react";

export default function SessionRequestCard({ session, onRespond }) {
  const [responding, setResponding] = useState(false);

  async function handle(action) {
    setResponding(true);
    try {
      await onRespond(session.id, action);
    } finally {
      setResponding(false);
    }
  }

  return (
    <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/10">
      <CardContent className="py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold">{session.doctor_name}</p>
                <Badge variant="warning">New Request</Badge>
                {session.is_emergency && (
                  <Badge variant="destructive">Emergency</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {session.doctor_email} has requested to start a session
              </p>
              {session.chief_complaint && (
                <p className="text-sm mt-1">
                  <strong>Reason:</strong> {session.chief_complaint}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(session.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex gap-2 ml-4">
            <Button
              size="sm"
              onClick={() => handle("accept")}
              disabled={responding}
              className="gap-1"
            >
              <CheckCircle className="w-3 h-3" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handle("reject")}
              disabled={responding}
              className="gap-1"
            >
              <XCircle className="w-3 h-3" />
              Decline
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
