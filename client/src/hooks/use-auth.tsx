import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useLocation } from "wouter";

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  title: string;
  clinicName: string;
  npi?: string | null;
  phone?: string | null;
  address?: string | null;
  role?: string | null;
  // Staff-specific fields (present only when a staff member is logged in)
  isStaff?: boolean;
  staffId?: number;
  staffFirstName?: string;
  staffLastName?: string;
  staffRole?: string;
  // Active clinic context (server resolves from session override or default)
  activeClinicId?: number | null;
  // Membership in the *active* clinic — drives the external-reviewer workspace
  clinicalRole?: string;
  adminRole?: string;
  accessScope?: "full" | "chart_review_only";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      setLocation("/dashboard");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      setLocation("/login");
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      username: string;
      password: string;
      firstName: string;
      lastName: string;
      title: string;
      npi?: string;
      clinicName: string;
      phone?: string;
      address?: string;
    }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      setLocation("/dashboard");
    },
  });

  return {
    user: user ?? null,
    isLoading,
    loginMutation,
    logoutMutation,
    registerMutation,
  };
}
