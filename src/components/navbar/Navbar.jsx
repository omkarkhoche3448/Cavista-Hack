import { Zap } from "lucide-react";
import { ThemeToggle } from "../theme-toggle";

export default function Navbar() {
    return (
        <header className="border-b border-border bg-card">
            <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Zap className="w-8 h-8 text-primary" />
                    <h1 className="text-2xl font-bold">sewa मित्र</h1>
                </div>
                <ThemeToggle />
            </div>
        </header>
    );
}


