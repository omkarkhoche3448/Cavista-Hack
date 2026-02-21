import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const Dialog = ({ open, onOpenChange, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange?.(false)}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

const DialogHeader = ({ className, ...props }) => (
  <div className={cn("flex flex-col space-y-1.5 p-6 pb-4", className)} {...props} />
);

const DialogTitle = ({ className, ...props }) => (
  <h2 className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
);

const DialogDescription = ({ className, ...props }) => (
  <p className={cn("text-sm text-muted-foreground", className)} {...props} />
);

const DialogContent = ({ className, children, ...props }) => (
  <div className={cn("px-6 pb-6", className)} {...props}>
    {children}
  </div>
);

const DialogFooter = ({ className, ...props }) => (
  <div className={cn("flex justify-end gap-3 px-6 pb-6", className)} {...props} />
);

const DialogClose = ({ onClose, className }) => (
  <button
    onClick={onClose}
    className={cn(
      "absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity",
      className
    )}
  >
    <X className="h-4 w-4" />
  </button>
);

export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter, DialogClose };
