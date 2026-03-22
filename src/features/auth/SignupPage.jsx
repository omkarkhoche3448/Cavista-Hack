import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUpWithEmail, signInWithGoogle } from "@/services/authService";
import { useAuth } from "./AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Activity, Stethoscope, User, Loader2, ArrowRight, Mic, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SignupPage() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [step, setStep] = useState(1);
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
      const { session } = await signUpWithEmail({ email, password, firstName, lastName, role });
      if (!session) {
        navigate("/login", { replace: true });
        return;
      }

      await refreshProfile();
      navigate("/dashboard", { replace: true });
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
    <div className="min-h-[80vh] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration — matches landing page */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-1/4 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
        {/* Left Side: Branding */}
        <div className="hidden lg:flex flex-col justify-center space-y-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold w-fit">
            <Activity className="w-4 h-4" />
            Get Started
          </span>

          <h1 className="text-4xl md:text-5xl font-bold font-heading leading-tight">
            Join{" "}
            <span className="text-gradient-primary">SEVAमित्र</span>
          </h1>

          <p className="text-lg text-muted-foreground leading-relaxed max-w-md">
            Create your account to access AI-powered clinical documentation,
            real-time transcription, and intelligent patient management.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="rounded-xl border bg-card p-5 shadow-card">
              <Mic className="w-5 h-5 text-primary mb-3" />
              <p className="text-sm font-semibold font-heading mb-1">Voice-First</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Speak naturally, AI documents everything.</p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-card">
              <FileCheck className="w-5 h-5 text-accent mb-3" />
              <p className="text-sm font-semibold font-heading mb-1">Instant EMR</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Auto-generated records with ICD-10 codes.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Step-based Form Card */}
        <div className="rounded-2xl border bg-card shadow-card-lg p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary" />

          {step === 1 ? (
            <div className="space-y-6">
              <div className="text-center lg:text-left">
                <div className="inline-flex p-3 rounded-xl bg-primary/10 text-primary mb-4">
                  <Activity className="w-7 h-7" />
                </div>
                <h2 className="text-2xl font-bold font-heading">Choose Your Role</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Select how you'll use SEVAमित्र
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => selectRole("doctor")}
                  className={cn(
                    "flex flex-col items-start gap-3 p-5 rounded-xl border transition-all group/btn text-left relative overflow-hidden",
                    "hover:border-primary hover:shadow-card cursor-pointer",
                    "border-border bg-background/50"
                  )}
                >
                  <div className="absolute top-0 right-0 p-3 opacity-[0.03]">
                    <Stethoscope className="w-20 h-20" />
                  </div>
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover/btn:bg-primary group-hover/btn:text-white transition-colors duration-300">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-bold font-heading text-lg">I'm a Doctor</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Manage patients, sessions & AI documentation.
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => selectRole("patient")}
                  className={cn(
                    "flex flex-col items-start gap-3 p-5 rounded-xl border transition-all group/btn text-left relative overflow-hidden",
                    "hover:border-primary hover:shadow-card cursor-pointer",
                    "border-border bg-background/50"
                  )}
                >
                  <div className="absolute top-0 right-0 p-3 opacity-[0.03]">
                    <User className="w-20 h-20" />
                  </div>
                  <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover/btn:bg-primary group-hover/btn:text-white transition-colors duration-300">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-bold font-heading text-lg">I'm a Patient</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      Access your health records and consultations.
                    </span>
                  </div>
                </button>
              </div>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold capitalize">
                  {role === "doctor" ? <Stethoscope className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  {role}
                </span>
              </div>

              <div className="text-center lg:text-left">
                <h2 className="text-2xl font-bold font-heading">Create Account</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter your details to get started
                </p>
              </div>

              <Button
                variant="outline"
                className="w-full rounded-xl h-11 font-semibold"
                onClick={handleGoogle}
                type="button"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <Separator />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  or
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium">First Name</Label>
                    <Input
                      id="firstName"
                      placeholder="John"
                      className="rounded-lg h-11"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium">Last Name</Label>
                    <Input
                      id="lastName"
                      placeholder="Doe"
                      className="rounded-lg h-11"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@care.com"
                    className="rounded-lg h-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Min 6 characters"
                    className="rounded-lg h-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium text-center">
                    {error}
                  </div>
                )}

                <Button variant="hero" type="submit" className="w-full rounded-xl h-11 gap-2" disabled={loading}>
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>Create Account <ArrowRight className="w-4 h-4" /></>
                  )}
                </Button>
              </form>

              <p className="text-sm text-center text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
