import { MOCK_VITALS, MOCK_SUMMARIES } from "../../data/mockData";
import VitalsOverview from "./VitalsOverview";
import CriticalWarnings from "./CriticalWarnings";
import HealthSummaryCard from "./HealthSummaryCard";
import { Activity, FileText } from "lucide-react";

export default function MyHealthPage() {
  const summaries = MOCK_SUMMARIES;
  const latestSummary = summaries[0];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Premium Page Header */}
      <div className="relative overflow-hidden p-8 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-secondary/5 border border-primary/20 animate-in fade-in duration-500">
        <div className="absolute top-0 right-0 p-4 opacity-10 rotate-12 -mr-8 -mt-8">
          <Activity className="w-48 h-48 text-primary" />
        </div>

        <div className="relative">
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Activity className="w-10 h-10 text-primary" />
            My Health
          </h1>
          <p className="text-muted-foreground font-medium mt-2 max-w-xl">
            Track your vitals, review AI-powered health summaries, and stay informed about your well-being.
          </p>
        </div>
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
