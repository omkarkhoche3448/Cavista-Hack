import { Link, useNavigate } from "react-router-dom";
import { HeartPulse, LogOut } from "lucide-react";
import { ThemeToggle } from "../theme-toggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { signOut } from "@/services/authService";

export default function Navbar() {
  const { isAuthenticated, profile, loading } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/home", { replace: true });
  }

  return (
    <header className="border-b border-border bg-card">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/home" className="flex items-center gap-3 no-underline">
          <HeartPulse className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold">sewa मित्र</h1>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          {!loading && (
            <>
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium hidden sm:inline">
                    {profile?.first_name} {profile?.last_name}
                  </span>
                  {profile?.role && (
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium capitalize">
                      {profile.role}
                    </span>
                  )}
                  <Button variant="ghost" size="icon" onClick={handleLogout}>
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" asChild>
                    <Link to="/login">Login</Link>
                  </Button>
                  <Button asChild>
                    <Link to="/signup">Sign Up</Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
