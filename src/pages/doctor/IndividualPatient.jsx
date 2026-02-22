import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth";
import { listSessions, getPatient } from "@/services/sessionService";
import {
  Eye, User, ArrowLeft, Activity,
  Phone, Mail, Droplet, Ruler, Weight,
  ShieldCheck, AlertCircle, Heart, FileText,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_CONFIG = {
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  active: { label: "Active", className: "bg-blue-100 text-blue-800" },
  accepted: { label: "Accepted", className: "bg-blue-100 text-blue-800" },
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  ended: { label: "Ended", className: "bg-gray-100 text-gray-700" },
};

function InfoTag({ icon, label, value, color = "bg-gray-100 text-gray-700" }) {
  if (!value) return null;
  const Icon = icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${color}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 mr-0.5">{label}</span>
      {value}
    </span>
  );
}

function calcAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

export default function IndividualPatient() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { session: authSession, loading: authLoading } = useAuth();
  const token = authSession?.access_token;

  const [patient, setPatient] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [patientResult, sessionsResult] = await Promise.allSettled([
        getPatient(token, patientId),
        listSessions(token),
      ]);

      if (patientResult.status === "fulfilled") {
        setPatient(patientResult.value);
      } else {
        console.error("Failed to load patient profile:", patientResult.reason);
      }

      if (sessionsResult.status === "fulfilled") {
        const data = sessionsResult.value;
        const sessionsArray = Array.isArray(data) ? data : (data?.sessions || []);
        setSessions(
          sessionsArray.filter(
            (s) => s.patient_id === patientId
          )
        );
        setError(null);
      } else {
        setError(sessionsResult.reason?.message || "Failed to load sessions");
      }
    } finally {
      setLoading(false);
    }
  }, [token, patientId]);

  useEffect(() => {
    if (!authLoading) fetchData();
  }, [authLoading, fetchData]);

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString("en-CA");
  const formatTime = (dateStr) =>
    new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const formatId = (id) => `S${String(id).slice(0, 3).toUpperCase()}`;

  const age = calcAge(patient?.date_of_birth);
  const gender = patient?.gender
    ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1).replace(/_/g, " ")
    : null;

  return (
    <div className="max-w-6xl mx-auto">
      <button
        onClick={() => navigate("/doctor/patients")}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6 transition-colors text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Patients
      </button>

      {/* Patient Header Card */}
      <div className="mb-6 p-6 rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Name + session count */}
            <div className="flex items-start justify-between gap-4">
              <div>
                {loading ? (
                  <Skeleton className="h-8 w-48 rounded mb-2" />
                ) : (
                  <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                    {patient?.name ?? "Patient"}
                  </h1>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                  {patient?.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> {patient.email}
                    </span>
                  )}
                  {patient?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> {patient.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Total Sessions</p>
                <p className="text-3xl font-extrabold text-primary">{loading ? "—" : sessions.length}</p>
              </div>
            </div>

            {/* Info Tags */}
            {!loading && (
              <div className="flex flex-wrap gap-2 mt-4">
                {age && (
                  <InfoTag icon={User} label="Age" value={`${age} yrs`} color="bg-blue-50 text-blue-700" />
                )}
                {gender && (
                  <InfoTag icon={Heart} label="Gender" value={gender} color="bg-pink-50 text-pink-700" />
                )}
                {patient?.blood_type && (
                  <InfoTag icon={Droplet} label="Blood" value={patient.blood_type} color="bg-red-50 text-red-700" />
                )}
                {patient?.height_cm && (
                  <InfoTag icon={Ruler} label="Height" value={`${patient.height_cm} cm`} color="bg-green-50 text-green-700" />
                )}
                {patient?.weight_kg && (
                  <InfoTag icon={Weight} label="Weight" value={`${patient.weight_kg} kg`} color="bg-gray-50 text-gray-600" />
                )}
                {patient?.mrn && (
                  <InfoTag icon={FileText} label="MRN" value={patient.mrn} color="bg-purple-50 text-purple-700" />
                )}
                {patient?.insurance_provider && (
                  <InfoTag icon={ShieldCheck} label="Insurance" value={patient.insurance_provider} color="bg-teal-50 text-teal-700" />
                )}
                {patient?.emergency_contact_name && (
                  <InfoTag
                    icon={AlertCircle}
                    label="Emergency"
                    value={`${patient.emergency_contact_name}${patient.emergency_contact_phone ? ` · ${patient.emergency_contact_phone}` : ""}`}
                    color="bg-yellow-50 text-yellow-700"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <h2 className="text-xl font-bold text-gray-900 mb-4">Session History</h2>

      <div className="rounded-2xl shadow-xl border border-gray-100 bg-linear-to-br from-white via-gray-50 to-gray-100">
        <table className="w-full divide-y divide-gray-200">
          <thead className="hidden md:table-header-group">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Session ID</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Chief Complaint</th>
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
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-6 py-4">
                      <Skeleton className="h-4 w-full rounded" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-gray-400">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 rounded-full bg-gray-100">
                      <Activity className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="font-medium">No sessions found</p>
                    <p className="text-sm">No sessions with this patient yet.</p>
                  </div>
                </td>
              </tr>
            ) : (
              sessions.map((session, idx) => {
                const statusCfg = STATUS_CONFIG[session.status] ?? { label: session.status, className: "bg-gray-100 text-gray-700" };
                return (
                  <tr
                    key={session.id}
                    className={`transition-all duration-200 cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50/60`}
                    onClick={() => navigate(
                      ['completed', 'ended'].includes(session.status)
                        ? `/doctor/session-details/${session.id}`
                        : `/doctor/session/${session.id}`
                    )}
                  >
                    <td className="px-6 py-4 text-base text-gray-900 font-semibold align-middle">
                      {formatId(session.id)}
                    </td>
                    <td className="px-6 py-4 text-base text-gray-700 align-middle">
                      {session.chief_complaint || "—"}
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
                        title="View Session"
                        className="hover:text-blue-600 focus:outline-none transition-colors p-2 rounded-full hover:bg-blue-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            ['completed', 'ended'].includes(session.status)
                              ? `/doctor/session-details/${session.id}`
                              : `/doctor/session/${session.id}`
                          );
                        }}
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
