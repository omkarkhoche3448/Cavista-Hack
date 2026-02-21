import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stethoscope, CalendarClock, CheckCircle2 } from "lucide-react";
import MedicationsList from "./MedicationsList";

export default function HealthSummaryCard({ summary, isLatest = false }) {
  const sessionDate = new Date(summary.session_date).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className={isLatest ? "border-primary/30 shadow-md" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Stethoscope className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{summary.doctor_name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {summary.doctor_specialty} &middot; {sessionDate}
              </p>
            </div>
          </div>
          {isLatest && <Badge variant="default">Latest Visit</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary text */}
        <p className="text-sm leading-relaxed">{summary.plain_text}</p>

        {/* Key takeaways */}
        {summary.key_takeaways?.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Key Takeaways</h4>
            <ul className="space-y-1.5">
              {summary.key_takeaways.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Medications */}
        <MedicationsList medications={summary.medications} />

        {/* Follow-up */}
        {summary.follow_up_date && (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
            <CalendarClock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">
                Follow-up:{" "}
                {new Date(summary.follow_up_date).toLocaleDateString("en-IN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              {summary.follow_up_notes && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {summary.follow_up_notes}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
