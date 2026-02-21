import { motion } from "framer-motion";
import { ArrowRight, Mic } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-illustration.png";

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-1/4 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="container max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
              <Mic className="w-4 h-4" />
              Smart EMR & Diagnostic Assistant
            </span> 

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-heading leading-tight mb-6">
              Just Talk.{" "}
              <span className="text-gradient-primary">We Document.</span>
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-lg">
              SEVAमित्र listens to your consultations in real time, auto-generates
              structured EMRs with ICD-10 codes, and delivers patient-friendly
              visit summaries — so you can focus on care, not paperwork.
            </p>

            <div className="flex flex-wrap gap-4">
              <Button variant="hero" size="lg" className="gap-2" onClick={() => navigate("/signup")}>
                Get Started <ArrowRight className="w-4 h-4" />
              </Button>
              <Button variant="hero-outline" size="lg" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
                See How It Works
              </Button>
            </div>

            <div className="flex items-center gap-6 mt-10 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse-soft" />
                Real-time transcription
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
                Auto-generated EMR
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-card-lg border">
              <img
                src={heroImage}
                alt="SEVAमित्र — AI-powered telemedicine platform"
                className="w-full h-auto"
              />
            </div>
            {/* Floating stat card */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-4 -left-4 bg-card rounded-xl shadow-card-lg border p-4"
            >
              <p className="text-xs text-muted-foreground mb-1">EMR Generated In</p>
              <p className="text-2xl font-bold font-heading text-primary">Seconds</p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
