import { ThemeToggle } from "./components/theme-toggle";
import { Zap } from "lucide-react";

function App() {

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">Cavista</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

    </div>
  );
}

export default App;