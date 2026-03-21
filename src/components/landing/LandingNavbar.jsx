import { motion } from "framer-motion";
import { Activity, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/features/auth";
import { signOut } from "@/services/authService";

const MotionNav = motion.nav;

const LandingNavbar = () => {
  const { isAuthenticated, profile, loading } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/home", { replace: true });
  }

  return (
    <MotionNav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 glass-surface border-b"
    >
      <div className="container max-w-6xl mx-auto flex items-center justify-between h-16 px-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-xl">
            SEVA<span className="text-primary">मित्र</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
          <a href="#impact" className="hover:text-foreground transition-colors">Impact</a>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {!loading && (
            <>
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-sm font-bold text-foreground">
                      {profile?.first_name} {profile?.last_name}
                    </span>
                    {profile?.role && (
                      <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                        {profile.role}
                      </span>
                    )}
                  </div>
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                    Sign In
                  </Link>
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </MotionNav>
  );
};

export default LandingNavbar;
