import { NavLink, useLocation } from "react-router-dom";
import {
  MessageSquare,
  Users,
  Radio,
  BarChart3,
  Settings,
  Sparkles,
  Sliders,
  Share2,
  Camera,
  Mic,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { BrandLogo } from "@/components/ui/BrandLogo";

const menuItems = [
  { title: "Messages", icon: MessageSquare, path: "/messages" },
  { title: "Contacts", icon: Users, path: "/contacts" },
  { title: "Broadcast", icon: Radio, path: "/broadcast" },
  { title: "Analytics", icon: BarChart3, path: "/analytics" },
  { title: "API Setup", icon: Settings, path: "/api-setup" },
  { title: "AI Template API", icon: Sparkles, path: "/ai-template" },
  { title: "Social Media", icon: Share2, path: "/social-media" },
  { title: "Photo Studio", icon: Camera, path: "/photo-studio" },
  { title: "ElevenLabs API", icon: Mic, path: "/elevenlabs-setup" },
  { title: "Preferences", icon: Sliders, path: "/preferences" },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <BrandLogo size="md" subtitle="Marketing Automation" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""}
                    >
                      <NavLink to={item.path} className="flex items-center gap-3">
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
