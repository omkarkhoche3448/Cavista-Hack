import { Mic, FileText, Stethoscope, Brain, AlertTriangle, ClipboardCheck } from "lucide-react";
import { motion } from "framer-motion";

const MotionDiv = motion.div;

const features = [
  {
    icon: Mic,
    title: "Live Speech Transcription",
    description: "Speak naturally during consultations. SEVAमित्र captures and transcribes your voice into structured clinical notes in real time.",
  },
  {
    icon: Brain,
    title: "Real-Time Clinical Insights",
    description: "Get AI-powered decision support during sessions — key observations, suggested diagnostic questions, and critical red-flag alerts.",
  },
  {
    icon: Stethoscope,
    title: "Auto-Generated EMR",
    description: "When the session ends, a complete Electronic Medical Record is generated with ICD-10 codes, treatments, and clinical summaries.",
  },
  {
    icon: FileText,
    title: "Smart Document Analysis",
    description: "Patients upload lab reports, prescriptions, or imaging — AI instantly extracts key findings, recommendations, and risk flags.",
  },
  {
    icon: AlertTriangle,
    title: "Clinical Audit Flags",
    description: "Proactively flags missing vitals, allergy history, and medication reconciliation gaps before you finalize the record.",
  },
  {
    icon: ClipboardCheck,
    title: "Patient Visit Summaries",
    description: "Patients receive plain-language summaries of their visit with key takeaways, medications, and follow-up instructions.",
  },
];

const FeaturesSection = () => {
  return (
    <section className="py-24 px-6">
      <div className="container max-w-6xl mx-auto">
        <MotionDiv
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-secondary text-primary text-sm font-semibold mb-4">
            Key Features
          </span>
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            Your AI Clinical Command Center
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
            From live consultation to finalized medical record — SEVAमित्र automates the entire documentation workflow.
          </p>
        </MotionDiv>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <MotionDiv
              key={feature.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: "easeOut" }}
              className="group rounded-xl border bg-card p-6 shadow-card hover:shadow-card-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold font-heading mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </MotionDiv>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
