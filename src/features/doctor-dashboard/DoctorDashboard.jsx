import { useState } from "react";
import { useAuth } from "@/features/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Users, 
  FileText, 
  CalendarDays, 
  Play, 
  Mic, 
  Clock, 
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  User,
  Activity,
  FileBarChart,
  Mail
} from "lucide-react";

const PatientEmailForm = ({ onBack, onStart }) => {
  const [patientEmail, setPatientEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showFun, setShowFun] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientEmail.trim()) return;
    
    setIsLoading(true);
    setShowFun(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsLoading(false);
    setShowFun(false);
    onStart(patientEmail);
  };

  return (
    <div className="relative">
      {/* Floating elements */}
      <div className="absolute -top-4 -right-4 w-8 h-8 bg-blue-500/20 rounded-full animate-pulse opacity-70" style={{ animationDelay: '0.5s' }} />
      <div className="absolute -bottom-2 -left-2 w-6 h-6 bg-primary/30 rounded-full animate-pulse opacity-60" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/4 -right-8 w-4 h-4 bg-secondary/40 rounded-full animate-ping opacity-50" />
      
      <Card className="relative overflow-hidden bg-background border border-primary/20 shadow-xl shadow-primary/20 transform hover:scale-[1.02] hover:border-primary/40 hover:shadow-primary/30 transition-all duration-500">
        <CardContent className="p-8">
          {/* Professional header */}
          <div className="text-center mb-8">
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 bg-primary rounded-full animate-spin opacity-60" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-1 bg-background rounded-full flex items-center justify-center">
                <Mail className={`w-8 h-8 text-primary transition-all duration-500 ${showFun ? 'animate-pulse' : ''}`} />
              </div>
            </div>
            
            <h3 className="text-2xl font-bold mb-3 text-primary">
              Patient Information
            </h3>
            <p className="text-muted-foreground text-lg">
              Enter patient details to initialize session
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="relative">
              <div className="absolute -top-2 left-0 text-xs font-medium text-primary bg-background px-2 rounded z-10">
                Patient Email
              </div>
              <Input
                id="patient-email"
                type="email"
                placeholder="patient@example.com"
                value={patientEmail}
                onChange={(e) => setPatientEmail(e.target.value)}
                className="w-full h-14 px-6 text-lg border-2 border-dashed border-primary/30 rounded-2xl bg-background/80 backdrop-blur-sm hover:border-primary/60 focus:border-primary transition-all duration-300 placeholder:text-muted-foreground/60"
                required
              />
              
              {/* Email validation indicator */}
              {patientEmail && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  {patientEmail.includes('@') ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  ) : (
                    <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse" />
                  )}
                </div>
              )}
            </div>

            {/* Professional loading animation */}
            {isLoading && (
              <div className="text-center py-4 animate-in fade-in duration-500">
                <div className="flex justify-center items-center gap-2 mb-3">
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <p className="text-sm text-muted-foreground animate-pulse">
                  Initializing secure session...
                </p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={onBack}
                className="group px-8 py-4 rounded-full border-2 border-border hover:border-primary hover:bg-primary/5 bg-background/80 backdrop-blur-sm transition-all duration-300 font-semibold"
              >
                <ArrowLeft className="w-5 h-5 mr-2 transition-transform duration-300 group-hover:-translate-x-1" />
                Back
              </Button>
              
              <Button
                type="submit"
                disabled={!patientEmail.includes('@') || isLoading}
                className="group relative px-10 py-4 rounded-full bg-primary text-white font-bold text-lg overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-primary/40 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
              >
                {/* Button shine effect */}
                <div className="absolute inset-0 bg-white/10 -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                
                <span className="relative z-10 flex items-center gap-3">
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Starting Session
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5 transition-all duration-300 group-hover:animate-pulse" />
                      Start Session
                      <ArrowRight className="w-5 h-5 transition-transform duration-500 group-hover:translate-x-2" />
                    </>
                  )}
                </span>
              </Button>
            </div>
          </form>

          {/* Professional footer */}
          <div className="mt-8 pt-6 border-t border-border/30 text-center">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/80">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Secure encrypted session • HIPAA compliant • AI-powered</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const SessionCard = ({ session, onClick }) => (
  <Card className="group cursor-pointer transition-all duration-300 hover:shadow-lg hover:border-primary hover:-translate-y-1 animate-in fade-in-up" onClick={onClick}>
    <CardContent className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors duration-300">
            <User className="w-4 h-4" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{session.patientName}</p>
            <p className="text-sm text-muted-foreground">{session.patientId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>{session.duration}</span>
        </div>
      </div>
      
      <div className="space-y-2 mb-4">
        <p className="text-sm font-medium text-foreground">Chief Complaint:</p>
        <p className="text-sm text-muted-foreground line-clamp-2">{session.chiefComplaint}</p>
      </div>
      
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
          session.status === 'completed' 
            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
        }`}>
          <CheckCircle className="w-3 h-3" />
          {session.status}
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-300" />
      </div>
    </CardContent>
  </Card>
);

export default function DoctorDashboard() {
  const { profile } = useAuth();
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [sessions] = useState([
    {
      id: 1,
      patientName: "Sarah Johnson",
      patientId: "PAT-001",
      duration: "45 min",
      chiefComplaint: "Persistent headaches and fatigue for the past two weeks",
      status: "completed",
      date: "2026-02-21"
    },
    {
      id: 2,
      patientName: "Michael Chen",
      patientId: "PAT-002", 
      duration: "30 min",
      chiefComplaint: "Chest pain and shortness of breath during exercise",
      status: "in progress",
      date: "2026-02-21"
    },
    {
      id: 3,
      patientName: "Emma Davis",
      patientId: "PAT-003",
      duration: "25 min", 
      chiefComplaint: "Follow-up for diabetes management and medication review",
      status: "completed",
      date: "2026-02-20"
    }
  ]);

  const handleStartSession = () => {
    setShowPatientForm(true);
  };

  const handleBackToStart = () => {
    setShowPatientForm(false);
  };

  const handleStartWithPatient = (patientEmail) => {
    console.log("Starting session with patient:", patientEmail);
    // TODO: Implement actual session start logic
    // Reset to initial state after starting
    setShowPatientForm(false);
  };

  const handleSessionClick = (session) => {
    console.log("Opening session:", session);
    // TODO: Navigate to session detail view
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="animate-in fade-in-down duration-700">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold">
              Welcome, Dr. {profile?.first_name}
            </h1>
            <p className="text-muted-foreground mt-1">
              Here&apos;s your dashboard overview
            </p>
          </div>
          
          {/* Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button 
              variant="default" 
              className="bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300"
            >
              <Activity className="w-4 h-4 mr-2" />
              Dashboard
            </Button>
            <Button 
              variant="outline" 
              className="hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Sessions
            </Button>
            <Button 
              variant="outline" 
              className="hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              <Users className="w-4 h-4 mr-2" />
              Patients
            </Button>
            <Button 
              variant="outline" 
              className="hover:bg-primary hover:text-primary-foreground transition-all duration-300"
            >
              <FileBarChart className="w-4 h-4 mr-2" />
              Reports
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="animate-in fade-in-up duration-700 delay-100">
        <div className="relative overflow-hidden">
          {/* Start Session Card */}
          <div 
            className={`transition-transform duration-500 ease-in-out ${
              showPatientForm ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'
            }`}
          >
            <div className="relative">
              {/* Floating decorative elements */}
              <div className="absolute -top-6 -left-6 w-12 h-12 bg-blue-500/10 rounded-full animate-pulse" />
              <div className="absolute -bottom-4 -right-4 w-8 h-8 bg-primary/20 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
              <div className="absolute top-1/4 -right-8 w-6 h-6 bg-secondary/15 rounded-full animate-ping" />
              
              <Card className="relative overflow-hidden bg-background border-2 border-dashed border-primary/40 hover:border-primary hover:shadow-2xl hover:shadow-primary/25 hover:bg-primary/2 transition-all duration-700 group transform hover:scale-[1.02]">
                {/* Background pattern */}
                <div className="absolute inset-0 opacity-5">
                  <div className="w-full h-full" style={{ 
                    backgroundImage: `radial-gradient(circle at 25px 25px, currentColor 2px, transparent 0)`,
                    backgroundSize: '50px 50px'
                  }} />
                </div>
                
                <CardContent className="relative p-10 text-center">
                  {/* Animated icon container */}
                  <div className="relative mx-auto mb-8 w-24 h-24">
                    <div className="absolute inset-0 bg-primary rounded-full animate-spin opacity-30" style={{ animationDuration: '4s' }} />
                    <div className="absolute inset-2 bg-background rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                      <Play className="w-10 h-10 text-primary group-hover:animate-pulse" />
                    </div>
                    {/* Orbiting indicators */}
                    <div className="absolute -top-2 left-1/2 w-3 h-3 bg-primary rounded-full animate-ping opacity-60" />
                    <div className="absolute -bottom-2 left-1/2 w-2 h-2 bg-secondary rounded-full animate-pulse opacity-70" />
                  </div>
                  
                  <div className="space-y-4 mb-8">
                    <h3 className="text-3xl font-bold text-primary">
                      Start New Session
                    </h3>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto">
                      Initialize a new patient consultation with voice recording
                    </p>
                  </div>
                  
                  <Button 
                    onClick={handleStartSession}
                    className="group/btn relative inline-flex items-center gap-3 px-12 py-5 text-xl font-bold rounded-full bg-primary text-white overflow-hidden transition-all duration-700 hover:shadow-2xl hover:shadow-primary/40 active:scale-95 transform hover:-translate-y-1 hover:bg-primary/90"
                  >
                    {/* Button effects */}
                    <div className="absolute inset-0 bg-primary-foreground/10 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />
                    <div className="absolute inset-0 bg-white/10 -skew-x-12 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000" />
                    
                    <span className="relative z-10 flex items-center gap-3">
                      <Mic className="w-6 h-6 group-hover/btn:animate-pulse" />
                      Launch Session
                      <ArrowRight className="w-6 h-6 transition-all duration-500 group-hover/btn:translate-x-2 group-hover/btn:scale-110" />
                    </span>
                  </Button>
                  
                  {/* Information tip */}
                  <div className="mt-6 text-xs text-muted-foreground/70 animate-pulse">
                    Voice recognition activates automatically upon session start
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Patient Email Form */}
          <div 
            className={`absolute top-0 left-0 w-full transition-transform duration-500 ease-in-out ${
              showPatientForm ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
            }`}
          >
            <PatientEmailForm 
              onBack={handleBackToStart}
              onStart={handleStartWithPatient}
            />
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in-up duration-700 delay-200">
        <Card className="group hover:shadow-lg hover:border-primary hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Patients</CardTitle>
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 group-hover:scale-110 transition-transform duration-300">
              <Users className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">124</p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 dark:text-green-400">+12%</span> from last month
            </p>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg hover:border-primary hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sessions Today</CardTitle>
            <div className="p-2 rounded-lg bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400 group-hover:scale-110 transition-transform duration-300">
              <Activity className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">8</p>
            <p className="text-xs text-muted-foreground mt-1">
              3 completed, 2 in progress
            </p>
          </CardContent>
        </Card>

        <Card className="group hover:shadow-lg hover:border-primary hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">EMR Generated</CardTitle>
            <div className="p-2 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 group-hover:scale-110 transition-transform duration-300">
              <FileBarChart className="w-4 h-4" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">156</p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 dark:text-green-400">+8%</span> accuracy improved
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <div className="animate-in fade-in-up duration-700 delay-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-foreground">Recent Sessions</h2>
          <Button variant="outline" className="hover:bg-primary hover:text-primary-foreground transition-colors duration-300">
            View All Sessions
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sessions.map((session, index) => (
            <div 
              key={session.id}
              className="animate-in fade-in-up"
              style={{ animationDelay: `${index * 100}ms`, animationDuration: '600ms' }}
            >
              <SessionCard 
                session={session} 
                onClick={() => handleSessionClick(session)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Quick Summary */}
      <div className="animate-in fade-in-up duration-700 delay-400">
        <Card className="border border-border bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Today&apos;s Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-lg bg-background border border-border hover:border-primary transition-colors duration-300">
                <p className="text-2xl font-bold text-primary">5</p>
                <p className="text-sm text-muted-foreground">Consultations</p>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border hover:border-primary transition-colors duration-300">
                <p className="text-2xl font-bold text-primary">3h 45m</p>
                <p className="text-sm text-muted-foreground">Total Time</p>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border hover:border-primary transition-colors duration-300">
                <p className="text-2xl font-bold text-primary">98%</p>
                <p className="text-sm text-muted-foreground">Accuracy</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
