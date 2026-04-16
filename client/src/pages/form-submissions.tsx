import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Search,
  ClipboardList,
  Check,
  Calendar,
  X,
  Trash2,
  Loader2,
  FileText,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FormSubmissionPreviewDialog } from "@/components/form-submission-preview";

interface SubmissionRow {
  id: number;
  formId: number;
  formName: string;
  submitterName: string | null;
  submitterEmail: string | null;
  submittedAt: string;
  reviewStatus: string;
  syncStatus: string;
  status: string;
  patientId: number | null;
}

function formatDate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: string) {
  const date = new Date(d);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function FormSubmissionsPage() {
  const [, setLocation] = useLocation();
  const [nameFilter, setNameFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "reviewed">("all");
  const [previewSubId, setPreviewSubId] = useState<number | null>(null);

  const { data: user } = useQuery<any>({ queryKey: ["/api/user"] });

  const { data: submissions = [], isLoading } = useQuery<SubmissionRow[]>({
    queryKey: ["/api/intake-forms/submissions/all"],
  });

  const { toast } = useToast();

  const markReviewedMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("PATCH", `/api/intake-forms/submissions/${submissionId}/review`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/pending"] });
    },
  });

  const deleteSubmissionMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("DELETE", `/api/form-submissions/${submissionId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/pending"] });
      toast({ title: "Form submission deleted" });
    },
    onError: () => toast({ title: "Failed to delete submission", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let result = submissions;

    if (nameFilter.trim()) {
      const q = nameFilter.toLowerCase();
      result = result.filter(
        (s) =>
          (s.submitterName ?? "").toLowerCase().includes(q) ||
          (s.submitterEmail ?? "").toLowerCase().includes(q) ||
          (s.formName ?? "").toLowerCase().includes(q)
      );
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter + "T00:00:00");
      result = result.filter((s) => {
        const subDate = new Date(s.submittedAt);
        return (
          subDate.getFullYear() === filterDate.getFullYear() &&
          subDate.getMonth() === filterDate.getMonth() &&
          subDate.getDate() === filterDate.getDate()
        );
      });
    }

    if (statusFilter === "pending") {
      result = result.filter((s) => s.reviewStatus === "pending");
    } else if (statusFilter === "reviewed") {
      result = result.filter((s) => s.reviewStatus === "reviewed");
    }

    return result;
  }, [submissions, nameFilter, dateFilter, statusFilter]);

  const pendingCount = submissions.filter((s) => s.reviewStatus === "pending").length;

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f5f2ed" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>
              Form Submissions
            </h1>
            <p className="text-xs" style={{ color: "#7a8a64" }}>
              {submissions.length} total · {pendingCount} pending review
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or form..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="pl-8 h-9 text-sm"
                  data-testid="input-filter-name"
                />
              </div>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="pl-8 h-9 text-sm w-[170px]"
                  data-testid="input-filter-date"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant={statusFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("all")}
                  style={statusFilter === "all" ? { backgroundColor: "#2e3a20", color: "#fff" } : {}}
                  data-testid="button-filter-all"
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("pending")}
                  style={statusFilter === "pending" ? { backgroundColor: "#4a5568", color: "#fff" } : {}}
                  data-testid="button-filter-pending"
                >
                  Pending
                </Button>
                <Button
                  variant={statusFilter === "reviewed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("reviewed")}
                  style={statusFilter === "reviewed" ? { backgroundColor: "#5a7040", color: "#fff" } : {}}
                  data-testid="button-filter-reviewed"
                >
                  Reviewed
                </Button>
              </div>
              {(nameFilter || dateFilter || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setNameFilter("");
                    setDateFilter("");
                    setStatusFilter("all");
                  }}
                  data-testid="button-clear-filters"
                >
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#7a8a64" }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <ClipboardList className="w-8 h-8 mb-2" style={{ color: "#c4b9a5" }} />
                <p className="text-sm font-medium" style={{ color: "#7a8a64" }}>
                  {submissions.length === 0 ? "No submissions yet" : "No submissions match your filters"}
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[calc(100vh-280px)]">
                <div className="divide-y" style={{ borderColor: "#f0ece5" }}>
                  {filtered.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                      style={{ backgroundColor: "transparent" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f9f7f3")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      onClick={() => setPreviewSubId(sub.id)}
                      data-testid={`submission-row-${sub.id}`}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{ backgroundColor: "#e8e4f0", color: "#4a5568" }}
                      >
                        {(sub.submitterName?.trim()?.[0] ?? "A").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                            {sub.submitterName ?? "Anonymous"}
                          </p>
                          {sub.reviewStatus === "pending" ? (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: "#4a5568", color: "#eef0ff" }}>
                              Pending
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0" style={{ backgroundColor: "#e8f5e9", color: "#2e7d32" }}>
                              Reviewed
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs truncate" style={{ color: "#7a8a64" }}>
                          {sub.formName}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs" style={{ color: "#7a8a64" }}>{formatDate(sub.submittedAt)}</p>
                          <p className="text-[10px]" style={{ color: "#a0a880" }}>{formatTime(sub.submittedAt)}</p>
                        </div>
                        {sub.reviewStatus === "pending" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              markReviewedMutation.mutate(sub.id);
                            }}
                            disabled={markReviewedMutation.isPending}
                            data-testid={`button-dismiss-${sub.id}`}
                          >
                            <Check className="h-3.5 w-3.5" style={{ color: "#5a7040" }} />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm("Delete this form submission? This cannot be undone.")) {
                              deleteSubmissionMutation.mutate(sub.id);
                            }
                          }}
                          disabled={deleteSubmissionMutation.isPending}
                          data-testid={`button-delete-${sub.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <FormSubmissionPreviewDialog
        submissionId={previewSubId}
        onClose={() => setPreviewSubId(null)}
        clinic={{
          clinicName: user?.clinicName ?? "ClinIQ",
          clinicLogo: user?.clinicLogo ?? null,
          phone: user?.phone ?? null,
          address: user?.address ?? null,
          email: user?.email ?? null,
        }}
      />
    </div>
  );
}
