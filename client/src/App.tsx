import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LabInterpretation from "@/pages/lab-interpretation";
import FemaleLabInterpretation from "@/pages/female-lab-interpretation";

function Router() {
  return (
    <Switch>
      <Route path="/" component={LabInterpretation} />
      <Route path="/female" component={FemaleLabInterpretation} />
      <Route path="/:rest*">
        {() => <LabInterpretation />}
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
