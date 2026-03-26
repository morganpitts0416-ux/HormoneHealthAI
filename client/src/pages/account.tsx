import { useState } from "react";
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
import {
  ArrowLeft, Save, CheckCircle, MessageSquare, Phone, BanIcon, Smartphone,
  Zap, Copy, Eye, EyeOff, Key, Globe, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

export default function Account() {
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [saved, setSaved] = useState(false);
  const [messagingSaved, setMessagingSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

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
              className="h-10 w-auto"
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
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {user?.title} {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-muted-foreground text-sm">{user?.clinicName}</p>
            <p className="text-muted-foreground/60 text-xs mt-0.5">@{user?.username}</p>
          </div>
        </div>

        {/* Profile form */}
        <Card>
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
        </Card>

        {/* Portal Messaging Preference */}
        <Card>
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
        </Card>

        {/* Billing placeholder */}
        <Card className="border-slate-200 border-dashed">
          <CardHeader>
            <CardTitle className="text-base text-slate-600">Billing & Subscription</CardTitle>
            <CardDescription>Payment management coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-400">
              Subscription billing will be available in a future update. You will be able to manage your plan and payment method here.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
