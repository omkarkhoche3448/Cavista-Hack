import { useAuth } from "@/features/auth";
import { MOCK_VITALS, MOCK_SUMMARIES } from "../../data/mockData";
import VitalsOverview from "./VitalsOverview";
import CriticalWarnings from "./CriticalWarnings";
import HealthSummaryCard from "./HealthSummaryCard";
import { Activity, FileText } from "lucide-react";

export default function MyHealthPage() {
  const { profile } = useAuth();
  const summaries = MOCK_SUMMARIES;
  const latestSummary = summaries[0];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          My Health
        </h1>
        <p className="text-muted-foreground mt-1">
          Welcome back, {profile?.first_name || "Patient"}. Here&apos;s your health overview.
        </p>
      </div>

      {/* Vitals */}
      <VitalsOverview vitals={MOCK_VITALS} />

      {/* Critical warnings */}
      {latestSummary && (
        <CriticalWarnings warnings={latestSummary.critical_warnings} />
      )}

      {/* Health summaries */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          Health Summaries
        </h2>

        {summaries.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No health summaries yet</p>
            <p className="text-sm">
              Your doctor-approved visit summaries will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {summaries.map((summary, i) => (
              <HealthSummaryCard
                key={summary.id}
                summary={summary}
                isLatest={i === 0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
