import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Loader2 } from "lucide-react";

export default function RoleRedirect() {
  const { role, loading } = useAuth();

  if (loading || !role) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <Navigate to={`/${role}/dashboard`} replace />;
}
