import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Loader2,
  FlaskConical,
} from "lucide-react";

const PROD_BASE = "https://app.realignlabeval.com";

interface SpruceSettings {
  id?: number;
  clinicId?: number;
  isEnabled: boolean;
  spruceAutoReplyEnabled: boolean;
  spruceOrgId: string | null;
  spruceWebhookEndpointId: string | null;
  webhookSecretConfigured: boolean;
  apiTokenConfigured: boolean;
}

function ConfiguredBadge({ yes }: { yes: boolean }) {
  return yes ? (
    <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400 font-medium">
      <CheckCircle2 className="w-3.5 h-3.5" /> Configured
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <XCircle className="w-3.5 h-3.5" /> Not set
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={copy}
      title="Copy to clipboard"
      data-testid="button-copy-webhook-url"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}

function SpruceManageDialog({
  open,
  onClose,
  clinicId,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<SpruceSettings | null>({
    queryKey: ["/api/clinic/spruce-settings"],
    enabled: open,
  });

  const [isEnabled, setIsEnabled] = useState(false);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [endpointId, setEndpointId] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [simulateMsg, setSimulateMsg] = useState("");
  const [simulatePhone, setSimulatePhone] = useState("");
  const [simulateResult, setSimulateResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && settings !== undefined && open) {
      setIsEnabled(settings?.isEnabled ?? false);
      setAutoReplyEnabled(settings?.spruceAutoReplyEnabled ?? false);
      setOrgId(settings?.spruceOrgId ?? "");
      setEndpointId(settings?.spruceWebhookEndpointId ?? "");
    }
  }, [isLoading, settings, open]);

  useEffect(() => {
    if (!open) {
      setWebhookSecret("");
      setApiToken("");
      setSimulateOpen(false);
      setSimulateMsg("");
      setSimulatePhone("");
      setSimulateResult(null);
    }
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        isEnabled,
        spruceAutoReplyEnabled: autoReplyEnabled,
        spruceOrgId: orgId.trim() || null,
        spruceWebhookEndpointId: endpointId.trim() || null,
      };
      if (webhookSecret) body.webhookSecret = webhookSecret;
      if (apiToken) body.apiToken = apiToken;
      const res = await apiRequest("PUT", "/api/clinic/spruce-settings", body);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/spruce-settings"] });
      setWebhookSecret("");
      setApiToken("");
      toast({ title: "Spruce settings saved" });
    },
    onError: (e: any) => {
      toast({ variant: "destructive", title: "Save failed", description: e.message });
    },
  });

  const simulateMutation = useMutation({
    mutationFn: async () => {
      if (!simulateMsg.trim()) throw new Error("Message text is required");
      const res = await apiRequest("POST", "/api/integrations/spruce/simulate", {
        messageText: simulateMsg.trim(),
        patientPhone: simulatePhone.trim() || "+15550000000",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Simulate failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const workflow = data?.classification?.workflow ?? "unclassified";
      const confidence = data?.classification?.confidence ?? "";
      const reqId = data?.workflowRequest?.id;
      setSimulateResult(
        `Classified as: ${workflow} (${confidence})${reqId ? ` · Request #${reqId} created` : " · No request created"}`
      );
    },
    onError: (e: any) => {
      setSimulateResult(`Error: ${e.message}`);
    },
  });

  const webhookUrl = `${PROD_BASE}/api/integrations/spruce/clinic/${clinicId}/webhook`;
  const isConnected = !!(settings?.id);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-spruce-manage">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Spruce Integration
          </DialogTitle>
          <DialogDescription>
            Route inbound Spruce patient messages into ClinIQ workflows. Spruce is completely optional — no settings are required for normal ClinIQ use.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 pt-1">

            {/* Master enable */}
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Enable Spruce integration</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When off, no Spruce webhooks are processed and no workflow tasks are created.
                </p>
              </div>
              <Switch
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
                data-testid="toggle-spruce-enabled"
              />
            </div>

            {/* Auto-reply */}
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Spruce automated replies</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Outbound patient replies via Spruce. Separate from the ClinIQ June AI assistant. Keep off — not yet implemented.
                </p>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
                disabled={!isEnabled}
                data-testid="toggle-spruce-auto-reply"
              />
            </div>

            <Separator />

            {/* Config fields */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="spruce-org-id" className="text-xs font-medium">
                  Spruce Organization ID
                </Label>
                <Input
                  id="spruce-org-id"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  placeholder="e.g. org_abc123"
                  className="text-sm"
                  data-testid="input-spruce-org-id"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="spruce-endpoint-id" className="text-xs font-medium">
                  Spruce Webhook Endpoint ID
                </Label>
                <Input
                  id="spruce-endpoint-id"
                  value={endpointId}
                  onChange={(e) => setEndpointId(e.target.value)}
                  placeholder="e.g. wh_xyz789"
                  className="text-sm"
                  data-testid="input-spruce-endpoint-id"
                />
              </div>

              {/* Secrets — write-only */}
              <div className="space-y-1.5">
                <Label htmlFor="spruce-webhook-secret" className="text-xs font-medium">
                  Webhook Secret{" "}
                  <ConfiguredBadge yes={settings?.webhookSecretConfigured ?? false} />
                </Label>
                <Input
                  id="spruce-webhook-secret"
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={
                    settings?.webhookSecretConfigured
                      ? "Leave blank to keep existing secret"
                      : "Enter webhook secret"
                  }
                  className="text-sm font-mono"
                  data-testid="input-spruce-webhook-secret"
                  autoComplete="new-password"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="spruce-api-token" className="text-xs font-medium">
                  API Token{" "}
                  <ConfiguredBadge yes={settings?.apiTokenConfigured ?? false} />
                </Label>
                <Input
                  id="spruce-api-token"
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder={
                    settings?.apiTokenConfigured
                      ? "Leave blank to keep existing token"
                      : "Enter API token"
                  }
                  className="text-sm font-mono"
                  data-testid="input-spruce-api-token"
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Secret values are encrypted before storage and never displayed after saving.
                </p>
              </div>
            </div>

            <Separator />

            {/* Webhook URL */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Production Webhook URL</p>
              <p className="text-xs text-muted-foreground">
                Paste this URL into your Spruce webhook configuration for this clinic.
              </p>
              <div className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1.5">
                <code className="text-xs flex-1 break-all select-all" data-testid="text-webhook-url">
                  {webhookUrl}
                </code>
                <CopyButton text={webhookUrl} />
              </div>
            </div>

            {/* Save */}
            <Button
              className="w-full"
              style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-spruce-save"
            >
              {saveMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Saving…</>
              ) : (
                "Save Spruce Settings"
              )}
            </Button>

            <Separator />

            {/* Simulate tool */}
            <div>
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                onClick={() => { setSimulateOpen(v => !v); setSimulateResult(null); }}
                data-testid="button-toggle-simulate"
              >
                {simulateOpen
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />
                }
                <FlaskConical className="w-3.5 h-3.5" />
                Test / Simulate inbound message
              </button>

              {simulateOpen && (
                <div className="mt-3 space-y-2.5 rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Simulates an inbound Spruce message without a real webhook call. Useful for testing workflow classification and dashboard routing.
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Message text</Label>
                    <Input
                      value={simulateMsg}
                      onChange={(e) => setSimulateMsg(e.target.value)}
                      placeholder='e.g. "I need a refill on my testosterone cream"'
                      className="text-sm"
                      data-testid="input-simulate-message"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Patient phone (optional)</Label>
                    <Input
                      value={simulatePhone}
                      onChange={(e) => setSimulatePhone(e.target.value)}
                      placeholder="+15550001234"
                      className="text-sm font-mono"
                      data-testid="input-simulate-phone"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => simulateMutation.mutate()}
                    disabled={simulateMutation.isPending || !simulateMsg.trim()}
                    data-testid="button-run-simulate"
                  >
                    {simulateMutation.isPending
                      ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Running…</>
                      : <><FlaskConical className="w-3 h-3 mr-1.5" />Run Simulation</>
                    }
                  </Button>
                  {simulateResult && (
                    <p className="text-xs font-mono rounded-md bg-muted px-2.5 py-1.5 break-all" data-testid="text-simulate-result">
                      {simulateResult}
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function IntegrationsSection() {
  const { user } = useAuth();
  const clinicId = (user as any)?.defaultClinicId as number | undefined;

  const { data: spruceSettings } = useQuery<SpruceSettings | null>({
    queryKey: ["/api/clinic/spruce-settings"],
    enabled: !!clinicId,
  });

  const [spruceDialogOpen, setSpruceDialogOpen] = useState(false);

  const isSpruceConnected = !!(spruceSettings?.id);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Integrations</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Connect optional third-party services to extend ClinIQ workflows. All integrations are optional and do not affect core ClinIQ features.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Spruce card */}
        <Card data-testid="card-spruce-integration">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Spruce</p>
                  <p className="text-xs text-muted-foreground">Patient messaging</p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  isSpruceConnected
                    ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950"
                    : "text-muted-foreground"
                }
                data-testid="badge-spruce-status"
              >
                {isSpruceConnected ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1" />Connected</>
                ) : (
                  "Not Connected"
                )}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Connect Spruce to route inbound patient messages into ClinIQ workflows — medication refills, appointment requests, urgent triage, and more.
            </p>

            {!clinicId ? (
              <p className="text-xs text-muted-foreground italic">Clinic context required.</p>
            ) : (
              <Button
                size="sm"
                variant={isSpruceConnected ? "outline" : "default"}
                style={!isSpruceConnected ? { backgroundColor: "#2e3a20", color: "#f9f6f0" } : {}}
                onClick={() => setSpruceDialogOpen(true)}
                data-testid="button-spruce-connect-manage"
              >
                {isSpruceConnected ? "Manage" : "Connect Spruce"}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Placeholder card — more integrations coming */}
        <Card className="border-dashed opacity-50">
          <CardContent className="pt-5 flex flex-col items-center justify-center text-center py-8 gap-2">
            <p className="text-sm font-medium text-muted-foreground">More integrations coming soon</p>
            <p className="text-xs text-muted-foreground">EHR connectors, lab platforms, and more.</p>
          </CardContent>
        </Card>
      </div>

      {clinicId && (
        <SpruceManageDialog
          open={spruceDialogOpen}
          onClose={() => setSpruceDialogOpen(false)}
          clinicId={clinicId}
        />
      )}
    </div>
  );
}
