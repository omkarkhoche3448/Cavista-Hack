import { useState } from "react";
import { Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Dummy data for demonstration
const sessionsData = [
    {
        id: "S001",
        patient: "John Doe",
        email: "john.doe@example.com",
        date: "2026-02-20",
        time: "10:00 AM",
        status: "Completed",
    },
    {
        id: "S002",
        patient: "Jane Smith",
        email: "jane.smith@example.com",
        date: "2026-02-21",
        time: "11:30 AM",
        status: "Scheduled",
    },
    {
        id: "S003",
        patient: "Alex Brown",
        email: "alex.brown@example.com",
        date: "2026-02-22",
        time: "09:15 AM",
        status: "Cancelled",
    },
];

const statusColors = {
    Completed: "bg-green-100 text-green-800",
    Scheduled: "bg-blue-100 text-blue-800",
    Cancelled: "bg-red-100 text-red-800",
};

export default function AllSessions() {
    const [sessions] = useState(sessionsData);
    const navigate = useNavigate();

    return (
        <div className="max-w-5xl mx-auto p-6">
            <h1 className="text-4xl font-extrabold mb-2 text-gray-900 tracking-tight">Patient Sessions</h1>
            <p className="mb-8 text-gray-500 text-lg">Overview of all your recent and upcoming patient sessions.</p>
            <div className="rounded-2xl shadow-xl border border-gray-100 bg-gradient-to-br from-white via-gray-50 to-gray-100">
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
                        {sessions.map((session, idx) => (
                            <tr
                                key={session.id}
                                className={`transition-all duration-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50/60`}
                            >
                                <td className="px-6 py-4 text-base text-gray-900 font-semibold align-middle text-left">
                                    {session.id}
                                </td>
                                <td className="px-6 py-4 text-base text-gray-800 align-middle text-left">
                                    {session.patient}
                                </td>
                                <td className="px-6 py-4 text-base text-gray-700 align-middle text-left">
                                    {session.email}
                                </td>
                                <td className="px-6 py-4 text-base text-gray-700 align-middle text-left">
                                    {session.date}
                                </td>
                                <td className="px-6 py-4 text-base text-gray-700 align-middle text-left">
                                    {session.time}
                                </td>
                                <td className="px-6 py-4 align-middle text-left">
                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${statusColors[session.status]}`}>{session.status}</span>
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
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}