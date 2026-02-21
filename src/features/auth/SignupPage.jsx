import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUpWithEmail, signInWithGoogle } from "@/services/authService";
import { useAuth } from "./AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HeartPulse, Stethoscope, User, Loader2, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function SignupPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(1); // 1 = role selection, 2 = form
  const [role, setRole] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function selectRole(r) {
    setRole(r);
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signUpWithEmail({ email, password, firstName, lastName, role });
      await refreshProfile();
      navigate(`/${role}/dashboard`, { replace: true });
    } catch (err) {
      setError(err.message || "Signup failed.");
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
    <div className="min-h-[85vh] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 left-0 -translate-y-1/2 -translate-x-1/2 opacity-20">
        <div className="h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      </div>
      <div className="absolute bottom-0 right-0 translate-y-1/2 translate-x-1/2 opacity-10">
        <div className="h-96 w-96 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      <div className="w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10 animate-in fade-in duration-500">
        {/* Left Side: Branding/Value Prop */}
        <div className="hidden lg:flex flex-col justify-center p-8 space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider w-fit">
              <ShieldCheck className="w-3 h-3" /> Join the community
            </div>
            <h1 className="text-5xl font-black tracking-tight text-foreground leading-[1.1]">
              Start your journey with <span className="text-primary italic">sewa मित्र</span>
            </h1>
            <p className="text-xl text-muted-foreground font-medium leading-relaxed max-w-md">
              The next generation of healthcare management. Secure, intelligent, and human-centric.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-xl bg-primary/10 text-primary mt-1">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-foreground">Voice-First Experience</p>
                <p className="text-sm text-muted-foreground">Focus on patients while our AI handles the documentation.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-xl bg-primary/10 text-primary mt-1">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-foreground">Patient Empowerment</p>
                <p className="text-sm text-muted-foreground">Instant access to records and AI-simplified medical jargon.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Step-based Form */}
        <Card className="rounded-3xl border-border/40 shadow-2xl shadow-primary/5 backdrop-blur-sm bg-card/80 overflow-hidden relative group min-h-[500px]">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-primary opacity-50" />

          {step === 1 ? (
            <div className="p-8 space-y-8 animate-in slide-in-from-right duration-500">
              <div className="space-y-2">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary w-fit">
                  <HeartPulse className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-black tracking-tight pt-4">Identify yourself</h2>
                <p className="text-muted-foreground font-medium">Choose your path to get started with sewa मित्र</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => selectRole("doctor")}
                  className={cn(
                    "flex flex-col items-start gap-4 p-6 rounded-2xl border-2 transition-all group/btn text-left relative overflow-hidden",
                    "hover:border-primary hover:shadow-lg hover:shadow-primary/5 cursor-pointer",
                    "border-border/60 bg-background/50"
                  )}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-5 transition-transform duration-300">
                    <Stethoscope className="w-24 h-24" />
                  </div>
                  <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover/btn:bg-primary group-hover/btn:text-white transition-colors duration-300">
                    <Stethoscope className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="block font-black text-xl uppercase tracking-tight">I am a Doctor</span>
                    <span className="text-sm text-muted-foreground font-medium">
                      Manage patients, sessions & AI documentation.
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => selectRole("patient")}
                  className={cn(
                    "flex flex-col items-start gap-4 p-6 rounded-2xl border-2 transition-all group/btn text-left relative overflow-hidden",
                    "hover:border-primary hover:shadow-lg hover:shadow-primary/5 cursor-pointer",
                    "border-border/60 bg-background/50"
                  )}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-5 transition-transform duration-300">
                    <User className="w-24 h-24" />
                  </div>
                  <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover/btn:bg-primary group-hover/btn:text-white transition-colors duration-300">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="block font-black text-xl uppercase tracking-tight">I am a Patient</span>
                    <span className="text-sm text-muted-foreground font-medium">
                      Access your health records and consultations.
                    </span>
                  </div>
                </button>
              </div>

              <p className="text-sm font-medium text-center text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-bold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          ) : (
            <div className="p-8 space-y-6 animate-in slide-in-from-right duration-500">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-primary transition-colors"
                >
                  <ArrowRight className="w-5 h-5 rotate-180" />
                </button>
                <Badge variant="outline" className="rounded-full px-4 py-1 border-primary/20 text-primary font-bold uppercase tracking-wider text-[10px]">
                  Role: {role}
                </Badge>
              </div>

              <div className="space-y-1">
                <h2 className="text-3xl font-black tracking-tight">Create Account</h2>
                <p className="text-sm text-muted-foreground font-medium">Finalize your details to launch your dashboard</p>
              </div>

              <Button
                variant="outline"
                className="w-full rounded-2xl h-12 border-border/60 hover:border-primary hover:bg-primary/5 transition-all duration-300 font-bold"
                onClick={handleGoogle}
                type="button"
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign up with Google
              </Button>

              <div className="relative">
                <Separator className="bg-border/60" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-4 text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                  or fill details
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="font-bold text-xs uppercase tracking-widest text-muted-foreground ml-1">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      className="rounded-xl h-11 bg-background/50 border-border/60 focus:border-primary focus:ring-primary/20"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="font-bold text-xs uppercase tracking-widest text-muted-foreground ml-1">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      className="rounded-xl h-11 bg-background/50 border-border/60 focus:border-primary focus:ring-primary/20"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>

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
                  <Label htmlFor="password" className="font-bold text-xs uppercase tracking-widest text-muted-foreground ml-1">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 6 characters"
                    className="rounded-xl h-11 bg-background/50 border-border/60 focus:border-primary focus:ring-primary/20"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-bold text-center animate-shake">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full rounded-2xl h-12 shadow-lg shadow-primary/25 font-bold group pt-1" disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      Join sewa मित्र Community <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                  )}
                </Button>
              </form>

              <p className="text-sm font-medium text-center text-muted-foreground pt-2">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-bold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
