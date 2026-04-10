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
  Users, UserPlus, Trash2, ShieldAlert, Mail,
  CreditCard, Clock, AlertTriangle, XCircle,
  ImagePlus, PenLine, X,
} from "lucide-react";
import { PreferencesPanel } from "@/components/preferences-panel";
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
    label: 'Two-way bridge (Spruce API / EHR)',
    description: 'Patients message through the portal, but replies flow through your external system (Spruce, Klara, or any webhook-capable platform) — best of both worlds.',
    icon: Zap,
  },
];

const EXTERNAL_PROVIDERS = [
  { value: 'spruce', label: 'Spruce Health' },
  { value: 'klara', label: 'Klara' },
  { value: 'custom', label: 'Custom / Other (webhook)' },
];

const CHANNEL_ID_LABELS: Record<ExternalProvider, { label: string; placeholder: string; hint: string }> = {
  spruce: {
    label: 'Spruce Channel ID',
    placeholder: 'e.g. chn_abc123',
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

// ── BAA status card ───────────────────────────────────────────────────────────

interface BaaStatus {
  signed: boolean;
  signedAt: string | null;
  signatureName: string | null;
  baaVersion: string | null;
}

function BaaStatusCard() {
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-semibold">HIPAA Business Associate Agreement</CardTitle>
          <a href="/baa" target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" data-testid="button-view-baa">
              View Agreement
            </Button>
          </a>
        </div>
        <CardDescription>Required for HIPAA compliance · Version {baa?.baaVersion ?? "1.0"}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-10 animate-pulse rounded-md bg-muted" />
        ) : baa?.signed ? (
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium">Signed by <span className="italic">{baa.signatureName}</span></p>
              <p className="text-muted-foreground text-xs mt-0.5">{formatDate(baa.signedAt)}</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                Electronically signed · Recorded on file · ESIGN Act compliant
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>BAA not yet signed. You will be prompted to sign on next login.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Billing status card ───────────────────────────────────────────────────────

interface BillingStatus {
  subscriptionStatus: string;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  stripeCancelAtPeriodEnd: boolean;
}

function BillingCard({ onNavigate }: { onNavigate: () => void }) {
  const { data: billing, isLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
  });

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }

  function daysLeft(iso: string | null) {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  const status = billing?.subscriptionStatus ?? "active";
  const hasSubscription = !!billing?.stripeSubscriptionId;
  const periodEnd = billing?.stripeCurrentPeriodEnd ?? null;
  const cancelAtEnd = billing?.stripeCancelAtPeriodEnd ?? false;
  const days = daysLeft(periodEnd);

  const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    trial:    { label: "Free Trial",   icon: <Clock className="h-3.5 w-3.5" />,         color: "text-blue-600 dark:text-blue-400" },
    active:   { label: "Active",       icon: <CheckCircle className="h-3.5 w-3.5" />,    color: "text-green-600 dark:text-green-400" },
    past_due: { label: "Past Due",     icon: <AlertTriangle className="h-3.5 w-3.5" />,  color: "text-orange-600 dark:text-orange-400" },
    canceled: { label: "Canceled",     icon: <XCircle className="h-3.5 w-3.5" />,        color: "text-red-600 dark:text-red-400" },
  };
  const sc = statusConfig[status] ?? statusConfig["active"];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-semibold">Billing &amp; Subscription</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={onNavigate}
            data-testid="button-manage-billing"
          >
            <CreditCard className="h-3.5 w-3.5 mr-1.5" />
            Manage Billing
          </Button>
        </div>
        <CardDescription>ClinIQ Clinical Intelligence Platform — $97/month</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-12 animate-pulse rounded-md bg-muted" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <span className={sc.color}>{sc.icon}</span>
                <span className="font-medium">{sc.label}</span>
              </div>
              {hasSubscription && periodEnd && (
                <span className="text-sm text-muted-foreground">
                  {cancelAtEnd
                    ? `Access ends ${formatDate(periodEnd)}`
                    : status === "trial"
                    ? `Trial ends in ${days} day${days !== 1 ? "s" : ""} · ${formatDate(periodEnd)}`
                    : `Renews ${formatDate(periodEnd)}`}
                </span>
              )}
              {!hasSubscription && (
                <span className="text-sm text-muted-foreground">No payment method on file</span>
              )}
            </div>
            {status === "past_due" && (
              <p className="text-xs text-orange-600 dark:text-orange-400">
                A payment failed. Visit the billing page to update your payment method.
              </p>
            )}
            {!hasSubscription && (
              <Button size="sm" onClick={onNavigate} data-testid="button-start-subscription">
                <CreditCard className="h-3.5 w-3.5 mr-1.5" />
                Start Free Trial
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Signature Pad Component ──────────────────────────────────────────────────
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
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPos = (e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
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

export default function Account() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const [messagingSaved, setMessagingSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  // Clinic branding & signature
  const [clinicLogoPreview, setClinicLogoPreview] = useState<string | null>((user as any)?.clinicLogo ?? null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>((user as any)?.signatureImage ?? null);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isStaff = !!(user as any)?.isStaff;

  // Staff management (clinicians only)
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState("staff");
  const [showInviteForm, setShowInviteForm] = useState(false);

  const { data: staffList = [], refetch: refetchStaff } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    enabled: !isStaff,
  });

  const inviteStaffMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/staff", {
        email: inviteEmail.trim(),
        firstName: inviteFirstName.trim(),
        lastName: inviteLastName.trim(),
        role: inviteRole,
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

  const [messagingPreference, setMessagingPreference] = useState<MessagingPreference>(
    ((user as any)?.messagingPreference as MessagingPreference) || 'none'
  );
  const [messagingPhone, setMessagingPhone] = useState<string>((user as any)?.messagingPhone || '');
  const [externalProvider, setExternalProvider] = useState<ExternalProvider>('spruce');
  const [externalApiKey, setExternalApiKey] = useState('');
  const [externalChannelId, setExternalChannelId] = useState('');

  // Fetch full messaging settings (includes sensitive fields like webhook secret)
  const { data: messagingSettings } = useQuery<MessagingSettings>({
    queryKey: ["/api/auth/messaging-settings"],
    onSuccess: (data) => {
      setExternalProvider((data.externalMessagingProvider as ExternalProvider) || 'spruce');
      setExternalChannelId(data.externalMessagingChannelId || '');
      // Do NOT pre-fill the API key — it's never sent to the client
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

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", data);
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/auth/me"], updated);
      setSaved(true);
      toast({ title: "Profile updated", description: "Your clinic information has been saved." });
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
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/auth/me"], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/messaging-settings"] });
      setExternalApiKey(''); // clear the input after save
      setMessagingSaved(true);
      toast({ title: "Messaging settings saved" });
      setTimeout(() => setMessagingSaved(false), 3000);
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save messaging settings.", variant: "destructive" });
    },
  });

  const onSubmit = (data: ProfileForm) => updateMutation.mutate(data);

  const brandingMutation = useMutation({
    mutationFn: async (payload: { clinicLogo?: string | null; signatureImage?: string | null }) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", payload);
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "Save failed"); }
      return res.json();
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/auth/me"], updated);
      setBrandingSaved(true);
      toast({ title: "Branding saved", description: "Your clinic logo and signature have been updated." });
      setTimeout(() => setBrandingSaved(false), 3000);
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#e8ddd0", borderColor: "#d4c9b5" }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/dashboard")}
              data-testid="button-back"
              style={{ color: "#2e3a20" }}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img
              src="/realign-health-logo.png"
              alt="ReAlign Health"
              className="h-14 w-auto"
              style={{ mixBlendMode: "multiply" }}
            />
            <div className="h-4 w-px" style={{ backgroundColor: "#c4b9a5" }} />
            <span className="font-medium text-sm" style={{ color: "#2e3a20" }}>Account Settings</span>
          </div>
          <Button
            variant="ghost"
            size="default"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="text-sm"
            style={{ color: "#2e3a20" }}
            data-testid="button-logout"
          >
            Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Profile hero */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-lg font-bold">
            {isStaff
              ? `${(user as any)?.staffFirstName?.[0] ?? ""}${(user as any)?.staffLastName?.[0] ?? ""}`
              : `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`}
          </div>
          <div>
            {isStaff ? (
              <>
                <h1 className="text-xl font-semibold text-foreground">
                  {(user as any)?.staffFirstName} {(user as any)?.staffLastName}
                </h1>
                <p className="text-muted-foreground text-sm">{user?.clinicName}</p>
                <p className="text-muted-foreground/60 text-xs mt-0.5">
                  Staff · {(user as any)?.staffRole || "staff"} · logged into {user?.firstName} {user?.lastName}'s workspace
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-foreground">
                  {user?.title} {user?.firstName} {user?.lastName}
                </h1>
                <p className="text-muted-foreground text-sm">{user?.clinicName}</p>
                <p className="text-muted-foreground/60 text-xs mt-0.5">@{user?.username}</p>
              </>
            )}
          </div>
        </div>

        {/* Staff read-only notice */}
        {isStaff && (
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
        )}

        {/* Profile form — clinicians only */}
        {!isStaff && <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinic & Provider Information</CardTitle>
            <CardDescription>
              This information appears on all patient-facing reports generated by your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Provider Details</p>
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
                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Clinical Title</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-title"><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="npi" render={({ field }) => (
                      <FormItem>
                        <FormLabel>NPI Number <span className="text-slate-400 font-normal">(optional)</span></FormLabel>
                        <FormControl><Input data-testid="input-npi" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Clinic Information</p>
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
                          <FormLabel>Phone <span className="text-slate-400 font-normal">(optional)</span></FormLabel>
                          <FormControl><Input data-testid="input-phone" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address <span className="text-slate-400 font-normal">(optional)</span></FormLabel>
                        <FormControl>
                          <Input data-testid="input-address" placeholder="123 Medical Dr, City, State ZIP" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
                  <div className="h-5">
                    {saved && (
                      <span className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
                        <CheckCircle className="w-4 h-4" />Changes saved
                      </span>
                    )}
                  </div>
                  <Button data-testid="button-save" type="submit" disabled={updateMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>}

        {/* Clinic Branding & Provider Signature — clinicians only */}
        {!isStaff && <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImagePlus className="w-4 h-4 text-muted-foreground" />
              Clinic Branding &amp; Provider Signature
            </CardTitle>
            <CardDescription>
              Your clinic logo appears as letterhead on printed SOAP notes. Your signature image is embedded when a note is electronically signed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Clinic Logo */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Clinic Logo</p>
              <div className="flex items-start gap-4 flex-wrap">
                <div
                  className="w-48 h-24 rounded-md border flex items-center justify-center bg-muted/30 overflow-hidden cursor-pointer"
                  onClick={() => logoInputRef.current?.click()}
                  data-testid="button-upload-logo"
                  title="Click to upload clinic logo"
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
                  <p className="text-xs text-muted-foreground">PNG or JPEG, max 2MB.<br />Recommended: wide format, transparent background.</p>
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

            {/* Provider Signature */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                <PenLine className="w-3 h-3 inline mr-1" />Provider Signature
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                Draw your signature below using your finger, stylus, or mouse. It will appear at the bottom of electronically-signed SOAP note PDFs.
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
                    <CheckCircle className="w-4 h-4" />Branding saved
                  </span>
                )}
              </div>
              <Button
                data-testid="button-save-branding"
                disabled={brandingMutation.isPending}
                onClick={() => brandingMutation.mutate({ clinicLogo: clinicLogoPreview, signatureImage: signaturePreview })}
              >
                <Save className="w-4 h-4 mr-2" />
                {brandingMutation.isPending ? "Saving..." : "Save Branding"}
              </Button>
            </div>
          </CardContent>
        </Card>}

        {/* Portal Messaging Preference — clinicians only */}
        {!isStaff && <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              Patient Portal Messaging
            </CardTitle>
            <CardDescription>
              Choose how patients in your portal can reach you. This setting only affects the patient-facing portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Option tiles */}
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
                      "w-full text-left rounded-lg border p-4 flex items-start gap-3 transition-colors",
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

            {/* SMS phone number input */}
            {messagingPreference === 'sms' && (
              <div className="space-y-1.5 pt-1">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  Messaging phone number
                </label>
                <Input
                  type="tel"
                  placeholder="e.g. +1 (555) 000-0000  (your Spruce number)"
                  value={messagingPhone}
                  onChange={(e) => setMessagingPhone(e.target.value)}
                  data-testid="input-messaging-phone"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your Spruce Health number or any number you want patients to text. Their SMS app will open pre-addressed to this number.
                </p>
              </div>
            )}

            {/* External API / two-way bridge configuration */}
            {messagingPreference === 'external_api' && (
              <div className="space-y-5 rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Patient messages sent through the portal will be forwarded to your external system in real time. When you reply there, a webhook fires back to ReAlign and the patient sees your reply in the portal. The patient experience is entirely in-app.
                  </p>
                </div>

                <Separator />

                {/* Provider selection */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Messaging platform</label>
                  <Select
                    value={externalProvider}
                    onValueChange={(v) => setExternalProvider(v as ExternalProvider)}
                  >
                    <SelectTrigger data-testid="select-external-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXTERNAL_PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* API key */}
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
                      placeholder={messagingSettings?.externalMessagingApiKeySet
                        ? "Enter a new key to replace the existing one"
                        : "Paste your API key here"}
                      value={externalApiKey}
                      onChange={(e) => setExternalApiKey(e.target.value)}
                      data-testid="input-external-api-key"
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your API key is stored securely and never shown after saving.
                  </p>
                </div>

                {/* Channel ID / endpoint */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{channelMeta.label}</label>
                  <Input
                    placeholder={channelMeta.placeholder}
                    value={externalChannelId}
                    onChange={(e) => setExternalChannelId(e.target.value)}
                    data-testid="input-external-channel-id"
                  />
                  <p className="text-xs text-muted-foreground">{channelMeta.hint}</p>
                </div>

                <Separator />

                {/* Webhook configuration (read-only — copy these into your external system) */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Webhook configuration
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Paste these values into your messaging platform's webhook settings so replies flow back into ReAlign.
                  </p>

                  {/* Webhook URL */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1">
                      <Globe className="w-3 h-3 text-muted-foreground" />
                      Webhook URL
                    </label>
                    <div className="flex gap-2 items-center">
                      <Input
                        readOnly
                        value={messagingSettings?.webhookUrl || "Save settings to generate your webhook URL"}
                        className="font-mono text-xs bg-muted"
                        data-testid="display-webhook-url"
                      />
                      {messagingSettings?.webhookUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(messagingSettings.webhookUrl!, "Webhook URL")}
                          data-testid="button-copy-webhook-url"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Configure your platform to POST incoming provider replies to this URL.
                    </p>
                  </div>

                  {/* Webhook secret */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center gap-1">
                      <Key className="w-3 h-3 text-muted-foreground" />
                      Webhook Secret
                    </label>
                    <div className="flex gap-2 items-center">
                      <Input
                        readOnly
                        type={showWebhookSecret ? "text" : "password"}
                        value={messagingSettings?.externalMessagingWebhookSecret
                          || (messagingSettings ? "(save settings to generate)" : "—")}
                        className="font-mono text-xs bg-muted"
                        data-testid="display-webhook-secret"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                      >
                        {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      {messagingSettings?.externalMessagingWebhookSecret && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(messagingSettings.externalMessagingWebhookSecret!, "Webhook secret")}
                          data-testid="button-copy-webhook-secret"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Send this value in the <code className="bg-muted px-1 rounded">X-Webhook-Secret</code> header with every webhook request so ReAlign can verify the source.
                    </p>
                  </div>

                  {/* Payload guide */}
                  <div className="rounded-md bg-muted p-3 space-y-1">
                    <p className="text-xs font-medium text-foreground">Webhook payload format</p>
                    <p className="text-xs text-muted-foreground">Your platform must send a JSON body that includes:</p>
                    <pre className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap font-mono">{`{
  "id": "msg_abc123",         // unique message ID (deduplication)
  "body": "Reply text here",  // the provider's reply
  "sender_role": "provider",  // must be "provider" or "staff"
  "patient_id": 42            // ReAlign patient ID  ← most reliable
  // OR "patient_email": "jane@example.com"
}`}</pre>
                  </div>
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
              <Button
                type="button"
                onClick={() => messagingMutation.mutate()}
                disabled={isSaveDisabled}
                data-testid="button-save-messaging"
              >
                <Save className="w-4 h-4 mr-2" />
                {messagingMutation.isPending ? "Saving..." : "Save Messaging Setting"}
              </Button>
            </div>
          </CardContent>
        </Card>}

        {/* Team Members — clinicians only */}
        {!isStaff && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Team Members
                </CardTitle>
                <CardDescription>
                  Invite nurses or assistants. Staff log in with their own credentials and share your workspace.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowInviteForm((v) => !v)}
                data-testid="button-invite-staff"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {showInviteForm ? "Cancel" : "Invite Staff"}
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Invite form */}
              {showInviteForm && (
                <div className="rounded-md border bg-muted/40 p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">Send an invite</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">First Name</label>
                      <Input
                        placeholder="Jane"
                        value={inviteFirstName}
                        onChange={(e) => setInviteFirstName(e.target.value)}
                        data-testid="input-staff-first-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Last Name</label>
                      <Input
                        placeholder="Smith"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                        data-testid="input-staff-last-name"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Email</label>
                      <Input
                        type="email"
                        placeholder="jane@clinic.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        data-testid="input-staff-email"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Role</label>
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger data-testid="select-staff-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nurse">Nurse</SelectItem>
                          <SelectItem value="assistant">Medical Assistant</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={() => inviteStaffMutation.mutate()}
                    disabled={inviteStaffMutation.isPending || !inviteEmail || !inviteFirstName || !inviteLastName}
                    data-testid="button-send-staff-invite"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    {inviteStaffMutation.isPending ? "Sending…" : "Send Invite"}
                  </Button>
                </div>
              )}

              {/* Staff list */}
              {staffList.length === 0 && !showInviteForm && (
                <p className="text-sm text-muted-foreground py-2">
                  No staff members yet. Invite a nurse or assistant to get started.
                </p>
              )}
              {staffList.length > 0 && (
                <div className="space-y-2">
                  {staffList.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between gap-3 rounded-md border px-4 py-3"
                      data-testid={`row-staff-${member.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                          {member.firstName[0]}{member.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize text-xs">
                          {member.role}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Remove ${member.firstName} ${member.lastName} from your team?`)) {
                              removeStaffMutation.mutate(member.id);
                            }
                          }}
                          disabled={removeStaffMutation.isPending}
                          data-testid={`button-remove-staff-${member.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Clinical Preferences — clinicians only */}
        {!isStaff && <PreferencesPanel />}

        {/* BAA Status */}
        {!isStaff && <BaaStatusCard />}

        {/* Billing & Subscription */}
        {!isStaff && <BillingCard onNavigate={() => setLocation("/billing")} />}
      </main>
    </div>
  );
}
