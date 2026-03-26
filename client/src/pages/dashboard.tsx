import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Search,
  LogOut,
  User,
  FlaskConical,
  HeartPulse,
  ChevronRight,
  Calendar,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { Patient } from "@shared/schema";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: patients = [], isLoading: patientsLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients/search"],
    queryFn: async () => {
      const res = await fetch("/api/patients/search", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load patients");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  const { data: searchResults = [], isLoading: searchLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients/search", searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(searchQuery)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searchQuery.length >= 2,
    staleTime: 10 * 1000,
  });

  const displayedPatients = searchQuery.length >= 2 ? searchResults : patients.slice(0, 8);
  const maleCount = patients.filter((p) => p.gender === "male").length;
  const femaleCount = patients.filter((p) => p.gender === "female").length;

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <img
              src="/realign-health-logo.png"
              alt="ReAlign Health"
              className="h-12 sm:h-14 w-auto flex-shrink-0"
              style={{ mixBlendMode: "multiply" }}
            />
            <div className="h-5 w-px hidden sm:block" style={{ backgroundColor: "#c4b9a5" }} />
            <div className="hidden sm:block">
              <p className="text-sm font-medium leading-tight" style={{ color: "#1c2414" }}>{user?.clinicName}</p>
              <p className="text-xs leading-tight" style={{ color: "#7a8a64" }}>{user?.title} {user?.firstName} {user?.lastName}</p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            {(user as any)?.role === "admin" && (
              <Button
                data-testid="button-admin"
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/admin")}
                className="sm:w-auto sm:px-3"
                style={{ color: "#2e3a20" }}
                title="Admin"
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline ml-2">Admin</span>
              </Button>
            )}
            <Button
              data-testid="button-account"
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/account")}
              className="sm:w-auto sm:px-3"
              style={{ color: "#2e3a20" }}
              title="Account"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Account</span>
            </Button>
            <Button
              data-testid="button-logout"
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="sm:w-auto sm:px-3"
              style={{ color: "#2e3a20" }}
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            {getGreeting()}, {user?.title} {user?.lastName}
          </h1>
          <p className="text-muted-foreground mt-1">What would you like to do today?</p>
        </div>

        {/* Primary action cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <Card
            data-testid="card-male-eval"
            className="cursor-pointer hover-elevate overflow-hidden"
            onClick={() => setLocation("/male")}
          >
            <div className="h-1 bg-[#4a6741] w-full" />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FlaskConical className="w-5 h-5 text-primary" />
                </div>
                <Badge variant="secondary" className="text-xs">Men's Clinic</Badge>
              </div>
              <CardTitle className="text-lg mt-3">Male Lab Evaluation</CardTitle>
              <CardDescription className="text-sm">
                Testosterone optimization, metabolic panels, cardiovascular risk, PSA, thyroid, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                data-testid="button-start-male"
                className="w-full"
              >
                Begin Evaluation
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card
            data-testid="card-female-eval"
            className="cursor-pointer hover-elevate overflow-hidden"
            onClick={() => setLocation("/female")}
          >
            <div className="h-1 bg-rose-400 w-full" />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="w-11 h-11 rounded-lg bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center">
                  <HeartPulse className="w-5 h-5 text-rose-500" />
                </div>
                <Badge variant="secondary" className="text-xs">Women's Clinic</Badge>
              </div>
              <CardTitle className="text-lg mt-3">Female Lab Evaluation</CardTitle>
              <CardDescription className="text-sm">
                Hormonal assessment, SHBG, AMH, menstrual phase context, thyroid, metabolic, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                data-testid="button-start-female"
                variant="outline"
                className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
              >
                Begin Evaluation
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Patient management */}
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Patient Records
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{patients.length} total</Badge>
              {maleCount > 0 && (
                <Badge variant="outline" className="text-primary border-primary/30">
                  {maleCount} male
                </Badge>
              )}
              {femaleCount > 0 && (
                <Badge variant="outline" className="text-rose-500 border-rose-200">
                  {femaleCount} female
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-patient-search"
                placeholder="Search patients by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              data-testid="button-all-patients"
              variant="outline"
              onClick={() => setLocation("/patients")}
            >
              <Users className="w-4 h-4 mr-2" />
              All Patients
            </Button>
          </div>

          {patientsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : displayedPatients.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                {searchQuery.length >= 2 ? (
                  <>
                    <Search className="w-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-foreground font-medium">No patients found</p>
                    <p className="text-muted-foreground text-sm mt-1">Try a different search term</p>
                  </>
                ) : (
                  <>
                    <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-foreground font-medium">No patients yet</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      Patient profiles are created automatically when you run a lab evaluation
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {displayedPatients.map((patient) => (
                <Card
                  key={patient.id}
                  data-testid={`card-patient-${patient.id}`}
                  className="cursor-pointer hover-elevate"
                  onClick={() => setLocation("/patients")}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${
                          patient.gender === 'male' ? 'bg-primary' : 'bg-rose-500'
                        }`}>
                          {patient.firstName[0]}{patient.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {patient.firstName} {patient.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {patient.gender === 'male' ? "Men's Clinic" : "Women's Clinic"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {new Date(patient.updatedAt).toLocaleDateString()}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!searchQuery && patients.length > 8 && (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={() => setLocation("/patients")}
                  data-testid="button-view-all"
                >
                  View all {patients.length} patients
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
