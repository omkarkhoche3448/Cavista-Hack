import { Activity } from "lucide-react";

const LandingFooter = () => {
  return (
    <footer className="border-t py-12 px-6">
      <div className="container max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <span className="font-heading font-bold">SEVAमित्र</span>
        </div>
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} SEVAमित्र.
        </p>
      </div>
    </footer>
  );
};

export default LandingFooter;
