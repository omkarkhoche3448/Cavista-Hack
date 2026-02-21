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
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
        <Link to="/home" className="group flex items-center gap-3 no-underline transition-transform hover:scale-105">
          <div className="p-2 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300 shadow-inner">
            <HeartPulse className="w-6 h-6" />
          </div>
          <div className="flex flex-col -space-y-1">
            <span className="text-xl font-black tracking-tighter text-foreground italic">sewa <span className="text-primary not-italic">मित्र</span></span>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.3em]">Health Assistant</span>
          </div>
        </Link>

        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6">
            <Link to="/home" className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors">Process</Link>
            <Link to="/home" className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors">Features</Link>
            <Link to="/home" className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors">Security</Link>
          </nav>

          <div className="h-6 w-[1px] bg-border/60 hidden md:block" />

          <div className="flex items-center gap-3">
            <ThemeToggle />

            {!loading && (
              <>
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end hidden sm:flex">
                      <span className="text-sm font-black text-foreground">
                        {profile?.first_name} {profile?.last_name}
                      </span>
                      {profile?.role && (
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest italic">
                          {profile.role}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleLogout} className="rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <LogOut className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" asChild className="font-bold hover:text-primary rounded-full">
                      <Link to="/login">Sign In</Link>
                    </Button>
                    <Button asChild className="rounded-full font-bold shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95">
                      <Link to="/signup">Join Now</Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
