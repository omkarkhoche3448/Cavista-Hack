import * as React from "react";
import { cn } from "@/lib/utils";

const TabsContext = React.createContext(null);

function Tabs({ defaultValue, value, onValueChange, children, className, ...props }) {
  const [activeTab, setActiveTab] = React.useState(value || defaultValue || "");

  React.useEffect(() => {
    if (value !== undefined) setActiveTab(value);
  }, [value]);

  const handleChange = (val) => {
    setActiveTab(val);
    onValueChange?.(val);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleChange }}>
      <div className={cn("", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ value, className, ...props }) {
  const { activeTab, setActiveTab } = React.useContext(TabsContext);
  const isActive = activeTab === value;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "hover:bg-background/50 hover:text-foreground",
        className
      )}
      onClick={() => setActiveTab(value)}
      {...props}
    />
  );
}

function TabsContent({ value, className, ...props }) {
  const { activeTab } = React.useContext(TabsContext);
  if (activeTab !== value) return null;

  return (
    <div
      className={cn("mt-2 ring-offset-background focus-visible:outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
