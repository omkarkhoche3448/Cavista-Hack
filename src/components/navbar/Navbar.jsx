import { Link, NavLink, useNavigate } from "react-router-dom";
import { Activity, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth";
import { signOut } from "@/services/authService";
import { cn } from "@/lib/utils";

const ROLE_NAV_ITEMS = {
  doctor: [
    { label: "Dashboard", to: "/doctor/dashboard" },
    { label: "Sessions", to: "/doctor/sessions" },
    { label: "Patients", to: "/doctor/patients" },
    { label: "Profile", to: "/doctor/profile" },
  ],
  patient: [
    { label: "Dashboard", to: "/patient/dashboard" },
    { label: "Sessions", to: "/patient/sessions" },
    { label: "Uploads", to: "/patient/uploads" },
    { label: "Profile", to: "/patient/profile" },
  ],
};

export default function Navbar() {
  const { isAuthenticated, profile, role, user, loading } = useAuth();
  const navigate = useNavigate();
  const effectiveRole = role ?? profile?.role ?? null;
  const navItems = effectiveRole ? ROLE_NAV_ITEMS[effectiveRole] ?? [] : [];
  const firstName = profile?.first_name || user?.user_metadata?.first_name || "User";
  const lastName = profile?.last_name || user?.user_metadata?.last_name || "";

  async function handleLogout() {
    await signOut();
    navigate("/home", { replace: true });
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b glass-surface">
      <div className="container max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
        <Link to="/home" className="flex items-center gap-2.5 no-underline">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-xl">
            SEVA<span className="text-primary">मित्र</span>
          </span>
        </Link>

        {!loading && isAuthenticated && navItems.length > 0 && (
          <nav className="hidden md:flex items-center gap-1 flex-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "px-3 py-2 rounded-lg text-sm font-semibold transition-colors",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3 ml-auto">
          {!loading && (
            <>
              {isAuthenticated ? (
                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-sm font-bold text-foreground">
                      {firstName} {lastName}
                    </span>
                    {effectiveRole && (
                      <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                        {effectiveRole}
                      </span>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <LogOut className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Get Started
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
