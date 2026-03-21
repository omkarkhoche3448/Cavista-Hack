import { motion } from "framer-motion";
import { Clock, FileCheck, Zap, Heart } from "lucide-react";

const MotionDiv = motion.div;

const metrics = [
  { icon: Clock, label: "Documentation Time", value: "~0", suffix: "manual note-taking needed", color: "text-primary" },
  { icon: Zap, label: "EMR Generation", value: "Instant", suffix: "auto-generated after session", color: "text-accent" },
  { icon: FileCheck, label: "ICD-10 Coding", value: "Auto", suffix: "AI-mapped diagnosis codes", color: "text-primary" },
  { icon: Heart, label: "Patient Clarity", value: "100%", suffix: "plain-language summaries", color: "text-accent" },
];

const ImpactSection = () => {
  return (
    <section id="impact" className="py-24 px-6">
      <div className="container max-w-6xl mx-auto">
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-accent/15 text-accent-foreground text-sm font-semibold mb-4">
            Impact
          </span>
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            Built to Save Clinicians Time
          </h2>
        </MotionDiv>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((metric, i) => (
            <MotionDiv
              key={metric.label}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="text-center rounded-xl border bg-card p-8 shadow-card hover:shadow-card-lg transition-all duration-300"
            >
              <metric.icon className={`w-8 h-8 mx-auto mb-4 ${metric.color}`} />
              <p className={`text-3xl font-bold font-heading mb-1 ${metric.color}`}>{metric.value}</p>
              <p className="text-sm font-medium mb-1">{metric.label}</p>
              <p className="text-xs text-muted-foreground">{metric.suffix}</p>
            </MotionDiv>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ImpactSection;
