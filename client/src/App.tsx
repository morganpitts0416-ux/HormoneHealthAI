import { Switch, Route, useLocation } from "wouter";
import { useEffect, Component } from "react";
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
import SimpleLabUpload from "@/pages/simple-lab-upload";
import PatientProfiles from "@/pages/patient-profiles";
import AdminDashboard from "@/pages/admin";
import Bootstrap from "@/pages/bootstrap";
import ForgotPassword from "@/pages/forgot-password";
import SetPassword from "@/pages/set-password";
import ResetPassword from "@/pages/reset-password";
import PortalLogin from "@/pages/portal/login";
import PortalSetPassword from "@/pages/portal/set-password";
import PortalTerms from "@/pages/portal/terms";
import PortalPrivacy from "@/pages/portal/privacy";
import PortalForgotPassword from "@/pages/portal/forgot-password";
import PortalResetPassword from "@/pages/portal/reset-password";
import PortalDashboard from "@/pages/portal/dashboard";
import PortalAccount from "@/pages/portal/account";
import PortalHealthIQ from "@/pages/portal/healthiq";
import PortalSupplements from "@/pages/portal/supplements";
import PortalMessages from "@/pages/portal/messages";
import PortalForms from "@/pages/portal/forms";
import PortalCheckIn from "@/pages/portal/check-in";
import PortalLabsPage from "@/pages/portal/labs";
import PortalVisitsPage from "@/pages/portal/visits";
import PortalRecipesPage from "@/pages/portal/recipes";
import PortalRefillRequest from "@/pages/portal/refill-request";
import StaffSetPassword from "@/pages/staff-set-password";
import EncountersPage from "@/pages/encounters";
import AppointmentsPage from "@/pages/appointments";
import AccountSchedulingPage from "@/pages/account-scheduling";
import InboxPage from "@/pages/inbox";
import SpruceInboxPage from "@/pages/spruce-inbox";
import Landing from "@/pages/landing";
import FeatureLabsPage from "@/pages/feature-labs";
import FeatureDocumentationPage from "@/pages/feature-documentation";
import FeaturePatientExperiencePage from "@/pages/feature-patient-experience";
import BillingPage from "@/pages/billing";
import IntakeFormsPage from "@/pages/intake-forms";
import NoteTemplatesPage from "@/pages/note-templates";
import FormSubmissionsPage from "@/pages/form-submissions";
import FormPublicPage from "@/pages/form-public";
import FormPacketPage from "@/pages/form-packet";
import PrivacyPolicy from "@/pages/privacy";
import TermsOfService from "@/pages/terms";
import BusinessAssociateAgreement from "@/pages/baa";
import HelpCenter from "@/pages/help";
import JoinClinicPage from "@/pages/join-clinic";
import ExternalReviewerWorkspace from "@/pages/external-reviewer-workspace";
import OpsLogin from "@/pages/ops/login";
import OpsBootstrap from "@/pages/ops/bootstrap";
import OpsDashboard from "@/pages/ops/dashboard";
import { BaaGate } from "@/components/baa-gate";
import { BillingGate } from "@/components/billing-gate";
import { SessionTimeoutModal } from "@/components/session-timeout-modal";
import { GlobalLoadingProvider } from "@/hooks/use-global-loading";
import { GlobalLoadingOverlay } from "@/components/global-loading-overlay";
import { TourProvider } from "@/components/product-tour";
import { AiChatDrawer } from "@/components/ai-chat-drawer";
import { PatientContextProvider, usePatientContext } from "@/hooks/use-patient-context";
import { AppHeader } from "@/components/app-header";
import { RecordingProvider } from "@/contexts/recording-context";
import { FloatingRecorderDock } from "@/components/recording/floating-recorder-dock";
import { SoapNoteContextProvider } from "@/contexts/soap-note-context";

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

  // External chart-review-only collaborators only ever see their stripped-down
  // workspace, regardless of which route they navigate to. No billing gate
  // (they don't pay for this clinic), no recording, no AI chat, no patient
  // context — strict minimum-necessary HIPAA scope.
  if ((user as any)?.accessScope === "chart_review_only") {
    return (
      <BaaGate>
        <SessionTimeoutModal />
        <div className="h-screen flex flex-col" style={{ backgroundColor: "#f5f2ed" }}>
          <AppHeader />
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <ExternalReviewerWorkspace />
          </div>
        </div>
      </BaaGate>
    );
  }

  return (
    <BillingGate>
      <BaaGate>
        <RecordingProvider>
          <SessionTimeoutModal />
          <div className="h-screen flex flex-col" style={{ backgroundColor: "#f5f2ed" }}>
            <AppHeader />
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <Component />
            </div>
          </div>
          <ProtectedChatDrawer />
          <FloatingRecorderDock />
        </RecordingProvider>
      </BaaGate>
    </BillingGate>
  );
}

function ProtectedChatDrawer() {
  const { currentPatient } = usePatientContext();
  return <AiChatDrawer patientContext={currentPatient} />;
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
  if ((user as any)?.accessScope === "chart_review_only") {
    return (
      <BaaGate>
        <SessionTimeoutModal />
        <div className="h-screen flex flex-col" style={{ backgroundColor: "#f5f2ed" }}>
          <AppHeader />
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <ExternalReviewerWorkspace />
          </div>
        </div>
      </BaaGate>
    );
  }
  return (
    <BaaGate>
      <SessionTimeoutModal />
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f5f2ed" }}>
        <AppHeader />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Component />
        </div>
      </div>
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
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f5f2ed" }}>
      <AppHeader />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Component />
      </div>
    </div>
  );
}

// ── Top-level error boundary ──────────────────────────────────────────────────
// Catches any unhandled React render error so it shows a diagnostic instead of
// a blank white screen. Remove once the root cause is confirmed and fixed.
class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null; info: string }
> {
  state: { error: Error | null; info: string } = { error: null, info: "" };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[AppErrorBoundary] caught:", error, info.componentStack);
    this.setState({ info: info.componentStack ?? "" });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", backgroundColor: "#1a0000", color: "#ff6b6b",
          fontFamily: "monospace", padding: 32, overflowY: "auto",
        }}>
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
            ⚠ APP ERROR BOUNDARY — React render crash
          </div>
          <div style={{ backgroundColor: "#2a0000", padding: 16, borderRadius: 6, marginBottom: 16, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            <strong>{this.state.error.name}:</strong> {this.state.error.message}
          </div>
          <div style={{ fontSize: 11, color: "#ff9999", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.error.stack}
          </div>
          <div style={{ fontSize: 11, color: "#ffaa66", marginTop: 16, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            <strong>Component stack:</strong>{"\n"}{this.state.info}
          </div>
          <button
            onClick={() => this.setState({ error: null, info: "" })}
            style={{ marginTop: 24, padding: "8px 20px", backgroundColor: "#500", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            Try to recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const appSubdomain = checkAppSubdomain();

  useEffect(() => {
    if (isLoading) return;
    if (user) {
      setLocation("/dashboard");
      return;
    }
    // On app.cliniqapp.ai, unauthenticated visitors go straight to /login
    if (checkAppSubdomain()) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
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

  // On app subdomain, unauthenticated — blank while /login redirect fires
  if (checkAppSubdomain()) return null;

  // On marketing domain (cliniqapp.ai) — show the marketing homepage
  return <Landing />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/home" component={Landing} />
      <Route path="/features/labs" component={FeatureLabsPage} />
      <Route path="/features/documentation" component={FeatureDocumentationPage} />
      <Route path="/features/patient-experience" component={FeaturePatientExperiencePage} />
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
      <Route path="/simple-labs">
        {() => <ProtectedRoute component={SimpleLabUpload} />}
      </Route>
      <Route path="/patients">
        {() => <ProtectedRoute component={PatientProfiles} />}
      </Route>
      <Route path="/encounters">
        {() => <ProtectedRoute component={EncountersPage} />}
      </Route>
      <Route path="/note-templates">
        {/* Legacy URL — the page itself just redirects to /account?section=notes.
            Use BillingExemptRoute so old bookmarks always reach the redirect
            even when the clinic's subscription is paused. */}
        {() => <BillingExemptRoute component={NoteTemplatesPage} />}
      </Route>
      <Route path="/appointments">
        {() => <ProtectedRoute component={AppointmentsPage} />}
      </Route>
      <Route path="/scheduling">
        {() => <ProtectedRoute component={AppointmentsPage} />}
      </Route>
      <Route path="/account/scheduling">
        {() => <ProtectedRoute component={AccountSchedulingPage} />}
      </Route>
      <Route path="/inbox">
        {() => <ProtectedRoute component={InboxPage} />}
      </Route>
      <Route path="/spruce-inbox">
        {() => <ProtectedRoute component={SpruceInboxPage} />}
      </Route>
      <Route path="/billing">
        {() => <BillingExemptRoute component={BillingPage} />}
      </Route>
      <Route path="/intake-forms">
        {() => <ProtectedRoute component={IntakeFormsPage} />}
      </Route>
      <Route path="/form-submissions">
        {() => <ProtectedRoute component={FormSubmissionsPage} />}
      </Route>
      <Route path="/f/:token" component={FormPublicPage} />
      <Route path="/packet/:token" component={FormPacketPage} />
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
      <Route path="/portal/terms" component={PortalTerms} />
      <Route path="/portal/privacy" component={PortalPrivacy} />
      <Route path="/portal/forgot-password" component={PortalForgotPassword} />
      <Route path="/portal/reset-password" component={PortalResetPassword} />
      <Route path="/portal/dashboard" component={PortalDashboard} />
      <Route path="/portal/account" component={PortalAccount} />
      <Route path="/portal/healthiq" component={PortalHealthIQ} />
      <Route path="/portal/supplements" component={PortalSupplements} />
      <Route path="/portal/messages" component={PortalMessages} />
      <Route path="/portal/forms" component={PortalForms} />
      <Route path="/portal/check-in" component={PortalCheckIn} />
      <Route path="/portal/labs" component={PortalLabsPage} />
      <Route path="/portal/visits" component={PortalVisitsPage} />
      <Route path="/portal/recipes" component={PortalRecipesPage} />
      <Route path="/portal/refill-request" component={PortalRefillRequest} />
      <Route path="/staff-set-password" component={StaffSetPassword} />
      <Route path="/join-clinic" component={JoinClinicPage} />
      {/* ── Ops Portal — standalone, no clinician auth wrapper ── */}
      <Route path="/ops/bootstrap" component={OpsBootstrap} />
      <Route path="/ops/dashboard" component={OpsDashboard} />
      <Route path="/ops" component={OpsLogin} />
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
        <PatientContextProvider>
          <SoapNoteContextProvider>
            <TooltipProvider>
              <TourProvider>
                <FaviconSpinner />
                <GlobalLoadingOverlay />
                <Toaster />
                <AppErrorBoundary>
                  <Router />
                </AppErrorBoundary>
              </TourProvider>
            </TooltipProvider>
          </SoapNoteContextProvider>
        </PatientContextProvider>
      </GlobalLoadingProvider>
    </QueryClientProvider>
  );
}

export default App;
