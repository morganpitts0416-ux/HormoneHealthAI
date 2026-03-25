import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Users,
  Search,
  LogOut,
  User,
  FlaskConical,
  HeartPulse,
  ChevronRight,
  Calendar,
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
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm leading-tight">{user?.clinicName}</p>
              <p className="text-xs text-slate-500 leading-tight">{user?.title} {user?.firstName} {user?.lastName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              data-testid="button-account"
              variant="ghost"
              size="default"
              onClick={() => setLocation("/account")}
              className="text-slate-600"
            >
              <User className="w-4 h-4 mr-2" />
              Account
            </Button>
            <Button
              data-testid="button-logout"
              variant="ghost"
              size="default"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="text-slate-600"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">
            {getGreeting()}, {user?.title} {user?.lastName}
          </h1>
          <p className="text-slate-500 mt-1">What would you like to do today?</p>
        </div>

        {/* Primary action cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          <Card
            data-testid="card-male-eval"
            className="cursor-pointer hover-elevate border-slate-200 overflow-hidden"
            onClick={() => setLocation("/male")}
          >
            <div className="h-1.5 bg-blue-600 w-full" />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FlaskConical className="w-6 h-6 text-blue-600" />
                </div>
                <Badge variant="secondary" className="text-xs">Men's Clinic</Badge>
              </div>
              <CardTitle className="text-lg mt-3 text-slate-900">Male Lab Evaluation</CardTitle>
              <CardDescription className="text-sm">
                Testosterone optimization, metabolic panels, cardiovascular risk, PSA, thyroid, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                data-testid="button-start-male"
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Begin Evaluation
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>

          <Card
            data-testid="card-female-eval"
            className="cursor-pointer hover-elevate border-slate-200 overflow-hidden"
            onClick={() => setLocation("/female")}
          >
            <div className="h-1.5 bg-rose-500 w-full" />
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="w-12 h-12 rounded-lg bg-rose-50 flex items-center justify-center">
                  <HeartPulse className="w-6 h-6 text-rose-500" />
                </div>
                <Badge variant="secondary" className="text-xs">Women's Clinic</Badge>
              </div>
              <CardTitle className="text-lg mt-3 text-slate-900">Female Lab Evaluation</CardTitle>
              <CardDescription className="text-sm">
                Hormonal assessment, SHBG, AMH, menstrual phase context, thyroid, metabolic, and more
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                data-testid="button-start-female"
                className="w-full bg-rose-500 hover:bg-rose-600"
              >
                Begin Evaluation
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Patient management */}
        <div className="space-y-5">
          {/* Stats row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-500" />
              Patient Records
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-slate-600">
                {patients.length} total
              </Badge>
              {maleCount > 0 && (
                <Badge variant="outline" className="text-blue-600 border-blue-200">
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

          {/* Search + All Patients */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
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

          {/* Patient list */}
          {patientsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : displayedPatients.length === 0 ? (
            <Card className="border-dashed border-slate-200">
              <CardContent className="py-10 text-center">
                {searchQuery.length >= 2 ? (
                  <>
                    <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No patients found</p>
                    <p className="text-slate-400 text-sm mt-1">Try a different search term</p>
                  </>
                ) : (
                  <>
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">No patients yet</p>
                    <p className="text-slate-400 text-sm mt-1">
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
                  className="cursor-pointer hover-elevate border-slate-200"
                  onClick={() => setLocation("/patients")}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
                          patient.gender === 'male' ? 'bg-blue-600' : 'bg-rose-500'
                        }`}>
                          {patient.firstName[0]}{patient.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">
                            {patient.firstName} {patient.lastName}
                          </p>
                          <p className="text-xs text-slate-400 capitalize">{patient.gender}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />
                        {new Date(patient.updatedAt).toLocaleDateString()}
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!searchQuery && patients.length > 8 && (
                <Button
                  variant="ghost"
                  className="w-full text-slate-500"
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
