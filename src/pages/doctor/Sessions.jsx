import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { listSessions } from "@/services/sessionService";
import { Eye, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_CONFIG = {
  completed:  { label: "Completed",  className: "bg-green-100 text-green-800" },
  active:     { label: "Active",     className: "bg-blue-100 text-blue-800" },
  accepted:   { label: "Accepted",   className: "bg-blue-100 text-blue-800" },
  pending:    { label: "Pending",    className: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  rejected:   { label: "Rejected",   className: "bg-red-100 text-red-800" },
};

export default function AllSessions() {
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

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-CA");
  const formatTime = (dateStr) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formatId = (id) => `S${String(id).slice(0, 3).toUpperCase()}`;

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-4xl font-extrabold mb-2 text-gray-900 tracking-tight">Patient Sessions</h1>
      <p className="mb-8 text-gray-500 text-lg">Overview of all your recent and upcoming patient sessions.</p>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl shadow-xl border border-gray-100 bg-linear-to-br from-white via-gray-50 to-gray-100">
        <table className="w-full divide-y divide-gray-200">
          <thead className="hidden md:table-header-group">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Session ID</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Patient</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Date</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Time</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-6 py-4">
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 rounded-full bg-gray-100">
                      <Activity className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="font-medium">No sessions yet</p>
                    <p className="text-sm">Create a session from the dashboard to get started.</p>
                  </div>
                </td>
              </tr>
            ) : (
              sessions.map((session, idx) => {
                const statusCfg = STATUS_CONFIG[session.status] ?? { label: session.status, className: "bg-gray-100 text-gray-700" };
                return (
                  <tr
                    key={session.id}
                    className={`transition-all duration-200 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50/60`}
                  >
                    <td className="px-6 py-4 text-base text-gray-900 font-semibold align-middle">
                      {formatId(session.id)}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-800 align-middle">
                      {session.patient_name ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      {session.patient_email ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      {session.created_at ? formatDate(session.created_at) : "—"}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      {session.created_at ? formatTime(session.created_at) : "—"}
                    </td>
                    <td className="px-6 py-4 align-middle">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-middle text-center">
                      <button
                        title="View Details"
                        className="hover:text-blue-600 focus:outline-none transition-colors p-2 rounded-full hover:bg-blue-100"
                        onClick={() => navigate(`/doctor/session/${session.id}`)}
                      >
                        <Eye className="w-6 h-6" />
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
