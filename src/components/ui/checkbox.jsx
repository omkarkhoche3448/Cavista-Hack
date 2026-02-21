import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const Checkbox = React.forwardRef(function CheckboxComponent(
    { className, checked, onCheckedChange, ...props },
    ref
) {
    return (
        <button
            ref={ref}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onCheckedChange?.(!checked)}
            className={cn(
                "peer h-5 w-5 shrink-0 rounded-md border border-primary ring-offset-background",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "transition-all duration-150 flex items-center justify-center",
                checked
                    ? "bg-primary border-primary text-primary-foreground"
                    : "bg-background hover:border-primary/50",
                className
            )}
            {...props}
        >
            {checked && <Check className="h-3.5 w-3.5 text-current" strokeWidth={3} />}
        </button>
    );
});

export { Checkbox };
