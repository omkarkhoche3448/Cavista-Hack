import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import {
  LoginPage,
  SignupPage,
  AuthCallback,
  ProtectedRoute,
  RoleRoute,
} from "@/features/auth";
import RoleRedirect from "./features/auth/RoleRedirect";
import { DoctorDashboard } from "@/features/doctor-dashboard";
import { PatientDashboard } from "@/features/patient-dashboard";

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route
        path="/doctor/dashboard"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRole="doctor">
              <DoctorDashboard />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/patient/dashboard"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRole="patient">
              <PatientDashboard />
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
