import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { listSessions } from "@/services/sessionService";
import { Eye, Clock, CheckCircle, XCircle, Activity, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_CONFIG = {
  completed:  { label: "Completed",  className: "bg-green-100 text-green-700 border-green-200" },
  active:     { label: "Active",     className: "bg-primary/10 text-primary border-primary/20" },
  accepted:   { label: "Accepted",   className: "bg-blue-100 text-blue-700 border-blue-200" },
  pending:    { label: "Pending",    className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-700 border-blue-200" },
  rejected:   { label: "Rejected",   className: "bg-red-100 text-red-700 border-red-200" },
};

export default function PatientAllSessions() {
  const { session: authSession, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const token = authSession?.access_token;

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSessions = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await listSessions(token);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load sessions");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading) fetchSessions();
  }, [authLoading, fetchSessions]);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
  };

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatSessionId = (id) =>
    `S${String(id).slice(0, 4).toUpperCase()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Patient Sessions</h1>
        <p className="text-muted-foreground mt-1">Overview of all your recent and upcoming patient sessions.</p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl border bg-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-5 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Session ID</th>
              <th className="px-5 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patient</th>
              <th className="px-5 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
              <th className="px-5 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
              <th className="px-5 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
              <th className="px-5 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-5 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-5 py-4">
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 rounded-full bg-muted">
                      <Activity className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium">No sessions found</p>
                    <p className="text-xs">Your sessions will appear here once scheduled.</p>
                  </div>
                </td>
              </tr>
            ) : (
              sessions.map((session) => {
                const statusCfg = STATUS_CONFIG[session.status] ?? { label: session.status, className: "bg-muted text-muted-foreground" };
                return (
                  <tr
                    key={session.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-4 font-bold text-foreground">
                      {formatSessionId(session.id)}
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {session.patient_name ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-primary">
                      {session.patient_email ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {session.created_at ? formatDate(session.created_at) : "—"}
                    </td>
                    <td className="px-5 py-4 text-foreground">
                      {session.created_at ? formatTime(session.created_at) : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => navigate(`/patient/session/${session.id}`)}
                        className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="View session"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
