import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Trash2, Users, Activity, ShieldCheck,
  MoreVertical, Building2, Mail, Phone, User, Lock, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TITLES = ["MD", "DO", "NP", "NP-C", "FNP-C", "APRN", "PA", "PA-C", "RN", "PharmD", "Other"];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#2e3a20", bg: "#dcefd0" },
  trial: { label: "Trial", color: "#7c5c00", bg: "#fef3c7" },
  grandfathered: { label: "Grandfathered", color: "#1e3a5f", bg: "#dbeafe" },
  suspended: { label: "Suspended", color: "#7f1d1d", bg: "#fee2e2" },
};

const createClinicianSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().min(1, "Required"),
  title: z.string().min(1, "Required"),
  email: z.string().email("Valid email required"),
  clinicName: z.string().min(1, "Required"),
  username: z.string().min(3).regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dots, hyphens only"),
  npi: z.string().optional(),
  phone: z.string().optional(),
  subscriptionStatus: z.string().default("active"),
  freeAccount: z.boolean().default(false),
  notes: z.string().optional(),
});
type CreateClinicianForm = z.infer<typeof createClinicianSchema>;

type Clinician = {
  id: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  title: string;
  clinicName: string;
  phone: string | null;
  npi: string | null;
  role: string;
  subscriptionStatus: string;
  freeAccount: boolean;
  notes: string | null;
  createdAt: string;
  patientCount: number;
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "#555", bg: "#eee" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ color: cfg.color, backgroundColor: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

export default function AdminDashboard() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Clinician | null>(null);
  const [editStatusTarget, setEditStatusTarget] = useState<Clinician | null>(null);
  const [editNotes, setEditNotes] = useState("");

  const { data: clinicians = [], isLoading } = useQuery<Clinician[]>({
    queryKey: ["/api/admin/clinicians"],
    queryFn: async () => {
      const res = await fetch("/api/admin/clinicians", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load clinicians");
      return res.json();
    },
    staleTime: 15 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateClinicianForm) => {
      const res = await fetch("/api/admin/clinicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clinicians"] });
      setShowCreate(false);
      form.reset();
      toast({ title: "Account created", description: "An invite email has been sent so they can set their password." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, subscriptionStatus, freeAccount, notes }: { id: number; subscriptionStatus: string; freeAccount: boolean; notes: string }) => {
      const res = await fetch(`/api/admin/clinicians/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subscriptionStatus, freeAccount, notes }),
      });
      if (!res.ok) throw new Error("Update failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clinicians"] });
      setEditStatusTarget(null);
      toast({ title: "Updated" });
    },
    onError: () => toast({ title: "Error", description: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/clinicians/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/clinicians"] });
      setDeleteTarget(null);
      toast({ title: "Account deleted" });
    },
    onError: () => toast({ title: "Error", description: "Delete failed", variant: "destructive" }),
  });

  const form = useForm<CreateClinicianForm>({
    resolver: zodResolver(createClinicianSchema),
    defaultValues: {
      firstName: "", lastName: "", title: "", email: "", clinicName: "",
      username: "", npi: "", phone: "", subscriptionStatus: "active", freeAccount: false, notes: "",
    },
  });

  const stats = {
    total: clinicians.length,
    active: clinicians.filter(c => c.subscriptionStatus === "active").length,
    totalPatients: clinicians.reduce((sum, c) => sum + c.patientCount, 0),
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-sm w-full mx-4">
          <CardHeader>
            <CardTitle className="text-base">Access Restricted</CardTitle>
            <CardDescription>You don't have permission to view this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setLocation("/dashboard")} className="w-full">Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Button
              variant="ghost" size="icon"
              onClick={() => setLocation("/dashboard")}
              style={{ color: "#2e3a20" }}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img
              src="/realign-health-logo.png"
              alt="ReAlign Health"
              className="h-14 sm:h-16 w-auto flex-shrink-0"
              style={{ mixBlendMode: "multiply" }}
            />
            <div className="h-4 w-px hidden sm:block" style={{ backgroundColor: "#c4b9a5" }} />
            <div className="hidden sm:flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="font-medium text-sm" style={{ color: "#2e3a20" }}>Developer Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-xs" style={{ color: "#7a8a64" }}>
            <span className="hidden sm:inline">Signed in as <strong>{user.username}</strong></span>
            <Button variant="ghost" size="sm" style={{ color: "#2e3a20" }} onClick={() => logoutMutation.mutate()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Clinician Accounts", value: stats.total, icon: Users },
            { label: "Active Subscriptions", value: stats.active, icon: Activity },
            { label: "Total Patients", value: stats.totalPatients, icon: Building2 },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-2xl font-semibold mt-0.5" style={{ color: "#1c2414" }}>{value}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#e8ddd0" }}>
                    <Icon className="w-4 h-4" style={{ color: "#2e3a20" }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Clinician accounts table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Clinician Accounts</CardTitle>
              <CardDescription>Manually manage provider access to the platform</CardDescription>
            </div>
            <Button onClick={() => setShowCreate(true)} data-testid="button-add-clinician">
              <Plus className="w-4 h-4 mr-2" />
              Add Clinician
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading accounts...</div>
            ) : clinicians.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Users className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">No clinician accounts yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Click "Add Clinician" to create the first account.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ backgroundColor: "#faf8f5" }}>
                      <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground">Provider</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Clinic</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Contact</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Patients</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Joined</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {clinicians.map((c, i) => (
                      <tr
                        key={c.id}
                        className="border-b last:border-0"
                        style={{ backgroundColor: i % 2 === 0 ? "white" : "#fdfcfb" }}
                        data-testid={`row-clinician-${c.id}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                              style={{ backgroundColor: "#2e3a20", color: "white" }}
                            >
                              {c.firstName[0]}{c.lastName[0]}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium leading-tight" style={{ color: "#1c2414" }}>
                                  {c.title} {c.firstName} {c.lastName}
                                </p>
                                {c.role === "admin" && (
                                  <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: "#2e3a20", color: "white" }}>
                                    Owner
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">@{c.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm" style={{ color: "#1c2414" }}>{c.clinicName}</p>
                          {c.npi && <p className="text-xs text-muted-foreground">NPI: {c.npi}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-xs text-muted-foreground">{c.email}</p>
                          {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="font-medium" style={{ color: "#2e3a20" }}>{c.patientCount}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <StatusBadge status={c.subscriptionStatus} />
                            {c.freeAccount && (
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}
                              >
                                Free
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-xs text-muted-foreground">
                            {new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-menu-${c.id}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditStatusTarget(c);
                                  setEditNotes(c.notes ?? "");
                                }}
                              >
                                Edit status / notes
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(c)}
                              >
                                Delete account
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes section for clinician notes */}
        <div className="text-xs text-muted-foreground text-center pb-4">
          All patient data is isolated per clinician account. Deleting an account permanently removes all associated patient records.
        </div>
      </main>

      {/* Create clinician dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Clinician Account</DialogTitle>
            <DialogDescription>
              An invite email will be sent to the clinician so they can set their own password and activate their account.
              Their account status is set to <strong>Active</strong> by default.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl><Input placeholder="Jane" data-testid="input-create-firstName" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl><Input placeholder="Smith" data-testid="input-create-lastName" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-create-title"><SelectValue placeholder="Select" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TITLES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="npi" render={({ field }) => (
                  <FormItem>
                    <FormLabel>NPI <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="1234567890" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="clinicName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Clinic Name *</FormLabel>
                  <FormControl><Input placeholder="Optimal Health Clinic" data-testid="input-create-clinicName" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl><Input type="email" placeholder="jane@clinic.com" data-testid="input-create-email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone <span className="text-muted-foreground font-normal text-xs">(optional)</span></FormLabel>
                    <FormControl><Input placeholder="(555) 555-0100" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Login Credentials</p>
                <FormField control={form.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Username *</FormLabel>
                    <FormControl><Input placeholder="jane.smith" data-testid="input-create-username" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <p className="text-xs text-muted-foreground mt-2">
                  Password will be set by the clinician via the invite link sent to their email.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="subscriptionStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subscription Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="trial">Trial</SelectItem>
                        <SelectItem value="grandfathered">Grandfathered</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="freeAccount" render={({ field }) => (
                <FormItem>
                  <div className="flex items-start gap-3 rounded-md border p-3">
                    <FormControl>
                      <Checkbox
                        id="create-freeAccount"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-freeAccount"
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel htmlFor="create-freeAccount" className="cursor-pointer leading-snug">
                        Complimentary Access
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Grants full platform access at no charge. The billing page will show "Complimentary Access" and no payment method will be required.
                      </p>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes <span className="text-muted-foreground font-normal text-xs">(admin only)</span></FormLabel>
                  <FormControl><Textarea placeholder="e.g. Referred by Dr. Jones, agreed on 3-month trial..." className="resize-none text-sm" rows={2} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-submit">
                  {createMutation.isPending ? "Creating..." : "Create Account"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit status dialog */}
      {editStatusTarget && (
        <Dialog open={!!editStatusTarget} onOpenChange={() => setEditStatusTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Account</DialogTitle>
              <DialogDescription>
                {editStatusTarget.title} {editStatusTarget.firstName} {editStatusTarget.lastName} — {editStatusTarget.clinicName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Subscription Status</label>
                <Select
                  value={editStatusTarget.subscriptionStatus}
                  onValueChange={(v) => setEditStatusTarget({ ...editStatusTarget, subscriptionStatus: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="grandfathered">Grandfathered</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="edit-freeAccount"
                  checked={editStatusTarget.freeAccount ?? false}
                  onCheckedChange={(checked) =>
                    setEditStatusTarget({ ...editStatusTarget, freeAccount: checked === true })
                  }
                  data-testid="checkbox-edit-freeAccount"
                />
                <div className="space-y-0.5">
                  <label htmlFor="edit-freeAccount" className="text-sm font-medium cursor-pointer leading-snug">
                    Complimentary Access
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Bypasses billing — no payment method required.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Internal Notes</label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="resize-none text-sm"
                  rows={3}
                  placeholder="Admin notes visible only to you..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditStatusTarget(null)}>Cancel</Button>
              <Button
                onClick={() => updateStatusMutation.mutate({
                  id: editStatusTarget.id,
                  subscriptionStatus: editStatusTarget.subscriptionStatus,
                  freeAccount: editStatusTarget.freeAccount ?? false,
                  notes: editNotes,
                })}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{deleteTarget?.title} {deleteTarget?.firstName} {deleteTarget?.lastName}</strong>'s account
              and <strong>all {deleteTarget?.patientCount} patient{deleteTarget?.patientCount !== 1 ? "s" : ""}</strong> associated with it.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
