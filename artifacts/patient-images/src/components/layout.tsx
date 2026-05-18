import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Users,
  Image as ImageIcon,
  Camera,
  Settings,
  BookOpen,
  LogOut,
  MonitorPlay,
} from "lucide-react";
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
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { LanguageSelector } from "./LanguageSelector";
import { ChatBot } from "./ChatBot";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const navItems = [
    { title: t("nav.patients"), url: "/patients", icon: Users },
    { title: t("nav.capture"), url: "/capture", icon: Camera },
    { title: t("nav.gallery"), url: "/gallery", icon: ImageIcon },
    { title: t("nav.presentations"), url: "/presentations", icon: MonitorPlay },
    { title: t("nav.settings"), url: "/settings", icon: Settings },
    { title: t("nav.manual"), url: "/manual", icon: BookOpen },
  ];

  return (
    <Sidebar>
      <SidebarHeader
        className="border-b px-3 py-2"
        style={{ background: "linear-gradient(135deg, #0a1628 0%, #0d2145 100%)" }}
      >
        <img
          src="/max7-vista-logo.png"
          alt="Max7 Vista"
          className="w-full h-auto"
          style={{ mixBlendMode: "screen" }}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.menu")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      location.startsWith(item.url) ||
                      (location === "/" && item.url === "/patients")
                    }
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {user && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={logout}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <LogOut />
                    <span>{t("auth.logout")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t px-2 py-2 space-y-2">
        {user && (
          <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-sidebar-accent/30">
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-xs font-medium text-sidebar-foreground truncate">
                {user.username}
              </span>
              <span className="text-[10px] text-sidebar-foreground/50 truncate capitalize">
                {user.role}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:text-destructive"
              onClick={logout}
              title={t("auth.logout")}
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <LanguageSelector />
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b flex items-center px-4 md:hidden">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      <ChatBot />
    </SidebarProvider>
  );
}
