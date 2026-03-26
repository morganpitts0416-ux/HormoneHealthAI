import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
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
import PortalDashboard from "@/pages/portal/dashboard";
import PortalSupplements from "@/pages/portal/supplements";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
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
  return <Component />;
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

  useEffect(() => {
    if (!isLoading) {
      setLocation(user ? "/dashboard" : "/login");
    }
  }, [user, isLoading, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-slate-400 text-sm">Loading...</div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/account">
        {() => <ProtectedRoute component={Account} />}
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
      <Route path="/admin">
        {() => <AdminRoute component={AdminDashboard} />}
      </Route>
      <Route path="/bootstrap" component={Bootstrap} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/set-password" component={SetPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/portal/login" component={PortalLogin} />
      <Route path="/portal/set-password" component={PortalSetPassword} />
      <Route path="/portal/dashboard" component={PortalDashboard} />
      <Route path="/portal/supplements" component={PortalSupplements} />
      <Route>
        {() => <RootRedirect />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
