import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Router from "./router";
import LoginPage from "@/pages/login";
import PendingApprovalPage from "@/pages/pending-approval";
import SuspendedPage from "@/pages/suspended";
import ChangePasswordPage from "@/pages/change-password";
import { IdleWarningDialog } from "@/components/IdleWarningDialog";
import { UploadQueueBanner } from "@/components/upload-queue-banner";
import { queryClient } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function AppInner() {
  const { user, loading, pendingApproval, suspended } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (suspended) {
    return <SuspendedPage />;
  }

  if (pendingApproval) {
    return <PendingApprovalPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.forcePasswordChange) {
    return <ChangePasswordPage />;
  }

  return (
    <>
      <UploadQueueBanner />
      <Router />
      <IdleWarningDialog />
    </>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <AppInner />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
