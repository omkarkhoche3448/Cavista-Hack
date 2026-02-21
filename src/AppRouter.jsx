import { Routes, Route, Navigate } from "react-router-dom";
import DefaultLayout from "./components/layout/DefaultLayout";
import {
  LoginPage,
  SignupPage,
  AuthCallback,
  ProtectedRoute,
  GuestRoute,
  RoleRoute,
} from "@/features/auth";
import RoleRedirect from "./features/auth/RoleRedirect";
import DoctorCall from "./pages/doctor/DoctorCallPage";
import DoctorDashboard from "./pages/doctor/DoctorDashboard.jsx";
import DoctorSessions from "./pages/doctor/DoctorSessions.jsx";
import IndividualPatient from "./pages/doctor/IndividualPatient.jsx";
import PostSessionReview from "./pages/doctor/ReviewSession.jsx";
import DoctorProfile from "./pages/doctor/DoctorProfilePage.jsx";
import PatientDashboard from "./pages/patient/PatientDashboard.jsx";
import PatientProfile from "./pages/patient/PatientProfilePage.jsx";  
import Home from "./pages/Home.jsx";
import IndividualSession from "./pages/doctor/IndividualSession";
import IndividualSessionSummary from "./pages/patient/IndividualSession";
import PatientCall from "./pages/patient/PatientCallPage.jsx";
import DoctorPatients from "./pages/doctor/DoctorPatients.jsx";
import Uploads from "./pages/patient/Uploads";

const ProtectedDoctorRoute = ({ children }) => (
  <ProtectedRoute>
    <RoleRoute allowedRole="doctor">{children}</RoleRoute>
  </ProtectedRoute>
);

const ProtectedPatientRoute = ({ children }) => (
  <ProtectedRoute>
    <RoleRoute allowedRole="patient">{children}</RoleRoute>
  </ProtectedRoute>
);

export default function AppRouter() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<DefaultLayout><Home /></DefaultLayout>} />
      <Route path="/login" element={<DefaultLayout><GuestRoute><LoginPage /></GuestRoute></DefaultLayout>} />
      <Route path="/signup" element={<DefaultLayout><GuestRoute><SignupPage /></GuestRoute></DefaultLayout>} />
      <Route path="/auth/callback" element={<DefaultLayout><AuthCallback /></DefaultLayout>} />

      {/* Doctor Routes */}
      <Route
        path="/doctor"
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
              <DoctorSessions />
            </ProtectedDoctorRoute>
          </DefaultLayout>
        }
      />
      <Route
        path="/doctor/patients"
        element={
          <DefaultLayout>
            <ProtectedDoctorRoute>
              <DoctorPatients />
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
          <ProtectedDoctorRoute>
            <IndividualPatient />
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
      {/* Patient Routes
      <Route
        path="/patient"
        element={
          <ProtectedPatientRoute>
            <PatientDashboardLayout />
          </ProtectedPatientRoute>
        }
      > */}

      <Route
        path="/patient"
        element={
          <ProtectedPatientRoute>
            <PatientDashboard />
          </ProtectedPatientRoute>
        }
      />
      <Route
        path="/patient/call/:sessionId"
        element={
          <ProtectedPatientRoute>
            <PatientCall />
          </ProtectedPatientRoute>
        }
      />
      <Route
        path="/patient/sessions"
        element={
          <ProtectedPatientRoute>
            <PatientSessions />
          </ProtectedPatientRoute>
        }
      />
      <Route
        path="/patient/session/:sessionId"
        element={
          <ProtectedPatientRoute>
            <IndividualSessionSummary />
          </ProtectedPatientRoute>
        }
      />
      <Route
        path="/patient/uploads"
        element={
          <ProtectedPatientRoute>
            <Uploads />
          </ProtectedPatientRoute>
        }
      />
      <Route
        path="/patient/profile"
        element={
          <ProtectedPatientRoute>
            <PatientProfile />
          </ProtectedPatientRoute>
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