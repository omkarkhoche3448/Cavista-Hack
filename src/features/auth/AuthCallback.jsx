import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, role, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (isAuthenticated && role) {
      navigate(`/${role}/dashboard`, { replace: true });
    } else if (isAuthenticated) {
      // Profile not loaded yet — wait a moment and redirect to generic dashboard
      const timer = setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      navigate("/login", { replace: true });
    }
  }, [isAuthenticated, role, loading, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-muted-foreground">Completing sign in...</p>
    </div>
  );
}
