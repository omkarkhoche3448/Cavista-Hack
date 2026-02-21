import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { listPatients } from "@/services/sessionService";
import { Eye, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_CONFIG = {
  completed:  { label: "Completed",  className: "bg-green-100 text-green-800" },
  active:     { label: "Active",     className: "bg-blue-100 text-blue-800" },
  accepted:   { label: "Accepted",   className: "bg-blue-100 text-blue-800" },
  pending:    { label: "Pending",    className: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  rejected:   { label: "Rejected",   className: "bg-red-100 text-red-800" },
};

export default function AllPatients() {
  const { session: authSession, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const token = authSession?.access_token;

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPatients = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await listPatients(token);
      setPatients(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load patients");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!authLoading) fetchPatients();
  }, [authLoading, fetchPatients]);

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-CA");

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-4xl font-extrabold mb-2 text-gray-900 tracking-tight">Patients</h1>
      <p className="mb-8 text-gray-500 text-lg">Overview of all patients who have had sessions with you.</p>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-2xl shadow-xl border border-gray-100 bg-linear-to-br from-white via-gray-50 to-gray-100">
        <table className="w-full divide-y divide-gray-200">
          <thead className="hidden md:table-header-group">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Patient</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Phone</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Sessions</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Last Visit</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Last Status</th>
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
            ) : patients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 rounded-full bg-gray-100">
                      <Users className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="font-medium">No patients yet</p>
                    <p className="text-sm">Patients will appear here after their first session.</p>
                  </div>
                </td>
              </tr>
            ) : (
              patients.map((patient, idx) => {
                const statusCfg = STATUS_CONFIG[patient.last_session_status] ?? { label: patient.last_session_status, className: "bg-gray-100 text-gray-700" };
                return (
                  <tr
                    key={patient.id}
                    className={`transition-all duration-200 cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50/60`}
                    onClick={() => navigate(`/doctor/patient/${patient.id}`)}
                  >
                    <td className="px-6 py-4 text-base text-gray-900 font-semibold align-middle">
                      {patient.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      {patient.email || "—"}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      {patient.phone || "—"}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                        {patient.session_count}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      {patient.last_session_at ? formatDate(patient.last_session_at) : "—"}
                    </td>
                    <td className="px-6 py-4 align-middle">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${statusCfg.className}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-middle text-center">
                      <button
                        title="View Patient"
                        className="hover:text-blue-600 focus:outline-none transition-colors p-2 rounded-full hover:bg-blue-100"
                        onClick={() => navigate(`/doctor/patient/${patient.id}`)}
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
