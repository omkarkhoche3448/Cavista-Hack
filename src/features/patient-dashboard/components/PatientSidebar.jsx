import { NavLink } from "react-router-dom";
import { Heart, FileText, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/features/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", icon: LayoutDashboard, path: "/patient/dashboard" },
  { title: "My Health", icon: Heart, path: "/patient/health" },
  { title: "My Documents", icon: FileText, path: "/patient/documents" },
];

export default function PatientSidebar() {
  const { profile } = useAuth();
  const initials =
    (profile?.first_name?.[0] || "") + (profile?.last_name?.[0] || "");

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar/50 backdrop-blur-xl">
      <SidebarHeader className="p-6 border-b border-sidebar-border/60 mb-2">
        <div className="flex items-center gap-4 transition-all duration-300">
          <Avatar className="h-10 w-10 ring-2 ring-primary/10 shadow-sm">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-black uppercase tracking-tighter">
              {initials || "P"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-tight leading-tight">
              {profile?.first_name || "Patient"}
            </span>
            <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] italic">Patient Portal</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 mb-4 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">
            Main Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild className="h-11 rounded-xl transition-all duration-300">
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 px-4 w-full h-full font-bold text-sm transition-all duration-300",
                          isActive
                            ? "bg-primary/10 text-primary border-l-2 border-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className="mt-auto p-4">
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary italic">Live Support</p>
          <p className="text-xs text-muted-foreground font-medium italic leading-relaxed">Need help? Our AI clinical assistants are standing by.</p>
        </div>
      </div>
    </Sidebar>
  );
}
