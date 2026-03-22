import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import DefaultLayout from "./components/layout/DefaultLayout";
import {
  LoginPage,
  SignupPage,
  AuthCallback,
  ProtectedRoute,
  GuestRoute,
  RoleRoute,
  useAuth,
} from "@/features/auth";
import RoleRedirect from "./features/auth/RoleRedirect";
import DoctorCall from "./pages/doctor/DoctorCallPage.jsx";
import DoctorDashboard from "./pages/doctor/DoctorDashboard.jsx";
import AllSessions from "./pages/doctor/Sessions.jsx";
import AllPatients from "./pages/doctor/Patients.jsx";
import IndividualPatient from "./pages/doctor/IndividualPatient.jsx";
import PostSessionReview from "./pages/doctor/ReviewSession.jsx";
import DoctorProfile from "./pages/doctor/DoctorProfilePage.jsx";
import PatientDashboard from "./pages/patient/PatientDashboard.jsx";
import PatientProfile from "./pages/patient/PatientProfilePage.jsx";
import Home from "./pages/Home.jsx";
import IndividualSession from "./pages/doctor/IndividualSession";
import SessionDetails from "./pages/doctor/SessionDetails";
import PatientSessionPage from "./pages/patient/PatientSessionPage";
import PatientCall from "./pages/patient/PatientCallPage.jsx";
import Uploads from "./pages/patient/Uploads";
import PatientAllSessions from "./pages/patient/Sessions.jsx";
import Onboarding from "./pages/patient/Onboarding.jsx";
const ProtectedDoctorRoute = ({ children }) => (
  <ProtectedRoute>
    <RoleRoute allowedRole="doctor">{children}</RoleRoute>
  </ProtectedRoute>
);

const ProtectedPatientRoute = ({ children }) => {
  const { profile, role, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (
    isAuthenticated &&
    role === "patient" &&
    profile?.status !== "active" &&
    location.pathname !== "/patient/onboarding"
  ) {
    return <Navigate to="/patient/onboarding" replace />;
  }

  return (
    <ProtectedRoute>
      <RoleRoute allowedRole="patient">{children}</RoleRoute>
    </ProtectedRoute>
  );
};

export default function AppRouter() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<Home />} />
      <Route path="/login" element={<DefaultLayout><GuestRoute><LoginPage /></GuestRoute></DefaultLayout>} />
      <Route path="/signup" element={<DefaultLayout><GuestRoute><SignupPage /></GuestRoute></DefaultLayout>} />
      <Route path="/auth/callback" element={<DefaultLayout><AuthCallback /></DefaultLayout>} />

      {/* Doctor Routes */}
      <Route
        path="/doctor/dashboard"
        element={
          <DefaultLayout>
            <ProtectedDoctorRoute>
              <DoctorDashboard />
            </ProtectedDoctorRoute>
          </DefaultLayout>
        }
      />
      <Route
        path='/doctor/call/:sessionId'
        element={
          <DefaultLayout>
            <ProtectedDoctorRoute>
              <DoctorCall />
            </ProtectedDoctorRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/doctor/sessions"
        element={
          <DefaultLayout>
            <ProtectedDoctorRoute>
              <AllSessions />
            </ProtectedDoctorRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/doctor/patients"
        element={
          <DefaultLayout>
            <ProtectedDoctorRoute>
              <AllPatients />
            </ProtectedDoctorRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/doctor/session/:sessionId"
        element={
          <ProtectedDoctorRoute>
            <IndividualSession />
          </ProtectedDoctorRoute>
        }
      />
      <Route
        path="/doctor/patient/:patientId"
        element={
          <DefaultLayout>
            <ProtectedDoctorRoute>
              <IndividualPatient />
            </ProtectedDoctorRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/doctor/session-details/:sessionId"
        element={
          <ProtectedDoctorRoute>
            <SessionDetails />
          </ProtectedDoctorRoute>
        }
      />
      <Route
        path="/doctor/review/:sessionId"
        element={
          <ProtectedDoctorRoute>
            <PostSessionReview />
          </ProtectedDoctorRoute>
        }
      />
      <Route
        path="/doctor/profile"
        element={
          <ProtectedDoctorRoute>
            <DoctorProfile />
          </ProtectedDoctorRoute>
        }
      />
      {/* Patient Routes */}
      <Route path="/patient" element={<Navigate to="/patient/dashboard" replace />} />

      <Route
        path="/patient/dashboard"
        element={
          <DefaultLayout>
            <ProtectedPatientRoute>
              <PatientDashboard />
            </ProtectedPatientRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/patient/call/:sessionId"
        element={
          <DefaultLayout>
            <ProtectedPatientRoute>
              <PatientCall />
            </ProtectedPatientRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/patient/sessions"
        element={
          <DefaultLayout>
            <ProtectedPatientRoute>
              <PatientAllSessions />
            </ProtectedPatientRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/patient/session/:sessionId"
        element={
          <DefaultLayout>
            <ProtectedPatientRoute>
              <PatientSessionPage />
            </ProtectedPatientRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/patient/uploads"
        element={
          <DefaultLayout>
            <ProtectedPatientRoute>
              <Uploads />
            </ProtectedPatientRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/patient/profile"
        element={
          <DefaultLayout>
            <ProtectedPatientRoute>
              <PatientProfile />
            </ProtectedPatientRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/patient/onboarding"
        element={
          <DefaultLayout>
            <ProtectedPatientRoute>
              <Onboarding />
            </ProtectedPatientRoute>
          </DefaultLayout>
        }
      />

      {/* Dashboard Redirect */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <RoleRedirect />
          </ProtectedRoute>
        }
      />
      <Route index element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
}
