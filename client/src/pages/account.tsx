import { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Save, CheckCircle, MessageSquare, Phone, BanIcon, Smartphone,
  Zap, Copy, Eye, EyeOff, Key, Globe, Info,
  Users, UserPlus, Trash2, ShieldAlert, Mail, Pencil, RotateCw,
  CreditCard, Clock, AlertTriangle, AlertCircle, XCircle,
  ImagePlus, PenLine, X, Search,
  Building2, User, SlidersHorizontal, FileText, ClipboardList, Shield,
  Bell, Inbox,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PreferencesPanel } from "@/components/preferences-panel";
import { DiagnosisPresetsSection } from "@/components/diagnosis-presets-section";
import { useClinicBranding } from "@/hooks/use-clinic-branding";
import { PLATFORM_DEFAULT_BRANDING, resolveBranding } from "@/lib/branding";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface StaffMember {
  id: number;
  clinicianId: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  inviteToken: null;
  inviteExpires: null;
  createdAt: string;
}

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  title: z.string().min(1, "Title is required"),
  email: z.string().email("Valid email is required"),
  npi: z.string().optional(),
  clinicName: z.string().min(1, "Clinic name is required"),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

const TITLES = ["MD", "DO", "NP", "NP-C", "FNP-C", "APRN", "PA", "PA-C", "RN", "PharmD", "Other"];

type MessagingPreference = 'none' | 'in_app' | 'sms' | 'external_api';
type ExternalProvider = 'spruce' | 'klara' | 'custom';

const MESSAGING_OPTIONS: {
  value: MessagingPreference;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: 'none',
    label: 'No messaging',
    description: 'Patients will not see a messaging option in their portal.',
    icon: BanIcon,
  },
  {
    value: 'in_app',
    label: 'In-app messaging',
    description: 'Patients message you through the portal. You reply from the patient profile in ReAlign.',
    icon: MessageSquare,
  },
  {
    value: 'sms',
    label: 'Text / Spruce (SMS link)',
    description: 'Patients tap "Message Provider" and their native SMS app opens, pre-addressed to your Spruce number.',
    icon: Smartphone,
  },
  {
    value: 'external_api',
    label: 'Two-way bridge (API)',
    description: 'Full two-way sync with Spruce, Klara, or a custom platform. Outbound messages are POSTed to your platform; inbound replies flow back via webhook.',
    icon: Zap,
  },
];

const EXTERNAL_PROVIDERS: { value: ExternalProvider; label: string }[] = [
  { value: 'spruce', label: 'Spruce Health' },
  { value: 'klara', label: 'Klara' },
  { value: 'custom', label: 'Custom / Other' },
];

const CHANNEL_ID_LABELS: Record<ExternalProvider, { label: string; placeholder: string; hint: string }> = {
  spruce: {
    label: 'Spruce Channel ID',
    placeholder: 'e.g. ch_abc123',
    hint: 'Found in your Spruce developer dashboard under Channels. Used to route outbound patient messages into your Spruce inbox.',
  },
  klara: {
    label: 'Klara Inbox / Channel ID',
    placeholder: 'e.g. inbox_abc123',
    hint: 'Your Klara inbox or channel identifier. Obtain this from your Klara developer settings.',
  },
  custom: {
    label: 'Endpoint URL',
    placeholder: 'https://your-platform.com/api/inbound',
    hint: 'When a patient sends a message, ReAlign will POST the message JSON to this URL with your API key in the Authorization header.',
  },
};

interface MessagingSettings {
  messagingPreference: MessagingPreference;
  messagingPhone: string | null;
  externalMessagingProvider: ExternalProvider | null;
  externalMessagingApiKeySet: boolean;
  externalMessagingChannelId: string | null;
  externalMessagingWebhookSecret: string | null;
  webhookUrl: string | null;
}

type SectionId = "clinic" | "provider" | "branding" | "messaging" | "team" | "preferences" | "diagnoses" | "forms" | "submissions" | "baa" | "billing";

const SECTIONS: { id: SectionId; label: string; icon: React.ComponentType<{ className?: string }>; clinicianOnly?: boolean; providerVisible?: boolean; ownerOnly?: boolean; badge?: string }[] = [
  { id: "clinic", label: "Clinic Information", icon: Building2, clinicianOnly: true, ownerOnly: true },
  { id: "provider", label: "Provider Details", icon: User, clinicianOnly: true, providerVisible: true },
  { id: "branding", label: "Branding & Signature", icon: ImagePlus, clinicianOnly: true, providerVisible: true },
  { id: "team", label: "Staff & Team", icon: Users, clinicianOnly: true, ownerOnly: true },
  { id: "messaging", label: "Messaging Settings", icon: MessageSquare, clinicianOnly: true, ownerOnly: true },
  { id: "preferences", label: "Lab & Clinical Settings", icon: SlidersHorizontal, clinicianOnly: true, ownerOnly: true },
  { id: "diagnoses", label: "Diagnosis Presets", icon: ClipboardList, clinicianOnly: true, providerVisible: true },
  { id: "forms", label: "Form Builder", icon: FileText, clinicianOnly: true, ownerOnly: true },
  { id: "submissions", label: "Form Submissions", icon: Inbox, clinicianOnly: true, ownerOnly: true },
  { id: "baa", label: "BAA / HIPAA", icon: Shield, clinicianOnly: true, ownerOnly: true },
  { id: "billing", label: "Billing & Plan", icon: CreditCard, clinicianOnly: true, ownerOnly: true },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface BaaStatus {
  signed: boolean;
  signedAt: string | null;
  signatureName: string | null;
  baaVersion: string | null;
}

function BaaSection() {
  const { data: baa, isLoading } = useQuery<BaaStatus>({
    queryKey: ["/api/baa/status"],
  });

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>HIPAA Business Associate Agreement</h3>
        <p className="text-sm text-muted-foreground mt-1">Required for HIPAA compliance</p>
      </div>
      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <div className="h-10 animate-pulse rounded-md bg-muted" />
          ) : baa?.signed ? (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-medium">Signed by <span className="italic">{baa.signatureName}</span></p>
                <p className="text-muted-foreground text-xs mt-0.5">{formatDate(baa.signedAt)}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Electronically signed · Recorded on file · ESIGN Act compliant · Version {baa?.baaVersion ?? "1.0"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>BAA not yet signed. You will be prompted to sign on next login.</span>
            </div>
          )}
          <div className="mt-4">
            <a href="/baa" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" data-testid="button-view-baa">
                View Agreement
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface BillingStatus {
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
  clinicPlan: string;
  clinicMaxProviders: number;
  clinicBaseProviderLimit: number;
  clinicExtraSeats: number;
  freeAccount?: boolean;
}

function BillingSection() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: billing, isLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
  });

  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [addStep, setAddStep] = useState<"form" | "confirm">("form");
  const [pName, setPName] = useState("");
  const [pCreds, setPCreds] = useState("");
  const [pNpi, setPNpi] = useState("");
  const [confirmCheck, setConfirmCheck] = useState<{ monthly_price_increase: number } | null>(null);
  const [addingProvider, setAddingProvider] = useState(false);

  const clinicId = (user as any)?.defaultClinicId;
  const isSuite = billing?.clinicPlan === "suite";

  function resetDialog() {
    setAddStep("form");
    setPName("");
    setPCreds("");
    setPNpi("");
    setConfirmCheck(null);
    setAddingProvider(false);
  }

  async function handleCheckAndProceed() {
    if (!pName.trim()) {
      toast({ title: "Name required", description: "Please enter the provider's name.", variant: "destructive" });
      return;
    }
    if (!clinicId) return;
    setAddingProvider(true);
    try {
      const checkRes = await apiRequest("POST", `/api/clinics/${clinicId}/providers/check`);
      const checkData = await checkRes.json();
      if (checkData.upgrade_required) {
        toast({ title: "Cannot add provider", description: checkData.message, variant: "destructive" });
        setAddingProvider(false);
        return;
      }
      if (checkData.confirmation_required) {
        setConfirmCheck({ monthly_price_increase: checkData.monthly_price_increase });
        setAddStep("confirm");
        setAddingProvider(false);
        return;
      }
      await doAdd();
    } catch {
      toast({ title: "Error", description: "Failed to check provider status.", variant: "destructive" });
      setAddingProvider(false);
    }
  }

  async function doAdd() {
    setAddingProvider(true);
    try {
      const res = await apiRequest("POST", `/api/clinics/${clinicId}/providers/confirm-add`, {
        displayName: pName.trim(),
        credentials: pCreds.trim() || null,
        npi: pNpi.trim() || null,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add provider");
      toast({ title: "Provider added", description: `${pName.trim()} has been added to your clinic.` });
      setAddProviderOpen(false);
      resetDialog();
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
    } catch (err: any) {
      toast({ title: "Failed to add provider", description: err.message, variant: "destructive" });
    } finally {
      setAddingProvider(false);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  }

  const statusColors: Record<string, string> = {
    active: "text-emerald-600",
    trialing: "text-blue-600",
    trial: "text-blue-600",
    past_due: "text-amber-600",
    canceled: "text-red-600",
    unpaid: "text-red-600",
  };

  const planLabel = billing?.clinicPlan === "suite" ? "ClinIQ Suite" : "ClinIQ Solo";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Billing & Subscription</h3>
        <p className="text-sm text-muted-foreground mt-1">Manage your plan and payment method</p>
      </div>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-md bg-muted" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{planLabel}</p>
                  <p className="text-xs text-muted-foreground capitalize">{billing?.subscriptionStatus ?? "Unknown"}</p>
                </div>
                <Badge variant="outline" className={cn("capitalize", statusColors[billing?.subscriptionStatus ?? ""])}>
                  {billing?.subscriptionStatus ?? "Unknown"}
                </Badge>
              </div>
              {billing?.stripeCurrentPeriodEnd && (
                <p className="text-xs text-muted-foreground">
                  {billing.stripeCancelAtPeriodEnd ? "Cancels" : "Renews"} on {formatDate(billing.stripeCurrentPeriodEnd)}
                </p>
              )}
              {billing?.stripeCancelAtPeriodEnd && (
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Your subscription will end at the current period. You can reactivate from the billing portal.</span>
                </div>
              )}
              {isSuite && (
                <div className="pt-3 border-t" style={{ borderColor: "#e5e2dc" }}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#1c2414" }}>Provider Seats</p>
                      <p className="text-xs text-muted-foreground">
                        {billing.clinicMaxProviders ?? "—"} provider{(billing.clinicMaxProviders ?? 1) !== 1 ? "s" : ""} included
                        {(billing.clinicExtraSeats ?? 0) > 0 && ` · ${billing.clinicExtraSeats} extra seat${billing.clinicExtraSeats !== 1 ? "s" : ""} purchased`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => { setAddProviderOpen(true); resetDialog(); }}
                      data-testid="button-add-provider-seat"
                      style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                      Add Provider
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          <Button
            variant="outline"
            onClick={() => setLocation("/billing")}
            data-testid="button-manage-billing"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Manage Billing
          </Button>
        </CardContent>
      </Card>

      <Dialog open={addProviderOpen} onOpenChange={(open) => { if (!open) { setAddProviderOpen(false); resetDialog(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Provider Seat</DialogTitle>
            <DialogDescription>
              {addStep === "form"
                ? "Enter the provider's details. They will be added to your clinic's provider list."
                : "Review the billing change before confirming."}
            </DialogDescription>
          </DialogHeader>

          {addStep === "form" ? (
            <div className="space-y-3 py-1">
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Full Name / Display Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={pName}
                  onChange={e => setPName(e.target.value)}
                  placeholder="e.g. Dr. Sarah Johnson"
                  data-testid="input-provider-name"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Credentials <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  value={pCreds}
                  onChange={e => setPCreds(e.target.value)}
                  placeholder="e.g. MD, NP-C, PA-C"
                  data-testid="input-provider-credentials"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  NPI <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </label>
                <Input
                  value={pNpi}
                  onChange={e => setPNpi(e.target.value)}
                  placeholder="10-digit NPI number"
                  data-testid="input-provider-npi"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="rounded-md p-3 space-y-1.5" style={{ backgroundColor: "#fef9ec", border: "1px solid #f5d97a" }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#b45309" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#92400e" }}>Additional charge required</p>
                    <p className="text-sm mt-1" style={{ color: "#78350f" }}>
                      Adding <strong>{pName.trim()}</strong> as a provider will add{" "}
                      <strong>${confirmCheck?.monthly_price_increase}/month</strong> to your subscription.
                      Your card on file will be billed pro-rated immediately for the remainder of this billing period.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This seat renews monthly with your subscription. You can remove the provider at any time, though refunds are not issued for partial billing periods.
              </p>
            </div>
          )}

          <DialogFooter>
            {addStep === "form" ? (
              <>
                <Button variant="outline" onClick={() => { setAddProviderOpen(false); resetDialog(); }} data-testid="button-cancel-add-provider">
                  Cancel
                </Button>
                <Button
                  onClick={handleCheckAndProceed}
                  disabled={addingProvider || !pName.trim()}
                  data-testid="button-next-add-provider"
                  style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
                >
                  {addingProvider ? "Checking..." : "Continue"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setAddStep("form")} disabled={addingProvider} data-testid="button-back-confirm-provider">
                  Back
                </Button>
                <Button
                  onClick={doAdd}
                  disabled={addingProvider}
                  data-testid="button-confirm-add-provider"
                  style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
                >
                  {addingProvider ? "Adding..." : "Confirm & Add Provider"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignaturePad({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1c2414";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: any, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: ((e.clientX - rect.left) * scaleX),
      y: ((e.clientY - rect.top) * scaleY),
    };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    hasStrokes.current = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = "touches" in e
      ? getPos(e.touches[0], canvas)
      : getPos(e.nativeEvent as MouseEvent, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, []);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = "touches" in e
      ? getPos(e.touches[0], canvas)
      : getPos(e.nativeEvent as MouseEvent, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, []);

  const stopDraw = useCallback(() => { drawing.current = false; }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-hidden" style={{ borderColor: "#d4c9b5" }}>
        <canvas
          ref={canvasRef}
          width={560}
          height={160}
          className="w-full touch-none cursor-crosshair block bg-white"
          style={{ maxHeight: "160px" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
          data-testid="canvas-signature-pad"
        />
        <div className="px-3 py-1.5 border-t flex items-center justify-between" style={{ borderColor: "#d4c9b5", backgroundColor: "#fdfcfb" }}>
          <span className="text-xs" style={{ color: "#6b7a5a" }}>Sign above using your finger, stylus, or mouse</span>
          <button onClick={clear} className="text-xs font-medium hover:underline" style={{ color: "#2e3a20" }} data-testid="button-clear-signature">Clear</button>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} data-testid="button-save-signature" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
          <PenLine className="w-3.5 h-3.5 mr-1.5" />Use This Signature
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} data-testid="button-cancel-signature">Cancel</Button>
      </div>
    </div>
  );
}

function FormSubmissionsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: submissions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/intake-forms/submissions/pending"],
  });

  const markReviewedMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("PATCH", `/api/intake-forms/submissions/${submissionId}/review`);
      if (!res.ok) throw new Error("Failed to mark as reviewed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/intake-forms/submissions/pending"] });
      toast({ title: "Submission marked as reviewed" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>New Form Submissions</h3>
        <p className="text-sm text-muted-foreground mt-1">Review and process completed patient intake forms</p>
      </div>
      {isLoading ? (
        <div className="h-20 animate-pulse rounded-md bg-muted" />
      ) : submissions.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <Inbox className="w-10 h-10 text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">No pending submissions</p>
              <p className="text-xs text-muted-foreground">New form submissions from patients will appear here</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {submissions.map((sub: any) => (
            <Card key={sub.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{sub.patientName || sub.respondentName || "Unknown patient"}</p>
                      <Badge variant="outline" className="text-[10px] py-0 h-4 text-amber-600 border-amber-300">
                        New
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{sub.formName || "Intake Form"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Submitted {new Date(sub.submittedAt || sub.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markReviewedMutation.mutate(sub.id)}
                      disabled={markReviewedMutation.isPending}
                      data-testid={`button-review-submission-${sub.id}`}
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      Mark Reviewed
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Account() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SectionId>("clinic");
  const [saved, setSaved] = useState(false);
  const [messagingSaved, setMessagingSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [search, setSearch] = useState("");

  const [clinicLogoPreview, setClinicLogoPreview] = useState<string | null>((user as any)?.clinicLogo ?? null);
  // Clinic-wide brand colors (apply to patient-facing PDFs and form pages).
  // Empty string === "use platform default" (clears the saved value).
  const { data: clinicBrandingData } = useClinicBranding();
  const [primaryColorInput, setPrimaryColorInput] = useState<string>("");
  const [accentColorInput, setAccentColorInput] = useState<string>("");
  const [formBgColorInput, setFormBgColorInput] = useState<string>("");
  const [brandColorsSaved, setBrandColorsSaved] = useState(false);
  useEffect(() => {
    if (clinicBrandingData) {
      setPrimaryColorInput(clinicBrandingData.primaryColor ?? "");
      setAccentColorInput(clinicBrandingData.accentColor ?? "");
      setFormBgColorInput(clinicBrandingData.formBackgroundColor ?? "");
    }
  }, [clinicBrandingData]);
  const brandColorsMutation = useMutation({
    mutationFn: async (payload: { primaryColor: string | null; accentColor: string | null; formBackgroundColor: string | null }) => {
      return apiRequest("PATCH", "/api/clinic/branding", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/branding"] });
      setBrandColorsSaved(true);
      setTimeout(() => setBrandColorsSaved(false), 2500);
      toast({ title: "Brand colors saved", description: "Patient-facing reports and forms will use the new colors." });
    },
    onError: (err: any) => {
      toast({ title: "Could not save brand colors", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });
  const effectiveBrandPreview = resolveBranding(null, {
    primaryColor: primaryColorInput || null,
    accentColor: accentColorInput || null,
    formBackgroundColor: formBgColorInput || null,
  });
  const [signaturePreview, setSignaturePreview] = useState<string | null>((user as any)?.signatureImage ?? null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isStaff = !!(user as any)?.isStaff;
  const adminRole = (user as any)?.adminRole as string | undefined;
  const isOwner = adminRole === "owner" || !(user as any)?.defaultClinicId;
  const isAdmin = adminRole === "admin";
  const isOwnerOrAdmin = isOwner || isAdmin;
  const isSuiteProvider = !isStaff && !isOwnerOrAdmin && !!(user as any)?.defaultClinicId;

  useEffect(() => {
    if (isSuiteProvider && activeSection !== "provider" && activeSection !== "branding" && activeSection !== "diagnoses") {
      setActiveSection("provider");
    }
    if (isAdmin && SECTIONS.find(s => s.id === activeSection)?.ownerOnly) {
      setActiveSection("provider");
    }
  }, [isSuiteProvider, isAdmin]);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [inviteAdminRole, setInviteAdminRole] = useState("standard");
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Provider (clinician) invite form for suite accounts
  const [showProviderInviteForm, setShowProviderInviteForm] = useState(false);
  const [providerInviteEmail, setProviderInviteEmail] = useState("");
  const [providerInviteFirstName, setProviderInviteFirstName] = useState("");
  const [providerInviteLastName, setProviderInviteLastName] = useState("");
  const [providerInviteClinicalRole, setProviderInviteClinicalRole] = useState("provider");
  const [providerInviteAdminRole, setProviderInviteAdminRole] = useState("standard");
  const [seatConfirmDialog, setSeatConfirmDialog] = useState<{ open: boolean; seatPrice: number; message: string }>({ open: false, seatPrice: 0, message: "" });

  // Edit staff role dialog
  const [editStaffMember, setEditStaffMember] = useState<StaffMember | null>(null);
  const [editStaffRole, setEditStaffRole] = useState("staff");
  const [editStaffAdminRole, setEditStaffAdminRole] = useState("standard");

  const { data: staffList = [], refetch: refetchStaff } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    enabled: !isStaff,
  });

  const { data: clinicMembers = [] } = useQuery<any[]>({
    queryKey: ["/api/clinic/members"],
    enabled: !isStaff && !!(user as any)?.defaultClinicId,
  });

  const { data: pendingProviderInvites = [], refetch: refetchInvites } = useQuery<any[]>({
    queryKey: ["/api/clinic/invites"],
    enabled: !isStaff && !!(user as any)?.defaultClinicId,
  });

  const { data: pendingSubmissions = [] } = useQuery<any[]>({
    queryKey: ["/api/intake-forms/submissions/pending"],
    enabled: !isStaff,
  });

  const inviteStaffMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff", {
        email: inviteEmail.trim(),
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
        role: inviteRole,
        adminRole: inviteAdminRole,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to invite");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite sent", description: `${inviteFirstName} will receive an email with a link to set their password.` });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("staff");
      setInviteAdminRole("standard");
      setShowInviteForm(false);
      refetchStaff();
    },
    onError: (err: Error) => {
      toast({ title: "Invite failed", description: err.message, variant: "destructive" });
    },
  });

  const removeStaffMutation = useMutation({
    mutationFn: async (staffId: number) => {
      const res = await apiRequest("DELETE", `/api/staff/${staffId}`);
      if (!res.ok) throw new Error("Failed to remove");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Staff member removed" });
      refetchStaff();
    },
    onError: () => {
      toast({ title: "Remove failed", variant: "destructive" });
    },
  });

  const editStaffRoleMutation = useMutation({
    mutationFn: async ({ id, role, adminRole }: { id: number; role: string; adminRole: string }) => {
      const res = await apiRequest("PATCH", `/api/staff/${id}`, { role, adminRole });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Failed to update"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Roles updated" });
      setEditStaffMember(null);
      refetchStaff();
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const inviteProviderMutation = useMutation({
    mutationFn: async (opts?: { confirmExtraSeat?: boolean }) => {
      const res = await apiRequest("POST", "/api/clinic/invite-provider", {
        email: providerInviteEmail.trim(),
        firstName: providerInviteFirstName.trim(),
        lastName: providerInviteLastName.trim(),
        clinicalRole: providerInviteClinicalRole,
        adminRole: providerInviteAdminRole,
        confirmExtraSeat: opts?.confirmExtraSeat ?? false,
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 && data.requiresSeatConfirmation) {
          setSeatConfirmDialog({ open: true, seatPrice: data.seatPrice, message: data.message });
          return { needsConfirmation: true };
        }
        throw new Error(data.message || "Failed to send invite");
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.needsConfirmation) return;
      toast({ title: "Provider invited", description: `${providerInviteFirstName} will receive an email with a link to create their account.${data?.billingUpdated ? " An additional seat charge has been added to your subscription." : ""}` });
      setProviderInviteEmail("");
      setProviderInviteFirstName("");
      setProviderInviteLastName("");
      setProviderInviteClinicalRole("provider");
      setProviderInviteAdminRole("standard");
      setShowProviderInviteForm(false);
      setSeatConfirmDialog({ open: false, seatPrice: 0, message: "" });
      refetchInvites();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to invite provider", description: err.message, variant: "destructive", duration: 8000 });
    },
  });

  const revokeProviderInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest("DELETE", `/api/clinic/invites/${inviteId}`);
      if (!res.ok) throw new Error("Failed to revoke");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invite revoked" });
      refetchInvites();
    },
    onError: () => {
      toast({ title: "Failed to revoke invite", variant: "destructive" });
    },
  });

  const handleResendResult = (data: any, refetch?: () => void) => {
    if (refetch) refetch();
    if (data?.emailSent) {
      toast({
        title: "Invite email sent",
        description: `A fresh 72-hour invite link was emailed to ${data.recipientEmail}.`,
      });
    } else {
      const link = data?.inviteLink || "";
      try { navigator.clipboard.writeText(link); } catch {}
      toast({
        title: "Email failed — link copied to clipboard",
        description: `Resend rejected the email${data?.emailError ? ` (${data.emailError})` : ""}. The 72-hour invite link for ${data?.recipientEmail} has been copied — paste it to the recipient via text or another channel.`,
        variant: "destructive",
        duration: 20000,
      });
    }
  };

  const resendProviderInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest("POST", `/api/clinic/invites/${inviteId}/resend`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to resend");
      }
      return res.json();
    },
    onSuccess: (data) => {
      handleResendResult(data, refetchInvites);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to resend invite", description: err.message, variant: "destructive" });
    },
  });

  const resendStaffInviteMutation = useMutation({
    mutationFn: async (staffId: number) => {
      const res = await apiRequest("POST", `/api/staff/${staffId}/resend`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to resend");
      }
      return res.json();
    },
    onSuccess: (data) => {
      handleResendResult(data, () => queryClient.invalidateQueries({ queryKey: ["/api/staff"] }));
    },
    onError: (err: Error) => {
      toast({ title: "Failed to resend invite", description: err.message, variant: "destructive" });
    },
  });

  const [messagingPreference, setMessagingPreference] = useState<MessagingPreference>(
    ((user as any)?.messagingPreference as MessagingPreference) || 'none'
  );
  const [messagingPhone, setMessagingPhone] = useState<string>((user as any)?.messagingPhone || '');
  const [externalProvider, setExternalProvider] = useState<ExternalProvider>('spruce');
  const [externalApiKey, setExternalApiKey] = useState('');
  const [externalChannelId, setExternalChannelId] = useState('');

  const { data: messagingSettings } = useQuery<MessagingSettings>({
    queryKey: ["/api/auth/messaging-settings"],
    onSuccess: (data: MessagingSettings) => {
      setExternalProvider((data.externalMessagingProvider as ExternalProvider) || 'spruce');
      setExternalChannelId(data.externalMessagingChannelId || '');
    },
  } as any);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      title: user?.title || "",
      email: user?.email || "",
      npi: user?.npi || "",
      clinicName: user?.clinicName || "",
      phone: user?.phone || "",
      address: user?.address || "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        title: user.title || "",
        email: user.email || "",
        npi: (user as any).npi || "",
        clinicName: user.clinicName || "",
        phone: (user as any).phone || "",
        address: (user as any).address || "",
      });
    }
  }, [user?.id, user?.firstName, user?.lastName, user?.clinicName]);

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setSaved(true);
      toast({ title: "Profile updated", description: "Your information has been saved." });
      setTimeout(() => setSaved(false), 3000);
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save your profile. Please try again.", variant: "destructive" });
    },
  });

  const messagingMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { messagingPreference };
      if (messagingPreference === 'sms') {
        payload.messagingPhone = messagingPhone || null;
      }
      if (messagingPreference === 'external_api') {
        payload.externalMessagingProvider = externalProvider;
        payload.externalMessagingChannelId = externalChannelId || null;
        if (externalApiKey.trim()) {
          payload.externalMessagingApiKey = externalApiKey.trim();
        }
      }
      const res = await apiRequest("PATCH", "/api/auth/profile", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/messaging-settings"] });
      setExternalApiKey('');
      setMessagingSaved(true);
      toast({ title: "Messaging settings saved" });
      setTimeout(() => setMessagingSaved(false), 3000);
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save messaging settings.", variant: "destructive" });
    },
  });

  const registerSpruceWebhookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/messaging/register-spruce-webhook", {});
      const body = await res.json();
      if (!res.ok) throw new Error(body?.message || "Spruce rejected the request.");
      return body;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/messaging-settings"] });
      toast({
        title: "Webhook registered with Spruce",
        description: data?.endpointId
          ? `Endpoint ID: ${data.endpointId}`
          : "Spruce will now forward incoming messages to ClinIQ.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not register webhook", description: e.message, variant: "destructive" });
    },
  });

  const onSubmit = (data: ProfileForm) => updateMutation.mutate(data);

  const onSubmitClinic = () => {
    const vals = form.getValues();
    updateMutation.mutate({ clinicName: vals.clinicName, email: vals.email, phone: vals.phone, address: vals.address } as any);
  };

  const onSubmitProvider = () => {
    const vals = form.getValues();
    updateMutation.mutate({ firstName: vals.firstName, lastName: vals.lastName, title: vals.title, npi: vals.npi } as any);
  };

  const brandingMutation = useMutation({
    mutationFn: async (payload: { clinicLogo?: string | null; signatureImage?: string | null }) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Save failed"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setBrandingSaved(true);
      toast({ title: "Branding saved", description: "Your clinic logo and signature have been updated." });
      setTimeout(() => setBrandingSaved(false), 3000);
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied to clipboard` });
    });
  };

  const channelMeta = CHANNEL_ID_LABELS[externalProvider] || CHANNEL_ID_LABELS.custom;

  const isSaveDisabled = messagingMutation.isPending ||
    (messagingPreference === 'sms' && !messagingPhone.trim()) ||
    (messagingPreference === 'external_api' && !externalChannelId.trim() &&
      externalProvider !== 'custom');

  const visibleSections = isStaff
    ? []
    : isSuiteProvider
      ? SECTIONS.filter(s => s.providerVisible)
      : isAdmin
        ? SECTIONS.filter(s => !s.ownerOnly)
        : SECTIONS;
  const filteredSections = visibleSections.filter(s => {
    if (!search) return true;
    return s.label.toLowerCase().includes(search.toLowerCase());
  });

  const submissionCount = pendingSubmissions.length;

  const renderSection = () => {
    switch (activeSection) {
      case "clinic":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Clinic Information</h3>
              <p className="text-sm text-muted-foreground mt-1">This information appears on patient-facing reports</p>
            </div>
            <Card>
              <CardContent className="pt-5">
                <Form {...form}>
                  <form onSubmit={(e) => { e.preventDefault(); onSubmitClinic(); }} className="space-y-5">
                    <div className="space-y-4">
                      <FormField control={form.control} name="clinicName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Clinic Name</FormLabel>
                          <FormControl><Input data-testid="input-clinicName" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField control={form.control} name="email" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl><Input data-testid="input-email" type="email" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="phone" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Phone</FormLabel>
                            <FormControl><Input data-testid="input-phone" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <FormField control={form.control} name="address" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input data-testid="input-address" placeholder="123 Medical Dr, City, State ZIP" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                      <div className="h-5">
                        {saved && (
                          <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                            <CheckCircle className="w-4 h-4" />Saved
                          </span>
                        )}
                      </div>
                      <Button data-testid="button-save-clinic" type="submit" disabled={updateMutation.isPending}>
                        <Save className="w-4 h-4 mr-2" />
                        {updateMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        );

      case "provider":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Provider Details</h3>
              <p className="text-sm text-muted-foreground mt-1">Your professional credentials and personal information</p>
            </div>
            <Card>
              <CardContent className="pt-5">
                <Form {...form}>
                  <form onSubmit={(e) => { e.preventDefault(); onSubmitProvider(); }} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="firstName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl><Input data-testid="input-firstName" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="lastName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl><Input data-testid="input-lastName" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="title" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Title / Credentials</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-title">
                                <SelectValue placeholder="Select title" />
                              </SelectTrigger>
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
                          <FormLabel>NPI Number</FormLabel>
                          <FormControl><Input data-testid="input-npi" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                      <div className="h-5">
                        {saved && (
                          <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                            <CheckCircle className="w-4 h-4" />Saved
                          </span>
                        )}
                      </div>
                      <Button data-testid="button-save-provider" type="submit" disabled={updateMutation.isPending}>
                        <Save className="w-4 h-4 mr-2" />
                        {updateMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>
        );

      case "branding":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>
                {isSuiteProvider || isAdmin ? "Your Provider Signature" : "Branding & Provider Signature"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {!isOwner
                  ? "Your personal electronic signature. It will appear at the bottom of SOAP note PDFs that you sign."
                  : "Your logo appears as letterhead on printed SOAP notes. Your signature is embedded when a note is electronically signed."}
              </p>
            </div>
            <Card>
              <CardContent className="pt-5 space-y-6">
                {isOwner && (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Clinic Logo</p>
                      <div className="flex items-start gap-4 flex-wrap">
                        <div
                          className="w-48 h-24 rounded-md border flex items-center justify-center bg-muted/30 overflow-hidden cursor-pointer"
                          onClick={() => logoInputRef.current?.click()}
                          data-testid="button-upload-logo"
                        >
                          {clinicLogoPreview
                            ? <img src={clinicLogoPreview} alt="Clinic logo" className="max-h-full max-w-full object-contain p-2" />
                            : <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                <ImagePlus className="w-7 h-7" />
                                <span className="text-xs">Click to upload</span>
                              </div>
                          }
                        </div>
                        <div className="flex flex-col gap-2 justify-center">
                          <Button size="sm" variant="outline" onClick={() => logoInputRef.current?.click()} data-testid="button-choose-logo">
                            <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                            {clinicLogoPreview ? "Replace Logo" : "Upload Logo"}
                          </Button>
                          {clinicLogoPreview && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setClinicLogoPreview(null)} data-testid="button-remove-logo">
                              <X className="w-3.5 h-3.5 mr-1.5" />Remove
                            </Button>
                          )}
                          <p className="text-xs text-muted-foreground">PNG or JPEG, max 2MB</p>
                        </div>
                      </div>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        data-testid="input-clinic-logo"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 2_097_152) { toast({ title: "File too large", description: "Please choose an image under 2MB.", variant: "destructive" }); return; }
                          const dataUrl = await readFileAsDataUrl(file);
                          setClinicLogoPreview(dataUrl);
                          e.target.value = "";
                        }}
                      />
                    </div>
                    <Separator />

                    {/* ── Universal Brand Colors ─────────────────────────── */}
                    <div data-testid="section-brand-colors">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Brand Colors</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Apply your clinic's colors to patient-facing reports (wellness PDFs, lab reports, SOAP notes) and patient portal forms.
                        Layout, fonts, and clinical status colors (normal / borderline / abnormal / critical) are not affected.
                        Leave a field blank to use the platform default.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                          { key: "primary", label: "Primary", desc: "Section headers, header bars", value: primaryColorInput, setValue: setPrimaryColorInput, fallback: PLATFORM_DEFAULT_BRANDING.primaryColor, effective: effectiveBrandPreview.primaryColor },
                          { key: "accent", label: "Accent", desc: "Highlights, dividers, pills", value: accentColorInput, setValue: setAccentColorInput, fallback: PLATFORM_DEFAULT_BRANDING.accentColor, effective: effectiveBrandPreview.accentColor },
                          { key: "form_bg", label: "Form Background", desc: "Patient portal form pages", value: formBgColorInput, setValue: setFormBgColorInput, fallback: PLATFORM_DEFAULT_BRANDING.formBackgroundColor, effective: effectiveBrandPreview.formBackgroundColor },
                        ].map((f) => (
                          <div key={f.key} className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">{f.label}</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={f.value || f.fallback}
                                onChange={(e) => f.setValue(e.target.value.toLowerCase())}
                                className="h-9 w-12 rounded-md border cursor-pointer p-0.5 bg-background"
                                data-testid={`color-${f.key}`}
                                aria-label={`${f.label} color picker`}
                              />
                              <Input
                                value={f.value}
                                onChange={(e) => f.setValue(e.target.value)}
                                placeholder={f.fallback}
                                className="font-mono text-sm uppercase"
                                data-testid={`input-color-${f.key}`}
                              />
                              {f.value && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => f.setValue("")}
                                  data-testid={`button-clear-${f.key}`}
                                  title="Use platform default"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{f.desc}</p>
                          </div>
                        ))}
                      </div>

                      {/* Preview */}
                      <div className="mt-5 rounded-md border overflow-hidden" data-testid="preview-branding">
                        <div
                          className="px-4 py-3 text-white text-sm font-semibold flex items-center justify-between"
                          style={{ backgroundColor: effectiveBrandPreview.primaryColor }}
                        >
                          <span>Patient Wellness Report — Preview</span>
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded"
                            style={{ backgroundColor: effectiveBrandPreview.accentColor, color: "#fff" }}
                          >
                            Sample Badge
                          </span>
                        </div>
                        <div className="px-4 py-4 space-y-2" style={{ backgroundColor: effectiveBrandPreview.formBackgroundColor }}>
                          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: effectiveBrandPreview.primaryColor }}>
                            Section Heading
                          </div>
                          <div className="h-px" style={{ backgroundColor: effectiveBrandPreview.accentColor }} />
                          <p className="text-sm text-slate-700">
                            Patient body text appears here. Background tint shown is what patients see on portal form pages.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 flex-wrap gap-3">
                        <div className="h-5">
                          {brandColorsSaved && (
                            <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                              <CheckCircle className="w-4 h-4" />Brand colors saved
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={brandColorsMutation.isPending}
                            onClick={() => {
                              setPrimaryColorInput("");
                              setAccentColorInput("");
                              setFormBgColorInput("");
                              brandColorsMutation.mutate({ primaryColor: null, accentColor: null, formBackgroundColor: null });
                            }}
                            data-testid="button-reset-brand-colors"
                          >
                            Reset to platform defaults
                          </Button>
                          <Button
                            type="button"
                            disabled={brandColorsMutation.isPending}
                            onClick={() => brandColorsMutation.mutate({
                              primaryColor: primaryColorInput.trim() || null,
                              accentColor: accentColorInput.trim() || null,
                              formBackgroundColor: formBgColorInput.trim() || null,
                            })}
                            data-testid="button-save-brand-colors"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {brandColorsMutation.isPending ? "Saving..." : "Save Brand Colors"}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                    <PenLine className="w-3 h-3 inline mr-1" />Provider Signature
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Draw your signature below. It will appear at the bottom of electronically-signed SOAP note PDFs.
                  </p>
                  {showSignaturePad ? (
                    <SignaturePad
                      onSave={(dataUrl) => { setSignaturePreview(dataUrl); setShowSignaturePad(false); }}
                      onCancel={() => setShowSignaturePad(false)}
                    />
                  ) : (
                    <div className="flex items-start gap-4 flex-wrap">
                      <div
                        className="rounded-md border flex items-center justify-center bg-white overflow-hidden"
                        style={{ width: "280px", height: "88px", borderColor: "#d4c9b5" }}
                      >
                        {signaturePreview
                          ? <img src={signaturePreview} alt="Provider signature" className="max-h-full max-w-full object-contain p-2" />
                          : <div className="flex flex-col items-center gap-1 text-muted-foreground">
                              <PenLine className="w-5 h-5" />
                              <span className="text-xs">No signature saved yet</span>
                            </div>
                        }
                      </div>
                      <div className="flex flex-col gap-2 justify-center">
                        <Button size="sm" onClick={() => setShowSignaturePad(true)} data-testid="button-draw-signature" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                          <PenLine className="w-3.5 h-3.5 mr-1.5" />
                          {signaturePreview ? "Redraw Signature" : "Draw Signature"}
                        </Button>
                        {signaturePreview && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setSignaturePreview(null)} data-testid="button-remove-signature">
                            <X className="w-3.5 h-3.5 mr-1.5" />Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                  <div className="h-5">
                    {brandingSaved && (
                      <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />{!isOwner ? "Signature saved" : "Branding saved"}
                      </span>
                    )}
                  </div>
                  <Button
                    data-testid="button-save-branding"
                    disabled={brandingMutation.isPending}
                    onClick={() => brandingMutation.mutate(!isOwner ? { signatureImage: signaturePreview } : { clinicLogo: clinicLogoPreview, signatureImage: signaturePreview })}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {brandingMutation.isPending ? "Saving..." : !isOwner ? "Save Signature" : "Save Branding"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "messaging":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Patient Portal Messaging</h3>
              <p className="text-sm text-muted-foreground mt-1">Choose how patients in your portal can reach you</p>
            </div>
            <Card>
              <CardContent className="pt-5 space-y-5">
                <div className="space-y-2">
                  {MESSAGING_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = messagingPreference === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMessagingPreference(opt.value)}
                        data-testid={`messaging-option-${opt.value}`}
                        className={cn(
                          "w-full text-left rounded-md border p-4 flex items-start gap-3 transition-colors",
                          isSelected ? "border-primary bg-primary/5" : "border-border hover-elevate"
                        )}
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{opt.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.description}</p>
                        </div>
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1.5 flex items-center justify-center",
                          isSelected ? "border-primary bg-primary" : "border-border"
                        )}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {messagingPreference === 'sms' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      Messaging phone number
                    </label>
                    <Input
                      type="tel"
                      placeholder="e.g. +1 (555) 000-0000"
                      value={messagingPhone}
                      onChange={(e) => setMessagingPhone(e.target.value)}
                      data-testid="input-messaging-phone"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter your Spruce Health number or any number you want patients to text.
                    </p>
                  </div>
                )}

                {messagingPreference === 'external_api' && (
                  <div className="space-y-5 rounded-md border border-dashed border-primary/40 bg-primary/3 p-4">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Full two-way sync. Outbound messages POST to your platform; inbound replies flow back via webhook.
                      </p>
                    </div>
                    <Separator />
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Messaging platform</label>
                      <Select value={externalProvider} onValueChange={(v) => setExternalProvider(v as ExternalProvider)}>
                        <SelectTrigger data-testid="select-external-provider"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {EXTERNAL_PROVIDERS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-muted-foreground" />
                        API Key
                        {messagingSettings?.externalMessagingApiKeySet && !externalApiKey && (
                          <span className="text-xs font-normal text-green-600 ml-1">
                            <CheckCircle className="w-3 h-3 inline mr-0.5" />already set
                          </span>
                        )}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type={showApiKey ? "text" : "password"}
                          placeholder={messagingSettings?.externalMessagingApiKeySet ? "Enter new key to replace" : "Paste your API key here"}
                          value={externalApiKey}
                          onChange={(e) => setExternalApiKey(e.target.value)}
                          data-testid="input-external-api-key"
                          className="font-mono text-sm"
                        />
                        <Button type="button" variant="ghost" size="icon" onClick={() => setShowApiKey(!showApiKey)}>
                          {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">{channelMeta.label}</label>
                      <Input placeholder={channelMeta.placeholder} value={externalChannelId} onChange={(e) => setExternalChannelId(e.target.value)} data-testid="input-external-channel-id" />
                      <p className="text-xs text-muted-foreground">{channelMeta.hint}</p>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook configuration</p>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground flex items-center gap-1">
                          <Globe className="w-3 h-3 text-muted-foreground" />Webhook URL
                        </label>
                        <div className="flex gap-2 items-center">
                          <Input readOnly value={messagingSettings?.webhookUrl || "Save settings to generate"} className="font-mono text-xs bg-muted" data-testid="display-webhook-url" />
                          {messagingSettings?.webhookUrl && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => copyToClipboard(messagingSettings.webhookUrl!, "Webhook URL")} data-testid="button-copy-webhook-url">
                              <Copy className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground flex items-center gap-1">
                          <Key className="w-3 h-3 text-muted-foreground" />Webhook Secret
                        </label>
                        <div className="flex gap-2 items-center">
                          <Input
                            readOnly
                            type={showWebhookSecret ? "text" : "password"}
                            value={messagingSettings?.externalMessagingWebhookSecret || (messagingSettings ? "(save to generate)" : "—")}
                            className="font-mono text-xs bg-muted"
                            data-testid="display-webhook-secret"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => setShowWebhookSecret(!showWebhookSecret)}>
                            {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                          {messagingSettings?.externalMessagingWebhookSecret && (
                            <Button type="button" variant="ghost" size="icon" onClick={() => copyToClipboard(messagingSettings.externalMessagingWebhookSecret!, "Webhook secret")} data-testid="button-copy-webhook-secret">
                              <Copy className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {messagingSettings?.externalMessagingProvider === "spruce" && (
                        <div className="rounded-md border bg-muted/30 px-3 py-3 space-y-2">
                          <div>
                            <p className="text-xs font-semibold text-foreground">One-click Spruce setup</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              We'll register the webhook above with Spruce automatically using your saved API key.
                              No terminal commands needed.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={() => registerSpruceWebhookMutation.mutate()}
                            disabled={
                              !messagingSettings?.externalMessagingApiKeySet ||
                              registerSpruceWebhookMutation.isPending
                            }
                            data-testid="button-register-spruce-webhook"
                          >
                            {registerSpruceWebhookMutation.isPending
                              ? "Registering..."
                              : "Register webhook with Spruce"}
                          </Button>
                          {!messagingSettings?.externalMessagingApiKeySet && (
                            <p className="text-xs text-amber-700">
                              Save your Spruce API key first, then click this button.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1 flex-wrap gap-3">
                  <div className="h-5">
                    {messagingSaved && (
                      <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />Saved
                      </span>
                    )}
                  </div>
                  <Button type="button" onClick={() => messagingMutation.mutate()} disabled={isSaveDisabled} data-testid="button-save-messaging">
                    <Save className="w-4 h-4 mr-2" />
                    {messagingMutation.isPending ? "Saving..." : "Save Messaging Setting"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "team":
        return (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Staff &amp; Team</h3>
              <p className="text-sm text-muted-foreground mt-1">Manage clinicians and staff who access your clinic workspace</p>
            </div>

            {/* Permission model note */}
            <div className="rounded-md border bg-muted/30 px-4 py-3">
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Two Permission Layers</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div><p className="font-medium text-foreground mb-0.5">Clinical Role</p><p>Signing authority, clinical documentation, rendering clinician eligibility (Provider, RN, MA, Staff)</p></div>
                <div><p className="font-medium text-foreground mb-0.5">Administrative Role</p><p>Account settings, billing, user management, forms (Owner, Admin, Limited Admin, Standard)</p></div>
              </div>
            </div>

            {/* ── Suite: Full Clinician Providers ── */}
            {(user as any)?.defaultClinicId && (
              <Card>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Clinic Providers</p>
                      <p className="text-xs text-muted-foreground">Full clinician accounts that share this clinic</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowProviderInviteForm(v => !v)} data-testid="button-invite-provider">
                      <UserPlus className="w-4 h-4 mr-2" />
                      {showProviderInviteForm ? "Cancel" : "Invite Provider"}
                    </Button>
                  </div>

                  {showProviderInviteForm && (
                    <div className="rounded-md border bg-muted/40 p-4 space-y-3">
                      <p className="text-sm font-medium">Invite a provider to this clinic</p>
                      <p className="text-xs text-muted-foreground">They will receive an email with a link to create their own ClinIQ account linked to your clinic.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">First Name</label>
                          <Input placeholder="Jane" value={providerInviteFirstName} onChange={e => setProviderInviteFirstName(e.target.value)} data-testid="input-provider-first-name" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                          <Input placeholder="Smith" value={providerInviteLastName} onChange={e => setProviderInviteLastName(e.target.value)} data-testid="input-provider-last-name" />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                          <Input type="email" placeholder="jane@clinic.com" value={providerInviteEmail} onChange={e => setProviderInviteEmail(e.target.value)} data-testid="input-provider-email" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Clinical Role</label>
                          <Select value={providerInviteClinicalRole} onValueChange={setProviderInviteClinicalRole}>
                            <SelectTrigger data-testid="select-provider-clinical-role"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="provider">Provider (MD/DO/NP/PA)</SelectItem>
                              <SelectItem value="nurse">RN / Nurse</SelectItem>
                              <SelectItem value="assistant">Medical Assistant</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Administrative Role</label>
                          <Select value={providerInviteAdminRole} onValueChange={setProviderInviteAdminRole}>
                            <SelectTrigger data-testid="select-provider-admin-role"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin — full access</SelectItem>
                              <SelectItem value="limited_admin">Limited Admin</SelectItem>
                              <SelectItem value="standard">Standard — no admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Button onClick={() => inviteProviderMutation.mutate({})} disabled={inviteProviderMutation.isPending || !providerInviteEmail || !providerInviteFirstName || !providerInviteLastName} data-testid="button-send-provider-invite">
                        <Mail className="w-4 h-4 mr-2" />
                        {inviteProviderMutation.isPending ? "Sending..." : "Send Provider Invite"}
                      </Button>
                    </div>
                  )}

                  {seatConfirmDialog.open && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-amber-900">Additional Seat Required</p>
                          <p className="text-sm text-amber-800 mt-1">{seatConfirmDialog.message}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSeatConfirmDialog({ open: false, seatPrice: 0, message: "" })}
                          data-testid="button-cancel-seat-confirm"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => inviteProviderMutation.mutate({ confirmExtraSeat: true })}
                          disabled={inviteProviderMutation.isPending}
                          data-testid="button-confirm-seat-purchase"
                        >
                          {inviteProviderMutation.isPending ? "Processing..." : `Confirm — Add $${seatConfirmDialog.seatPrice}/mo`}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Pending provider invites */}
                  {pendingProviderInvites.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pending Invites</p>
                      {pendingProviderInvites.map((inv: any) => (
                        <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 rounded-md border border-amber-200 bg-amber-50/40 px-3 sm:px-4 py-3" data-testid={`row-provider-invite-${inv.id}`}>
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-semibold text-amber-800 flex-shrink-0">{inv.firstName?.[0]}{inv.lastName?.[0]}</div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{inv.firstName} {inv.lastName}</p>
                              <p className="text-xs text-muted-foreground truncate">{inv.email} · Expires {new Date(inv.inviteExpires).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline" className="text-xs capitalize">{inv.clinicalRole}</Badge>
                            <Button variant="ghost" size="icon" onClick={() => resendProviderInviteMutation.mutate(inv.id)} disabled={resendProviderInviteMutation.isPending} data-testid={`button-resend-invite-${inv.id}`}>
                              <RotateCw className={`w-4 h-4 text-muted-foreground ${resendProviderInviteMutation.isPending ? "animate-spin" : ""}`} />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { if (confirm("Revoke this invite?")) revokeProviderInviteMutation.mutate(inv.id); }} data-testid={`button-revoke-invite-${inv.id}`}>
                              <X className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Active clinic members (other than the logged-in user) */}
                  <div className="space-y-2">
                    {clinicMembers.filter((m: any) => m.id !== (user as any)?.id).map((m: any) => (
                      <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 rounded-md border px-3 sm:px-4 py-3" data-testid={`row-clinic-member-${m.id}`}>
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">{m.firstName?.[0]}{m.lastName?.[0]}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{m.title ? `${m.title} ` : ""}{m.firstName} {m.lastName}</p>
                            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge variant="secondary" className="text-xs capitalize">{m.clinicalRole} · Clinical</Badge>
                          <Badge variant="outline" className="text-xs capitalize">{m.isOwner ? "Owner" : m.adminRole === "admin" ? "Admin" : m.adminRole === "limited_admin" ? "Limited Admin" : "Standard"} · Admin</Badge>
                        </div>
                      </div>
                    ))}
                    {/* Self row */}
                    {user && (
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 rounded-md border px-3 sm:px-4 py-3 bg-muted/20" data-testid="row-clinic-member-self">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>{user.firstName?.[0]}{user.lastName?.[0]}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{user.firstName} {user.lastName} <span className="text-xs text-muted-foreground">(you)</span></p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge variant="secondary" className="text-xs">Provider · Clinical</Badge>
                          <Badge className="text-xs" style={{ backgroundColor: "#2e3a20", color: "#fff", border: "none" }}>Owner · Admin</Badge>
                        </div>
                      </div>
                    )}
                    {clinicMembers.filter((m: any) => m.id !== (user as any)?.id).length === 0 && !showProviderInviteForm && pendingProviderInvites.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">You are the only provider in this clinic. Use "Invite Provider" to add another clinician.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Staff Members (sub-clinician access) ── */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Staff Members</p>
                    <p className="text-xs text-muted-foreground">Nurses, MAs, and admin staff with limited access (no separate ClinIQ subscription required)</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowInviteForm(v => !v)} data-testid="button-invite-staff">
                    <UserPlus className="w-4 h-4 mr-2" />
                    {showInviteForm ? "Cancel" : "Invite Staff"}
                  </Button>
                </div>

                {showInviteForm && (
                  <div className="rounded-md border bg-muted/40 p-4 space-y-3">
                    <p className="text-sm font-medium">Send a staff invite</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">First Name</label>
                        <Input placeholder="Jane" autoComplete="off" value={inviteFirstName} onChange={e => setInviteFirstName(e.target.value)} data-testid="input-staff-first-name" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                        <Input placeholder="Smith" autoComplete="off" value={inviteLastName} onChange={e => setInviteLastName(e.target.value)} data-testid="input-staff-last-name" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Email</label>
                        <Input type="email" placeholder="jane@clinic.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} data-testid="input-staff-email" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Clinical Role</label>
                        <Select value={inviteRole} onValueChange={setInviteRole}>
                          <SelectTrigger data-testid="select-staff-clinical-role"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="provider">Provider (MD/DO/NP/PA)</SelectItem>
                            <SelectItem value="nurse">RN / Nurse</SelectItem>
                            <SelectItem value="assistant">Medical Assistant</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Administrative Role</label>
                        <Select value={inviteAdminRole} onValueChange={setInviteAdminRole}>
                          <SelectTrigger data-testid="select-staff-admin-role"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin — full operational access</SelectItem>
                            <SelectItem value="limited_admin">Limited Admin — forms &amp; scheduling</SelectItem>
                            <SelectItem value="standard">Standard — no admin access</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button onClick={() => inviteStaffMutation.mutate()} disabled={inviteStaffMutation.isPending || !inviteEmail || !inviteFirstName || !inviteLastName} data-testid="button-send-staff-invite">
                      <Mail className="w-4 h-4 mr-2" />
                      {inviteStaffMutation.isPending ? "Sending..." : "Send Invite"}
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  {staffList.map((member) => {
                    const clinicalLabel = member.role === "nurse" ? "RN" : member.role === "assistant" ? "MA" : member.role === "provider" ? "Provider" : "Staff";
                    const adminLabel = (member as any).adminRole === "admin" ? "Admin" : (member as any).adminRole === "limited_admin" ? "Limited Admin" : "Standard";
                    return (
                      <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 rounded-md border px-3 sm:px-4 py-3" data-testid={`row-staff-${member.id}`}>
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground flex-shrink-0">{member.firstName[0]}{member.lastName[0]}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{member.firstName} {member.lastName}</p>
                            <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="secondary" className="text-xs">{clinicalLabel} · Clinical</Badge>
                            <Badge variant="outline" className="text-xs">{adminLabel} · Admin</Badge>
                          </div>
                          {!(member as any).hasSetPassword && (
                            <Button variant="ghost" size="icon" onClick={() => resendStaffInviteMutation.mutate(member.id)} disabled={resendStaffInviteMutation.isPending} data-testid={`button-resend-staff-invite-${member.id}`}>
                              <RotateCw className={`w-4 h-4 text-muted-foreground ${resendStaffInviteMutation.isPending ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => { setEditStaffMember(member); setEditStaffRole(member.role); setEditStaffAdminRole((member as any).adminRole || "standard"); }} data-testid={`button-edit-staff-${member.id}`}>
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Remove ${member.firstName} ${member.lastName}?`)) removeStaffMutation.mutate(member.id); }} disabled={removeStaffMutation.isPending} data-testid={`button-remove-staff-${member.id}`}>
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {!staffList.length && !showInviteForm && (
                    <p className="text-sm text-muted-foreground text-center py-2">No staff members yet. Use "Invite Staff" to add a nurse, MA, or admin assistant.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Edit Staff Role dialog */}
            {editStaffMember && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditStaffMember(null)}>
                <div className="bg-background rounded-md border shadow-lg p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Edit Roles — {editStaffMember.firstName} {editStaffMember.lastName}</p>
                    <Button variant="ghost" size="icon" onClick={() => setEditStaffMember(null)}><X className="w-4 h-4" /></Button>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Clinical Role</label>
                      <Select value={editStaffRole} onValueChange={setEditStaffRole}>
                        <SelectTrigger data-testid="select-edit-clinical-role"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="provider">Provider (MD/DO/NP/PA)</SelectItem>
                          <SelectItem value="nurse">RN / Nurse</SelectItem>
                          <SelectItem value="assistant">Medical Assistant</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Administrative Role</label>
                      <Select value={editStaffAdminRole} onValueChange={setEditStaffAdminRole}>
                        <SelectTrigger data-testid="select-edit-admin-role"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="limited_admin">Limited Admin</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditStaffMember(null)}>Cancel</Button>
                    <Button onClick={() => editStaffRoleMutation.mutate({ id: editStaffMember.id, role: editStaffRole, adminRole: editStaffAdminRole })} disabled={editStaffRoleMutation.isPending} data-testid="button-save-staff-roles">
                      {editStaffRoleMutation.isPending ? "Saving..." : "Save Roles"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "diagnoses":
        return <DiagnosisPresetsSection />;

      case "preferences":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Lab & Clinical Settings</h3>
              <p className="text-sm text-muted-foreground mt-1">Customize optimal ranges, reference ranges, and clinical preferences</p>
            </div>
            <PreferencesPanel />
          </div>
        );

      case "forms":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Form Builder</h3>
                <p className="text-sm text-muted-foreground mt-1">Create and manage patient intake forms</p>
              </div>
              <Button onClick={() => setLocation("/intake-forms")} data-testid="button-open-form-builder" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                <FileText className="w-4 h-4 mr-2" />
                Open Form Builder
              </Button>
            </div>
            <Card>
              <CardContent className="pt-5">
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                  <p className="text-sm font-medium">Build custom intake forms</p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Create patient intake forms with a drag-and-drop builder. Publish forms via shareable links that patients can fill out without logging in. Submissions sync to patient charts automatically.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "submissions":
        return <FormSubmissionsSection />;

      case "baa":
        return <BaaSection />;

      case "billing":
        return <BillingSection />;

      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-auto" style={{ backgroundColor: "#f9f6f0" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col md:flex-row gap-6">
        {/* Sidebar Navigation */}
        <aside className="hidden md:flex flex-col gap-1 w-56 flex-shrink-0">
          {/* Profile hero */}
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
              {isStaff
                ? `${(user as any)?.staffFirstName?.[0] ?? ""}${(user as any)?.staffLastName?.[0] ?? ""}`
                : `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                {isStaff ? `${(user as any)?.staffFirstName} ${(user as any)?.staffLastName}` : `${user?.firstName} ${user?.lastName}`}
              </p>
              <p className="text-xs truncate text-muted-foreground">{user?.clinicName}</p>
            </div>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4" style={{ color: "#9aaa84" }} />
            <Input
              placeholder="Search settings..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-sm"
              data-testid="input-settings-search"
              style={{ backgroundColor: "#fff", borderColor: "#d4c9b5" }}
            />
          </div>

          {filteredSections.map(section => {
            const Icon = section.icon;
            const isActive = section.id === activeSection;
            const showBadge = section.id === "submissions" && submissionCount > 0;
            return (
              <button
                key={section.id}
                onClick={() => { setActiveSection(section.id); setSearch(""); }}
                data-testid={`nav-account-${section.id}`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left w-full transition-colors"
                style={{
                  backgroundColor: isActive ? "#2e3a20" : "transparent",
                  color: isActive ? "#f9f6f0" : "#3d4a30",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1">{section.label}</span>
                {showBadge && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{
                      backgroundColor: isActive ? "#5a7040" : "#e74c3c",
                      color: "#fff",
                    }}
                  >
                    {submissionCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Mobile section picker */}
        <div className="md:hidden w-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
              {isStaff
                ? `${(user as any)?.staffFirstName?.[0] ?? ""}${(user as any)?.staffLastName?.[0] ?? ""}`
                : `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "#1c2414" }}>
                {isStaff ? `${(user as any)?.staffFirstName} ${(user as any)?.staffLastName}` : `${user?.firstName} ${user?.lastName}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.clinicName}</p>
            </div>
          </div>
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <div className="flex gap-2 w-max">
              {filteredSections.map(section => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => { setActiveSection(section.id); setSearch(""); }}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: section.id === activeSection ? "#2e3a20" : "#fdf9f5",
                      color: section.id === activeSection ? "#f9f6f0" : "#3d4a30",
                      borderColor: section.id === activeSection ? "#2e3a20" : "#d4c9b5",
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    {section.label}
                    {section.id === "submissions" && submissionCount > 0 && (
                      <span className="ml-0.5 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">{submissionCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {isStaff ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold" style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}>
                  {`${(user as any)?.staffFirstName?.[0] ?? ""}${(user as any)?.staffLastName?.[0] ?? ""}`}
                </div>
                <div>
                  <h1 className="text-xl font-semibold" style={{ color: "#1c2414" }}>
                    {(user as any)?.staffFirstName} {(user as any)?.staffLastName}
                  </h1>
                  <p className="text-sm text-muted-foreground">{user?.clinicName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Staff · {(user as any)?.staffRole || "staff"} · logged into {user?.firstName} {user?.lastName}'s workspace
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4">
                <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-900">Staff account</p>
                  <p className="text-sm text-amber-800">
                    You are logged in as a staff member. Clinic settings, messaging preferences, and account details are managed by {user?.firstName} {user?.lastName}.
                    You have full access to patient records, lab interpretations, and protocols.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            renderSection()
          )}
        </main>
      </div>

    </div>
  );
}
