import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useIsMutating } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useSpinningFavicon } from "@/hooks/use-spinning-favicon";
import { isAppSubdomain as checkAppSubdomain, isMarketingDomain, appUrl } from "@/lib/app-url";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Dashboard from "@/pages/dashboard";
import Account from "@/pages/account";
import LabInterpretation from "@/pages/lab-interpretation";
import FemaleLabInterpretation from "@/pages/female-lab-interpretation";
import PatientProfiles from "@/pages/patient-profiles";
import AdminDashboard from "@/pages/admin";
import Bootstrap from "@/pages/bootstrap";
import ForgotPassword from "@/pages/forgot-password";
import SetPassword from "@/pages/set-password";
import ResetPassword from "@/pages/reset-password";
import PortalLogin from "@/pages/portal/login";
import PortalSetPassword from "@/pages/portal/set-password";
import PortalForgotPassword from "@/pages/portal/forgot-password";
import PortalResetPassword from "@/pages/portal/reset-password";
import PortalDashboard from "@/pages/portal/dashboard";
import PortalSupplements from "@/pages/portal/supplements";
import PortalMessages from "@/pages/portal/messages";
import StaffSetPassword from "@/pages/staff-set-password";
import EncountersPage from "@/pages/encounters";
import AppointmentsPage from "@/pages/appointments";
import Landing from "@/pages/landing";
import BillingPage from "@/pages/billing";
import IntakeFormsPage from "@/pages/intake-forms";
import FormPublicPage from "@/pages/form-public";
import PrivacyPolicy from "@/pages/privacy";
import TermsOfService from "@/pages/terms";
import BusinessAssociateAgreement from "@/pages/baa";
import HelpCenter from "@/pages/help";
import { BaaGate } from "@/components/baa-gate";
import { BillingGate } from "@/components/billing-gate";
import { SessionTimeoutModal } from "@/components/session-timeout-modal";
import { GlobalLoadingProvider } from "@/hooks/use-global-loading";
import { GlobalLoadingOverlay } from "@/components/global-loading-overlay";
import { TourProvider } from "@/components/product-tour";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // On the marketing domain, all app routes redirect to the app subdomain
    if (isMarketingDomain()) {
      window.location.href = appUrl(window.location.pathname);
      return;
    }
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return null;
  return (
    <BillingGate>
      <BaaGate>
        <SessionTimeoutModal />
        <Component />
      </BaaGate>
    </BillingGate>
  );
}

function BillingExemptRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isMarketingDomain()) {
      window.location.href = appUrl(window.location.pathname);
      return;
    }
    if (!isLoading && !user) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) return null;
  return (
    <BaaGate>
      <SessionTimeoutModal />
      <Component />
    </BaaGate>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) setLocation("/login");
      else if ((user as any).role !== "admin") setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (!user || (user as any).role !== "admin") return null;
  return <Component />;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const appSubdomain = checkAppSubdomain();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      setLocation("/dashboard");
    } else if (appSubdomain) {
      // app.realignlabeval.com — unauthenticated users go straight to login
      setLocation("/login");
    }
  }, [user, isLoading, appSubdomain, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-sm" style={{ color: "#9aaa84" }}>Loading…</div>
      </div>
    );
  }

  // app subdomain — briefly shown while redirect to /login fires
  if (appSubdomain && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-sm" style={{ color: "#9aaa84" }}>Loading…</div>
      </div>
    );
  }

  // Authenticated — briefly shown while redirect to /dashboard fires
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-sm" style={{ color: "#9aaa84" }}>Redirecting…</div>
      </div>
    );
  }

  // Main domain — unauthenticated users see the marketing homepage
  return <Landing />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/home" component={Landing} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsOfService} />
      <Route path="/baa" component={BusinessAssociateAgreement} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/account">
        {() => <BillingExemptRoute component={Account} />}
      </Route>
      <Route path="/male">
        {() => <ProtectedRoute component={LabInterpretation} />}
      </Route>
      <Route path="/female">
        {() => <ProtectedRoute component={FemaleLabInterpretation} />}
      </Route>
      <Route path="/patients">
        {() => <ProtectedRoute component={PatientProfiles} />}
      </Route>
      <Route path="/encounters">
        {() => <ProtectedRoute component={EncountersPage} />}
      </Route>
      <Route path="/appointments">
        {() => <ProtectedRoute component={AppointmentsPage} />}
      </Route>
      <Route path="/billing">
        {() => <BillingExemptRoute component={BillingPage} />}
      </Route>
      <Route path="/intake-forms">
        {() => <ProtectedRoute component={IntakeFormsPage} />}
      </Route>
      <Route path="/f/:token" component={FormPublicPage} />
      <Route path="/help">
        {() => <ProtectedRoute component={HelpCenter} />}
      </Route>
      <Route path="/admin">
        {() => <AdminRoute component={AdminDashboard} />}
      </Route>
      <Route path="/bootstrap" component={Bootstrap} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/set-password" component={SetPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/portal/login" component={PortalLogin} />
      <Route path="/portal/set-password" component={PortalSetPassword} />
      <Route path="/portal/forgot-password" component={PortalForgotPassword} />
      <Route path="/portal/reset-password" component={PortalResetPassword} />
      <Route path="/portal/dashboard" component={PortalDashboard} />
      <Route path="/portal/supplements" component={PortalSupplements} />
      <Route path="/portal/messages" component={PortalMessages} />
      <Route path="/staff-set-password" component={StaffSetPassword} />
      <Route>
        {() => <RootRedirect />}
      </Route>
    </Switch>
  );
}

function FaviconSpinner() {
  const mutating = useIsMutating();
  useSpinningFavicon(mutating > 0);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalLoadingProvider>
        <TooltipProvider>
          <TourProvider>
            <FaviconSpinner />
            <GlobalLoadingOverlay />
            <Toaster />
            <Router />
          </TourProvider>
        </TooltipProvider>
      </GlobalLoadingProvider>
    </QueryClientProvider>
  );
}

export default App;
