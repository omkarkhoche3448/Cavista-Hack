import { BrowserRouter as Router } from "react-router-dom";
import { AuthProvider } from "@/features/auth";
import { WebSocketProvider } from "@/context/WebSocketContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import AppRouter from "./AppRouter.jsx";

function App() {
  return (
    <Router>
      <AuthProvider>
        <WebSocketProvider>
          <TooltipProvider>
            <div className="min-h-screen bg-background text-foreground">
              <AppRouter />
            </div>
            <Toaster richColors position="top-right" />
          </TooltipProvider>
        </WebSocketProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
