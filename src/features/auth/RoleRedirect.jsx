import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Loader2 } from "lucide-react";

export default function RoleRedirect() {
  const { role, loading, isAuthenticated, profile } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-6 animate-in fade-in duration-500">
        <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-black tracking-tight text-foreground uppercase tracking-widest">Preparing your dashboard</h2>
          <p className="text-sm text-muted-foreground font-medium">Authenticating secure session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !role) {
    return <Navigate to="/login" replace />;
  }

  if (role === "patient" && profile?.status !== "active") {
    return <Navigate to="/patient/onboarding" replace />;
  }

  return <Navigate to={`/${role}/dashboard`} replace />;
}
