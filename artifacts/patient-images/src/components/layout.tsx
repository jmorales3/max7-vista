import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Image as ImageIcon,
  Camera,
  Settings,
  BookOpen,
  LogOut,
  MonitorPlay,
  ShieldCheck,
  FolderUp,
  LayoutTemplate,
  Library,
  Tags,
  ClipboardList,
  BrainCircuit,
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

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const navItems = [
    { title: t("nav.patients"), url: "/patients", icon: Users },
    { title: t("nav.capture"), url: "/capture", icon: Camera },
    { title: t("nav.gallery"), url: "/gallery", icon: ImageIcon },
    { title: t("nav.library"), url: "/library", icon: Library },
    { title: t("nav.presentations"), url: "/presentations", icon: MonitorPlay },
    { title: t("nav.templates"), url: "/templates", icon: LayoutTemplate },
    { title: t("nav.bulkImport"), url: "/import", icon: FolderUp },
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
          src="/max7-vista-logo.png?v=2"
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

        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.clinicalTools")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location.startsWith("/cephalometrics")}
                >
                  <Link href="/cephalometrics">
                    <BrainCircuit />
                    <span>{t("nav.cephalometrics")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.administration")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin/users"}
                  >
                    <Link href="/admin/users">
                      <ShieldCheck />
                      <span>{t("nav.userManagement")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin/tags"}
                  >
                    <Link href="/admin/tags">
                      <Tags />
                      <span>{t("nav.tagManagement")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin/audit-log"}
                  >
                    <Link href="/admin/audit-log">
                      <ClipboardList />
                      <span>{t("nav.auditLog")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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

function TrialBanner() {
  const { t } = useTranslation();
  const isElectron = typeof window !== "undefined" && !!(window as unknown as { electronAPI?: unknown }).electronAPI;
  const { data } = useQuery<{ state: string; daysLeft: number | null }>({
    queryKey: ["license-status-banner"],
    queryFn: async () => {
      const res = await fetch("/api/license/status", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isElectron,
    staleTime: 60_000,
    retry: false,
  });

  if (!isElectron || !data) return null;
  if (data.state !== "trial" && data.state !== "trial_expired") return null;

  const isExpired = data.state === "trial_expired";

  return (
    <div
      className={`border-b px-4 py-2 text-sm flex items-center justify-between gap-2 no-print ${
        isExpired
          ? "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400"
          : "bg-yellow-500/10 border-yellow-500/20 text-yellow-800 dark:text-yellow-400"
      }`}
    >
      <span>
        {isExpired
          ? t("license.bannerExpired")
          : t("license.bannerTrial", { count: data.daysLeft ?? 0 })}
      </span>
      <Link
        href="/settings"
        className="text-xs font-semibold underline underline-offset-2 shrink-0"
      >
        {t("license.bannerActivate")}
      </Link>
    </div>
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
          <TrialBanner />
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
      <div className="no-print">
        <ChatBot />
      </div>
    </SidebarProvider>
  );
}
