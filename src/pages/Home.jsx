import { ArrowRight, Mic, Brain, FileText, Users, Clock, Shield, GitBranch, BarChart3 } from "lucide-react";

const FeatureCard = ({ icon: Icon, title, description, delay }) => (
  <div
    className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-500 hover:shadow-xl hover:border-primary hover:-translate-y-1 animate-in fade-in-up"
    style={{ animationDelay: `${delay}ms`, animationDuration: '600ms' }}
  >
    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <div className="relative">
      <div className="mb-4 inline-block rounded-lg bg-primary/10 p-3 text-primary group-hover:scale-125 group-hover:bg-primary/20 transition-all duration-500">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground group-hover:text-primary transition-colors duration-300">{title}</h3>
      <p className="text-sm text-muted-foreground group-hover:text-muted-foreground/80 transition-colors duration-300">{description}</p>
    </div>
  </div>
);

const ProblemCard = ({ icon: Icon, title, description, delay }) => (
  <div
    className="group relative overflow-hidden rounded-xl border border-border bg-card p-6 transition-all duration-500 hover:shadow-xl hover:border-primary hover:-translate-y-1 animate-in fade-in-up"
    style={{ animationDelay: `${delay}ms`, animationDuration: '600ms' }}
  >
    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <div className="relative">
      <div className="mb-4 inline-block rounded-lg bg-primary/10 p-3 text-primary group-hover:scale-125 group-hover:bg-primary/20 transition-all duration-500">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground group-hover:text-primary transition-colors duration-300">{title}</h3>
      <p className="text-sm text-muted-foreground group-hover:text-muted-foreground/80 transition-colors duration-300">{description}</p>
    </div>
  </div>
);
export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Hero Section */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 opacity-20 animate-pulse duration-5000">
            <div className="h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
          </div>
          <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 opacity-15 animate-pulse duration-7000">
            <div className="h-96 w-96 rounded-full bg-secondary/20 blur-3xl" />
          </div>
        </div>

        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-6xl font-bold tracking-tight text-primary animate-in fade-in slide-in-from-top-6 duration-700 fill-mode-both">
            <span className="animate-in fade-in duration-1000 delay-100">
              Smart EMR &
            </span>
            <br />
            <span className="text-foreground animate-in fade-in duration-1000 delay-200">Diagnostic Assistant</span>
          </h1>
          <p className="mb-8 text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto animate-in fade-in duration-1000 delay-300">
            A voice-first system that transforms clinician-patient interactions into structured data, diagnoses, and actionable insights—streamlining documentation and improving care quality.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in duration-1000 delay-500">
            <button className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground overflow-hidden transition-all duration-500 hover:shadow-lg hover:shadow-primary/50 active:scale-95">
              <span className="relative z-10 flex items-center gap-2">
                Get Started
                <ArrowRight className="h-5 w-5 transition-transform duration-500 group-hover:translate-x-1" />
              </span>
            </button>
            <button className="group inline-flex items-center justify-center gap-2 rounded-full border border-primary/30 px-8 py-3 font-semibold text-foreground transition-all duration-500 hover:border-primary hover:bg-primary/5 hover:shadow-md">
              Login
            </button>
          </div>
        </div>
      </section>

      {/* Problem Statement Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-card/20 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-4xl font-bold text-center animate-in fade-in-down duration-700">The Problem We Solve</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProblemCard
              delay={0}
              icon={FileText}
              title="Inefficient Documentation"
              description="Clinicians spend hours on paperwork, diverting time from patient care."
            />
            <ProblemCard
              delay={100}
              icon={Clock}
              title="Time-Consuming Data Entry"
              description="Manual EMR entry increases errors and delays in clinical decision-making."
            />
            <ProblemCard
              delay={200}
              icon={GitBranch}
              title="Fragmented Medical Records"
              description="Multiple systems create inconsistencies in patient data and care continuity."
            />
            <ProblemCard
              delay={300}
              icon={BarChart3}
              title="Missing Clinical Insights"
              description="Lack of AI-powered analysis leads to incomplete diagnoses and missed patterns."
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold animate-in fade-in-down duration-700">Powerful Features</h2>
            <p className="text-lg text-muted-foreground animate-in fade-in-up duration-700 delay-100">Everything you need for intelligent documentation and diagnosis</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              delay={0}
              icon={Mic}
              title="Speech-to-Text Engine"
              description="Convert clinician dictation or patient interviews into structured EMR entries effortlessly."
            />
            <FeatureCard
              delay={100}
              icon={Brain}
              title="AI-Powered Summarization"
              description="Extract key vitals, symptoms, and diagnosis from documents automatically."
            />
            <FeatureCard
              delay={200}
              icon={FileText}
              title="ICD Code Mapping"
              description="Auto-tag conditions and recommend medications with intelligent suggestions."
            />
            <FeatureCard
              delay={300}
              icon={Users}
              title="Patient-Friendly Summaries"
              description="Translate medical jargon into understandable recovery plans instantly."
            />
            <FeatureCard
              delay={400}
              icon={Clock}
              title="Real-Time Processing"
              description="Get instant insights and analysis during consultations seamlessly."
            />
            <FeatureCard
              delay={500}
              icon={Shield}
              title="HIPAA Compliant"
              description="Enterprise-grade security and audit-ready records generation."
            />
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-card/10">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-12 text-4xl font-bold text-center animate-in fade-in-down duration-700">Use Cases</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Faster documentation during consultations",
              "Telehealth transcription and diagnosis support",
              "Emergency room triage documentation",
              "Multilingual support for diverse populations",
              "Compliance and audit-ready records",
              "Integration with existing EMR systems",
            ].map((useCase, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border hover:border-primary transition-all duration-500 group cursor-pointer hover:shadow-md hover:bg-primary/5 animate-in fade-in"
                style={{ animationDelay: `${idx * 50}ms`, animationDuration: '600ms' }}
              >
                <div className="mt-1 h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center group-hover:bg-primary/40 transition-all duration-500 flex-shrink-0">
                  <div className="h-2 w-2 rounded-full bg-primary group-hover:scale-150 transition-transform duration-500" />
                </div>
                <p className="text-sm text-foreground group-hover:text-primary transition-colors duration-300">{useCase}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-4xl font-bold animate-in fade-in-down duration-700">Ready to Transform Your Workflow?</h2>
          <p className="mb-8 text-lg text-muted-foreground animate-in fade-in-up duration-700 delay-100">
            Join healthcare providers using sewa मित्र to streamline documentation and improve patient care.
          </p>
          <button className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-primary px-10 py-4 font-semibold text-primary-foreground transition-all duration-500 hover:shadow-xl hover:shadow-primary/50 active:scale-95 animate-in fade-in-up duration-700 delay-200 overflow-hidden">
            <span className="relative z-10 flex items-center gap-2">
              Start Now
              <ArrowRight className="h-5 w-5 transition-transform duration-500 group-hover:translate-x-1" />
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
