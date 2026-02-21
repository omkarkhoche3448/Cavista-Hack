import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import DefaultLayout from "./components/layout/DefaultLayout";
import {
  LoginPage,
  SignupPage,
  AuthCallback,
  ProtectedRoute,
  RoleRoute,
} from "@/features/auth";
import RoleRedirect from "./features/auth/RoleRedirect";
import { DoctorDashboard, SessionPage, PostSessionReview } from "@/features/doctor-dashboard";
import { PatientDashboard, PatientSessionPage } from "@/features/patient-dashboard";
import PatientDashboardLayout from "@/features/patient-dashboard/components/PatientDashboardLayout";
import MyHealthPage from "@/features/patient-dashboard/components/health/MyHealthPage";
import MyDocumentsPage from "@/features/patient-dashboard/components/documents/MyDocumentsPage";

export default function AppRouter() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/home" element={<DefaultLayout><Home /></DefaultLayout>} />
      <Route path="/login" element={<DefaultLayout><LoginPage /></DefaultLayout>} />
      <Route path="/signup" element={<DefaultLayout><SignupPage /></DefaultLayout>} />
      <Route path="/auth/callback" element={<DefaultLayout><AuthCallback /></DefaultLayout>} />

      {/* Doctor dashboard */}
      <Route
        path="/doctor/dashboard"
        element={
          <DefaultLayout>
            <ProtectedRoute>
              <RoleRoute allowedRole="doctor">
                <DoctorDashboard />
              </RoleRoute>
            </ProtectedRoute>
          </DefaultLayout>
        }
      />

      {/* Patient dashboard — nested with sidebar */}
      <Route
        path="/patient"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRole="patient">
              <PatientDashboardLayout />
            </RoleRoute>
          </ProtectedRoute>
        }
      >
        <Route path="dashboard" element={<MyHealthPage />} />
        <Route path="health" element={<MyHealthPage />} />
        <Route path="documents" element={<MyDocumentsPage />} />
        <Route index element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Generic dashboard redirect */}
      <Route
        path="/doctor/session/:sessionId"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRole="doctor">
              <SessionPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/doctor/review/:sessionId"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRole="doctor">
              <PostSessionReview />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/patient/session/:sessionId"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRole="patient">
              <PatientSessionPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <RoleRedirect />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
