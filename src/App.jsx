import { BrowserRouter as Router } from "react-router-dom";
import AppRouter from "./AppRouter.jsx";
import Navbar from "./components/navbar/Navbar";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <AppRouter />
        </main>
      </div>
    </Router>
  );
}

export default App;
