import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmail, signInWithGoogle } from "@/services/authService";
import { useAuth } from "./AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HeartPulse, Loader2, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { session } = await signInWithEmail({ email, password });
      if (session) {
        await refreshProfile();
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || "Google sign-in failed.");
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 opacity-20">
        <div className="h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      </div>
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 opacity-10">
        <div className="h-96 w-96 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      <div className="w-full max-w-[1000px] grid grid-cols-1 lg:grid-cols-2 gap-8 items-center relative z-10 animate-in fade-in duration-500">
        {/* Left Side: Branding/Visual */}
        <div className="hidden lg:flex flex-col justify-center p-8 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider w-fit">
            <ShieldCheck className="w-3 h-3" /> Secure Health Access
          </div>
          <h1 className="text-5xl font-black tracking-tight text-foreground leading-[1.1]">
            Welcome back to <span className="text-primary italic">sewa मित्र</span>
          </h1>
          <p className="text-lg text-muted-foreground font-medium leading-relaxed max-w-md">
            Your intelligent healthcare companion. Sign in to access your dashboard,
            manage records, and connect with live support.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
              <p className="text-sm font-bold text-primary mb-1">AI-Powered</p>
              <p className="text-xs text-muted-foreground">Smart documentation and EMR generation.</p>
            </div>
            <div className="p-4 rounded-2xl bg-card border border-border/50 shadow-sm">
              <p className="text-sm font-bold text-primary mb-1">Live Support</p>
              <p className="text-xs text-muted-foreground">Real-time consultation and monitoring.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Form */}
        <Card className="rounded-3xl border-border/40 shadow-2xl shadow-primary/5 backdrop-blur-sm bg-card/80 overflow-hidden relative group">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary opacity-50" />

          <CardHeader className="space-y-4 pt-8 text-center lg:text-left">
            <div className="flex justify-center lg:justify-start">
              <div className="p-3 rounded-2xl bg-primary/10 text-primary shadow-inner">
                <HeartPulse className="w-8 h-8" />
              </div>
            </div>
            <div>
              <CardTitle className="text-3xl font-black tracking-tight">Sign In</CardTitle>
              <CardDescription className="text-base font-medium mt-1">
                Enter your credentials to continue your journey
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="pb-8 space-y-6">
            <Button
              variant="outline"
              className="w-full rounded-2xl h-12 border-border/60 hover:border-primary hover:bg-primary/5 transition-all duration-300 font-bold"
              onClick={handleGoogle}
              type="button"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="relative">
              <Separator className="bg-border/60" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                or use email
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-bold text-xs uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@care.com"
                  className="rounded-xl h-11 bg-background/50 border-border/60 focus:border-primary focus:ring-primary/20"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <Label htmlFor="password" className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Password</Label>
                  <Link to="#" className="text-[10px] font-bold text-primary uppercase tracking-wider hover:underline">Forgot?</Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="rounded-xl h-11 bg-background/50 border-border/60 focus:border-primary focus:ring-primary/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold text-center animate-shake">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full rounded-2xl h-12 shadow-lg shadow-primary/25 font-bold group" disabled={loading}>
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="flex items-center gap-2">
                    Sign Into Account <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                )}
              </Button>
            </form>

            <p className="text-sm font-medium text-center text-muted-foreground pt-2">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="text-primary font-bold hover:underline">
                Create one now
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
