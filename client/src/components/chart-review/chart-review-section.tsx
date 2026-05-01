import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import type { SoapNote } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle2, XCircle, Clock, AlertTriangle, MessageSquare, ChevronRight, ArrowLeft, ShieldCheck, UserPlus, Trash2 } from "lucide-react";
import { format } from "date-fns";

type Agreement = {
  id: number;
  clinicId: number;
  midLevelUserId: number;
  reviewType: string;
  quotaKind: string;
  quotaValue: number;
  quotaPeriod: string;
  enforcementPeriod: string;
  ruleControlledSubstance: boolean;
  ruleNewDiagnosis: boolean;
  active: boolean;
  physicianLockedFields: string[] | null;
  minQuotaValue: number | null;
  role?: 'midlevel' | 'physician';
  collaboratorRole?: 'primary' | 'backup';
};

type ClinicMember = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string;
  title: string | null;
  displayName: string;
  clinicalRole: string | null;
};

type Item = {
  id: number;
  agreementId: number;
  encounterId: number;
  patientId: number;
  midLevelUserId: number;
  status: string;
  priority: string;
  mandatoryReasons: string[] | null;
  signedAt: string;
  quotaPeriodKey: string;
  enforcementDueAt: string | null;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  assignedReviewerUserId: number | null;
  patientName: string;
  encounterVisitDate: string;
  encounterChiefComplaint: string | null;
};

type Comment = {
  id: number;
  itemId: number;
  authorUserId: number;
  authorRole: string;
  body: string;
  type: string;
  createdAt: string;
};

type EncounterDetail = {
  id: number;
  visitDate: string | null;
  chiefComplaint: string | null;
  soapNote: SoapNote | null;
};

type ItemDetailResponse = {
  item: Item;
  comments: Comment[];
  encounter: EncounterDetail | null;
};

type CollaboratorRow = {
  id: number;
  agreementId: number;
  physicianUserId: number;
  role: 'primary' | 'backup';
  physicianName?: string | null;
};

// Narrows arbitrary thrown values to a user-facing message string so we can
// wire mutation onError handlers without resorting to `any` casts.
function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Something went wrong. Please try again.";
}

type MidLevelCard = {
  agreement: Agreement;
  midLevel: { id: number; firstName: string | null; lastName: string | null; title: string | null };
  role: 'primary' | 'backup';
  periodPctComplete: number;
  pendingCount: number;
  pastDueCount: number;
  maxDaysPastDue: number;
};

export function ChartReviewSection() {
  const { user } = useAuth();
  const userId = user?.id;

  const agreementsQuery = useQuery<Agreement[]>({
    queryKey: ['/api/chart-review/agreements'],
  });
  const agreements = agreementsQuery.data ?? [];
  const isMidLevel = agreements.some((a) => a.role === 'midlevel');
  const isPhysician = agreements.some((a) => a.role === 'physician');

  // Default tab: physician-first if both, else mid-level. We track only the
  // user's explicit selection; the *rendered* tab is derived so that whenever
  // the user's role flags change (e.g. data finishes loading, or they create
  // their first agreement), we always land on a tab that actually exists.
  const [tab, setTab] = useState<string | null>(null);
  const allowedTabs: string[] = [
    ...(isPhysician ? ["physician"] : []),
    ...(isMidLevel ? ["midlevel", "agreement"] : []),
  ];
  const effectiveTab = tab && allowedTabs.includes(tab)
    ? tab
    : (isPhysician ? "physician" : isMidLevel ? "midlevel" : "");

  if (agreementsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: "#1c2414" }}>
          <ShieldCheck className="w-4 h-4" />
          Chart Review
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Collaborating-physician oversight: agreements, quotas, signed-note review queues, and the two-way comment thread.
        </p>
      </div>

      {!isMidLevel && !isPhysician ? (
        <SetupAgreementCard userId={userId} />
      ) : (
        <Tabs value={effectiveTab} onValueChange={setTab} className="w-full">
          <TabsList>
            {isPhysician && <TabsTrigger value="physician" data-testid="tab-physician">As Collaborating Physician</TabsTrigger>}
            {isMidLevel && <TabsTrigger value="midlevel" data-testid="tab-midlevel">My Submissions</TabsTrigger>}
            {isMidLevel && <TabsTrigger value="agreement" data-testid="tab-agreement">Agreement</TabsTrigger>}
          </TabsList>
          {isPhysician && (
            <TabsContent value="physician">
              <PhysicianView />
            </TabsContent>
          )}
          {isMidLevel && (
            <TabsContent value="midlevel">
              <MidLevelView userId={userId} />
            </TabsContent>
          )}
          {isMidLevel && (
            <TabsContent value="agreement">
              <AgreementEditor agreement={agreements.find((a) => a.role === 'midlevel')!} userId={userId} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// ─── Setup card (mid-level creates first agreement) ────────────────────
function SetupAgreementCard({ userId }: { userId: number }) {
  const { toast } = useToast();
  const membersQuery = useQuery<ClinicMember[]>({ queryKey: ['/api/clinic/members'] });
  const members = membersQuery.data ?? [];
  const physicianCandidates = members.filter((m) => m.id !== userId);
  const [primary, setPrimary] = useState<string>("");
  const [quota, setQuota] = useState<number>(20);
  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/chart-review/agreements', {
        primaryPhysicianUserId: parseInt(primary),
        quotaValue: quota,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements'] });
      toast({ title: "Chart review agreement created" });
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Failed", description: errorMessage(e) }),
  });
  return (
    <Card data-testid="card-chart-review-setup">
      <CardHeader>
        <CardTitle className="text-sm">Set up your collaborating-physician agreement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          As a mid-level clinician, configure the physician who will review a percentage
          of your signed notes. You can adjust quota and rules anytime.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Primary collaborating physician</Label>
            <Select value={primary} onValueChange={setPrimary}>
              <SelectTrigger data-testid="select-primary-physician"><SelectValue placeholder="Choose physician" /></SelectTrigger>
              <SelectContent>
                {physicianCandidates.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)} data-testid={`option-physician-${m.id}`}>
                    {m.displayName}{m.title ? ` — ${m.title}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Monthly quota (%)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={quota}
              onChange={(e) => setQuota(parseInt(e.target.value || "0"))}
              data-testid="input-quota-value"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => createMut.mutate()} disabled={!primary || createMut.isPending} data-testid="button-create-agreement">
            {createMut.isPending ? "Creating…" : "Create agreement"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mid-level view ─────────────────────────────────────────────────────
function MidLevelView({ userId }: { userId: number }) {
  const queueQuery = useQuery<{ agreement: Agreement | null; items: Item[] }>({
    queryKey: ['/api/chart-review/queue/midlevel'],
  });
  const data = queueQuery.data;
  const items = data?.items ?? [];
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  const rejected = items.filter((i) => i.status === 'rejected');
  const pending = items.filter((i) => i.status === 'pending' || i.status === 'amended_pending');
  const concurred = items.filter((i) => i.status === 'concurred' || i.status === 'amended_concurred');
  const submittedPct = items.length > 0 ? Math.round((concurred.length / items.length) * 100) : 0;
  const queuedEncounterIds = new Set(items.map((i) => i.encounterId));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Submitted this period" value={items.length} testid="stat-submitted" />
        <StatCard label="Pending review" value={pending.length} testid="stat-pending" />
        <StatCard label="Physician completed" value={`${submittedPct}%`} testid="stat-completed-pct" />
      </div>
      {rejected.length > 0 && (
        <Card data-testid="card-rejected-items">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" />
              Notes that need your amendment ({rejected.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rejected.map((it) => (
              <ItemRow key={it.id} item={it} onClick={() => setOpenItemId(it.id)} />
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 flex-wrap">
          <CardTitle className="text-sm">Submitted notes</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setFlagOpen(true)} data-testid="button-flag-note">
            <ShieldCheck className="w-4 h-4 mr-1" />
            Add note to review queue
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No notes submitted yet.</p>}
          {items.map((it) => (
            <ItemRow key={it.id} item={it} onClick={() => setOpenItemId(it.id)} />
          ))}
        </CardContent>
      </Card>
      <ItemDetailDialog itemId={openItemId} onOpenChange={(o) => !o && setOpenItemId(null)} canDecide={false} />
      <FlagNoteDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        excludeEncounterIds={queuedEncounterIds}
      />
    </div>
  );
}

// ─── Flag-a-signed-note dialog (mid-level manually queues a chart) ──────
type SignedEncounter = {
  id: number;
  visitDate: string;
  visitType: string | null;
  chiefComplaint: string | null;
  signedAt: string | null;
  patientName?: string;
  patientId: number;
};

function FlagNoteDialog({
  open, onOpenChange, excludeEncounterIds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  excludeEncounterIds: Set<number>;
}) {
  const { toast } = useToast();
  const encQuery = useQuery<SignedEncounter[]>({
    queryKey: ['/api/encounters'],
    enabled: open,
  });
  const eligible = (encQuery.data ?? []).filter((e) => e.signedAt && !excludeEncounterIds.has(e.id));
  const [selected, setSelected] = useState<string>("");

  const flagMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/chart-review/flag', {
        encounterId: parseInt(selected),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/queue/midlevel'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/queue/physician'] });
      toast({ title: "Note flagged for review" });
      setSelected("");
      onOpenChange(false);
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Failed", description: errorMessage(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-flag-note">
        <DialogHeader>
          <DialogTitle>Add a signed note to your review queue</DialogTitle>
          <DialogDescription>
            Pick one of your signed notes to send to your collaborating physician.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Signed note</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger data-testid="select-flag-encounter"><SelectValue placeholder="Choose a signed note…" /></SelectTrigger>
            <SelectContent>
              {eligible.length === 0 && (
                <div className="text-xs text-muted-foreground p-2">No eligible signed notes.</div>
              )}
              {eligible.map((e) => (
                <SelectItem key={e.id} value={String(e.id)} data-testid={`option-encounter-${e.id}`}>
                  {e.patientName ?? `Patient #${e.patientId}`} — {format(new Date(e.visitDate), "MMM d, yyyy")}
                  {e.chiefComplaint ? ` — ${e.chiefComplaint.slice(0, 40)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-flag">Cancel</Button>
          <Button onClick={() => flagMut.mutate()} disabled={!selected || flagMut.isPending} data-testid="button-confirm-flag">
            {flagMut.isPending ? "Adding…" : "Add to queue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Physician view ────────────────────────────────────────────────────
function PhysicianView() {
  const cardsQuery = useQuery<MidLevelCard[]>({
    queryKey: ['/api/chart-review/queue/physician'],
  });
  const cards = cardsQuery.data ?? [];
  const [drillIn, setDrillIn] = useState<MidLevelCard | null>(null);

  if (drillIn) {
    return <PhysicianDrillIn card={drillIn} onBack={() => setDrillIn(null)} />;
  }

  return (
    <div className="space-y-4">
      {cards.length === 0 && (
        <Card><CardContent className="pt-4 text-sm text-muted-foreground">
          No mid-level clinicians have added you as a collaborating physician yet.
        </CardContent></Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Card
            key={c.agreement.id}
            className="hover-elevate cursor-pointer"
            onClick={() => setDrillIn(c)}
            data-testid={`card-midlevel-${c.midLevel.id}`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between gap-2 flex-wrap">
                <span>{c.midLevel.firstName} {c.midLevel.lastName}{c.midLevel.title ? `, ${c.midLevel.title}` : ""}</span>
                <Badge variant="secondary">{c.role}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Period progress</span>
                  <span data-testid={`text-progress-${c.midLevel.id}`}>{c.periodPctComplete}%</span>
                </div>
                <Progress value={c.periodPctComplete} />
              </div>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <Badge variant="outline" data-testid={`badge-pending-${c.midLevel.id}`}>
                  <Clock className="w-3 h-3 mr-1" />
                  {c.pendingCount} pending
                </Badge>
                {c.pastDueCount > 0 && (
                  <Badge variant="destructive" data-testid={`badge-pastdue-${c.midLevel.id}`}>
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    {c.pastDueCount} past-due ({c.maxDaysPastDue}d)
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-end text-xs text-muted-foreground">
                <span className="flex items-center gap-1">Open queue <ChevronRight className="w-3 h-3" /></span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PhysicianDrillIn({ card, onBack }: { card: MidLevelCard; onBack: () => void }) {
  const itemsQuery = useQuery<Item[]>({
    queryKey: ['/api/chart-review/agreements', card.agreement.id, 'items'],
    queryFn: async () => {
      const r = await fetch(`/api/chart-review/agreements/${card.agreement.id}/items`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });
  const items = itemsQuery.data ?? [];
  const [openItemId, setOpenItemId] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-grid">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h4 className="text-sm font-medium">
          {card.midLevel.firstName} {card.midLevel.lastName} — review queue
        </h4>
      </div>
      <Card>
        <CardContent className="pt-4 space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No items in the queue yet.</p>}
          {items.map((it) => (
            <ItemRow key={it.id} item={it} onClick={() => setOpenItemId(it.id)} />
          ))}
        </CardContent>
      </Card>
      <ItemDetailDialog itemId={openItemId} onOpenChange={(o) => !o && setOpenItemId(null)} canDecide={true} />
    </div>
  );
}

// ─── Item row + detail dialog ──────────────────────────────────────────
function ItemRow({ item, onClick }: { item: Item; onClick: () => void }) {
  const statusInfo = STATUS_BADGE[item.status] ?? { label: item.status, variant: "outline" as const };
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-md border p-3 hover-elevate cursor-pointer"
      onClick={onClick}
      data-testid={`row-item-${item.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate" data-testid={`text-patient-${item.id}`}>{item.patientName}</span>
          <span className="text-xs text-muted-foreground">
            {item.encounterVisitDate ? format(new Date(item.encounterVisitDate), "MMM d, yyyy") : ""}
          </span>
          {item.priority === 'mandatory' && (
            <Badge variant="secondary" data-testid={`badge-mandatory-${item.id}`}>Required</Badge>
          )}
        </div>
        {item.encounterChiefComplaint && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{item.encounterChiefComplaint}</div>
        )}
      </div>
      <Badge variant={statusInfo.variant} data-testid={`badge-status-${item.id}`}>{statusInfo.label}</Badge>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "outline" },
  concurred: { label: "Concurred", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  amended_pending: { label: "Amendment pending", variant: "outline" },
  amended_concurred: { label: "Amendment concurred", variant: "default" },
};

function ItemDetailDialog({ itemId, onOpenChange, canDecide }: {
  itemId: number | null;
  onOpenChange: (o: boolean) => void;
  canDecide: boolean;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const open = itemId !== null;
  const detailQuery = useQuery<ItemDetailResponse>({
    queryKey: ['/api/chart-review/items', itemId],
    enabled: open,
    queryFn: async () => {
      const r = await fetch(`/api/chart-review/items/${itemId}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });
  const data = detailQuery.data;
  const [comment, setComment] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);

  const concurMut = useMutation({
    mutationFn: async (withComment?: boolean) => {
      const res = await apiRequest('POST', `/api/chart-review/items/${itemId}/concur`, {
        comment: withComment ? comment.trim() : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Concurred" });
      queryClient.invalidateQueries();
      onOpenChange(false);
      setComment(""); setShowReject(false); setRejectReason("");
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Failed", description: errorMessage(e) }),
  });
  const rejectMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/chart-review/items/${itemId}/reject`, {
        reason: rejectReason.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Returned to mid-level for amendment" });
      queryClient.invalidateQueries();
      onOpenChange(false);
      setComment(""); setShowReject(false); setRejectReason("");
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Failed", description: errorMessage(e) }),
  });
  const commentMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/chart-review/items/${itemId}/comments`, {
        body: comment.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      detailQuery.refetch();
      toast({ title: "Comment added" });
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Failed", description: errorMessage(e) }),
  });

  const item = data?.item;
  const encounter = data?.encounter;
  const soap: SoapNote | null = encounter?.soapNote ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="dialog-item-detail">
        <DialogHeader>
          <DialogTitle>
            {item ? <>{item.patientName} — {item.encounterVisitDate ? format(new Date(item.encounterVisitDate), "MMM d, yyyy") : ""}</> : "Loading…"}
          </DialogTitle>
          {item?.priority === 'mandatory' && item.mandatoryReasons && item.mandatoryReasons.length > 0 && (
            <DialogDescription>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {item.mandatoryReasons.map((r, i) => (
                  <Badge key={i} variant="secondary" data-testid={`badge-reason-${i}`}>
                    {r.startsWith('controlled_substance:') ? `Controlled: ${r.split(':')[1]}` :
                      r.startsWith('new_diagnosis:') ? `New dx: ${r.split(':')[1]}` : r}
                  </Badge>
                ))}
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        {detailQuery.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

        {item && (
          <div className="space-y-4">
            {soap && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">SOAP Note</CardTitle></CardHeader>
                <CardContent className="text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto" data-testid="text-soap-note">
                  {soap.fullNote || [
                    soap.subjective ? `S: ${soap.subjective}` : "",
                    soap.objective ? `O: ${soap.objective}` : "",
                    soap.assessment ? `A: ${soap.assessment}` : "",
                    soap.plan ? `P: ${soap.plan}` : "",
                  ].filter(Boolean).join("\n\n")}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Comments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data?.comments ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">No comments yet.</p>
                )}
                {(data?.comments ?? []).map((c) => (
                  <div key={c.id} className="rounded-md border p-2" data-testid={`comment-${c.id}`}>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>
                        {c.authorRole === 'physician' ? 'Physician' : 'Mid-level'}
                        {c.type !== 'comment' && ` • ${c.type.replace('_', ' ')}`}
                      </span>
                      <span>{format(new Date(c.createdAt), "MMM d, h:mm a")}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))}
                <div className="space-y-2 pt-2">
                  <Textarea
                    placeholder="Add a comment…"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    data-testid="textarea-comment"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => commentMut.mutate()}
                      disabled={!comment.trim() || commentMut.isPending}
                      data-testid="button-add-comment"
                    >
                      Add comment
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {showReject && (
              <Card className="border-destructive/40">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-destructive">Reject reason (required)</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Explain what should be amended…"
                    data-testid="textarea-reject-reason"
                  />
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {canDecide && item && item.status !== 'concurred' && item.status !== 'amended_concurred' && (
            <>
              {showReject ? (
                <>
                  <Button variant="outline" onClick={() => { setShowReject(false); setRejectReason(""); }} data-testid="button-cancel-reject">Cancel reject</Button>
                  <Button variant="destructive" onClick={() => rejectMut.mutate()} disabled={!rejectReason.trim() || rejectMut.isPending} data-testid="button-confirm-reject">
                    <XCircle className="w-4 h-4 mr-1" />
                    {rejectMut.isPending ? "Rejecting…" : "Send back to mid-level"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="destructive" onClick={() => setShowReject(true)} data-testid="button-reject">
                    <XCircle className="w-4 h-4 mr-1" />Reject
                  </Button>
                  <Button variant="outline" onClick={() => concurMut.mutate(true)} disabled={!comment.trim() || concurMut.isPending} data-testid="button-concur-with-comment">
                    Concur with comment
                  </Button>
                  <Button onClick={() => concurMut.mutate(false)} disabled={concurMut.isPending} data-testid="button-concur">
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {concurMut.isPending ? "Concurring…" : "Concur"}
                  </Button>
                </>
              )}
            </>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-close-detail">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Agreement editor (mid-level) ───────────────────────────────────────
function AgreementEditor({ agreement, userId }: { agreement: Agreement; userId: number }) {
  const { toast } = useToast();
  const [reviewType, setReviewType] = useState(agreement.reviewType);
  const [quotaValue, setQuotaValue] = useState(agreement.quotaValue);
  const [quotaPeriod, setQuotaPeriod] = useState(agreement.quotaPeriod);
  const [enforcementPeriod, setEnforcementPeriod] = useState(agreement.enforcementPeriod);
  const [ruleControlledSubstance, setRuleControlledSubstance] = useState(agreement.ruleControlledSubstance);
  const [ruleNewDiagnosis, setRuleNewDiagnosis] = useState(agreement.ruleNewDiagnosis);
  const lockedFields: string[] = agreement.physicianLockedFields ?? [];
  const isLocked = (f: string) => lockedFields.includes(f);

  const collaboratorsQuery = useQuery<CollaboratorRow[]>({
    queryKey: ['/api/chart-review/agreements', agreement.id, 'collaborators'],
    queryFn: async () => {
      // No dedicated GET — derive from listChartReviewAgreementsForUser (returns own agreement, not collaborators).
      // Show via a separate endpoint would be ideal; for slice 1 we list nothing here besides the primary.
      return [];
    },
  });

  const membersQuery = useQuery<ClinicMember[]>({ queryKey: ['/api/clinic/members'] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/chart-review/agreements/${agreement.id}`, {
        reviewType, quotaValue, quotaPeriod, enforcementPeriod,
        ruleControlledSubstance, ruleNewDiagnosis,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements'] });
      toast({ title: "Agreement updated" });
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Failed", description: errorMessage(e) }),
  });

  const addCollabMut = useMutation({
    mutationFn: async (vars: { physicianUserId: number; role: 'primary' | 'backup' }) => {
      const res = await apiRequest('POST', `/api/chart-review/agreements/${agreement.id}/collaborators`, vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Collaborator added" });
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Failed", description: errorMessage(e) }),
  });

  const [newCollabId, setNewCollabId] = useState<string>("");
  const [newCollabRole, setNewCollabRole] = useState<'primary' | 'backup'>("backup");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Quota & rules</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {agreement.minQuotaValue != null && (
            <p className="text-xs text-muted-foreground">
              Clinic admin floor: at least {agreement.minQuotaValue}%. Lowering below will be clamped.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Review type {isLocked('reviewType') && <Badge variant="outline" className="ml-1">locked</Badge>}</Label>
              <Select value={reviewType} onValueChange={setReviewType} disabled={isLocked('reviewType')}>
                <SelectTrigger data-testid="select-review-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retrospective">Retrospective (standard)</SelectItem>
                  <SelectItem value="prospective">Prospective (Slice 2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quota value (%) {isLocked('quotaValue') && <Badge variant="outline" className="ml-1">locked</Badge>}</Label>
              <Input type="number" min={1} max={100} value={quotaValue} onChange={(e) => setQuotaValue(parseInt(e.target.value || "0"))} disabled={isLocked('quotaValue')} data-testid="input-quota-value" />
            </div>
            <div>
              <Label className="text-xs">Quota period {isLocked('quotaPeriod') && <Badge variant="outline" className="ml-1">locked</Badge>}</Label>
              <Select value={quotaPeriod} onValueChange={setQuotaPeriod} disabled={isLocked('quotaPeriod')}>
                <SelectTrigger data-testid="select-quota-period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Enforcement period {isLocked('enforcementPeriod') && <Badge variant="outline" className="ml-1">locked</Badge>}</Label>
              <Select value={enforcementPeriod} onValueChange={setEnforcementPeriod} disabled={isLocked('enforcementPeriod')}>
                <SelectTrigger data-testid="select-enforcement-period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Always queue charts with controlled substances {isLocked('ruleControlledSubstance') && <Badge variant="outline" className="ml-1">locked</Badge>}</Label>
              <Switch checked={ruleControlledSubstance} onCheckedChange={setRuleControlledSubstance} disabled={isLocked('ruleControlledSubstance')} data-testid="switch-rule-controlled" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Always queue charts with new diagnoses {isLocked('ruleNewDiagnosis') && <Badge variant="outline" className="ml-1">locked</Badge>}</Label>
              <Switch checked={ruleNewDiagnosis} onCheckedChange={setRuleNewDiagnosis} disabled={isLocked('ruleNewDiagnosis')} data-testid="switch-rule-newdx" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="button-save-agreement">
              {saveMut.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Add backup collaborating physician</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Backup physicians share the queue but do not increase your quota.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-48">
              <Label className="text-xs">Physician</Label>
              <Select value={newCollabId} onValueChange={setNewCollabId}>
                <SelectTrigger data-testid="select-new-collaborator"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {(membersQuery.data ?? []).filter((m) => m.id !== userId).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <Select value={newCollabRole} onValueChange={(v) => setNewCollabRole(v === "primary" ? "primary" : "backup")}>
                <SelectTrigger data-testid="select-new-collaborator-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="backup">Backup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => addCollabMut.mutate({ physicianUserId: parseInt(newCollabId), role: newCollabRole })}
              disabled={!newCollabId || addCollabMut.isPending}
              data-testid="button-add-collaborator"
            >
              <UserPlus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, testid }: { label: string; value: number | string; testid: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold mt-1" data-testid={testid}>{value}</div>
      </CardContent>
    </Card>
  );
}
