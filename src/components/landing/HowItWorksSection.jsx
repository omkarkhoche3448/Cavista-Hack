import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "Request a Session",
    description: "Doctor enters the patient's email and chief complaint. The patient receives a real-time notification to join.",
  },
  {
    number: "02",
    title: "Consult & Record",
    description: "Once the patient accepts, the live session begins. Doctor speaks naturally while AI transcribes and analyzes in real time.",
  },
  {
    number: "03",
    title: "Review the EMR",
    description: "After the session, an EMR is auto-generated with ICD-10 codes, treatment suggestions, and a clinical summary for doctor review.",
  },
  {
    number: "04",
    title: "Patient Gets Summary",
    description: "The patient receives a clear, plain-language visit summary with key takeaways, prescriptions, and follow-up instructions.",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-24 px-6 bg-secondary/50">
      <div className="container max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-4">
            How It Works
          </span>
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            From Consultation to Medical Record in Minutes
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative"
            >
              <span className="text-5xl font-bold font-heading text-primary/15 mb-2 block">
                {step.number}
              </span>
              <h3 className="text-lg font-semibold font-heading mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 -right-4 w-8 border-t-2 border-dashed border-primary/20" />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
