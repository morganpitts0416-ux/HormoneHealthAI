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
import { CheckCircle2, XCircle, Clock, AlertTriangle, MessageSquare, ChevronRight, ArrowLeft, ShieldCheck, UserPlus, Trash2, Mail, Send } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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
  role?: 'midlevel' | 'physician' | 'admin';
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

type CollaboratorsList = {
  /** All chart-review items currently queued under this agreement. Tells the
   *  inviting mid-level/admin how many charts a pending invitee will inherit
   *  the moment they accept (everyone on an agreement shares the queue). */
  queuedItemCount: number;
  seated: Array<{
    id: number;
    physicianUserId: number;
    role: 'primary' | 'backup';
    displayName: string;
    email: string;
    accessScope: 'full' | 'chart_review_only' | null;
    clinicalRole: string | null;
  }>;
  pending: Array<{
    id: number;
    email: string;
    displayName: string;
    credentials: 'MD' | 'DO' | null;
    accessScope: 'full' | 'chart_review_only';
    inviteExpires: string;
    createdAt: string;
  }>;
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
  // Admin oversight: clinic owners/admins receive an extra "Admin oversight"
  // tab that lists every agreement in the clinic (server tags those as
  // role:'admin'), so admins who aren't on an agreement can still invite,
  // cancel pending invites, and upgrade chart-review-only collaborators.
  const isAdmin = user?.adminRole === "owner" || user?.adminRole === "admin";
  const adminAgreements = agreements.filter((a) => a.role === 'admin');
  const showAdminTab = isAdmin && adminAgreements.length > 0;
  const [adminAgreementId, setAdminAgreementId] = useState<number | null>(null);
  const selectedAdminAgreement = adminAgreements.find((a) => a.id === adminAgreementId)
    ?? adminAgreements[0]
    ?? null;

  // Default tab: physician-first if both, else mid-level, else admin oversight.
  const [tab, setTab] = useState<string | null>(null);
  const allowedTabs: string[] = [
    ...(isPhysician ? ["physician"] : []),
    ...(isMidLevel ? ["midlevel", "agreement"] : []),
    ...(showAdminTab ? ["admin"] : []),
  ];
  const effectiveTab = tab && allowedTabs.includes(tab)
    ? tab
    : (isPhysician ? "physician" : isMidLevel ? "midlevel" : showAdminTab ? "admin" : "");

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

      {!isMidLevel && !isPhysician && !showAdminTab ? (
        <SetupAgreementCard userId={userId} />
      ) : (
        <Tabs value={effectiveTab} onValueChange={setTab} className="w-full">
          <TabsList>
            {isPhysician && <TabsTrigger value="physician" data-testid="tab-physician">As Collaborating Physician</TabsTrigger>}
            {isMidLevel && <TabsTrigger value="midlevel" data-testid="tab-midlevel">My Submissions</TabsTrigger>}
            {isMidLevel && <TabsTrigger value="agreement" data-testid="tab-agreement">Agreement</TabsTrigger>}
            {showAdminTab && <TabsTrigger value="admin" data-testid="tab-admin-oversight">Admin oversight</TabsTrigger>}
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
          {showAdminTab && (
            <TabsContent value="admin">
              <div className="space-y-3">
                {adminAgreements.length > 1 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Agreement</Label>
                    <Select
                      value={String(selectedAdminAgreement?.id ?? "")}
                      onValueChange={(v) => setAdminAgreementId(parseInt(v))}
                    >
                      <SelectTrigger className="w-[260px]" data-testid="select-admin-agreement">
                        <SelectValue placeholder="Select agreement" />
                      </SelectTrigger>
                      <SelectContent>
                        {adminAgreements.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)} data-testid={`option-admin-agreement-${a.id}`}>
                            Agreement #{a.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {selectedAdminAgreement && (
                  <AgreementEditor agreement={selectedAdminAgreement} userId={userId} />
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

// Collaborating-physician role of record is reserved by most state
// scope-of-practice rules to MDs and DOs only. Mirrors the server-side
// guard in createChartReviewAgreement / addChartReviewCollaborator.
const COLLAB_TITLES = new Set(["MD", "DO"]);
function isCollabEligible(m: ClinicMember): boolean {
  return COLLAB_TITLES.has((m.title ?? "").trim().toUpperCase());
}

// ─── Setup card (mid-level creates first agreement) ────────────────────
function SetupAgreementCard({ userId }: { userId: number }) {
  const { toast } = useToast();
  const membersQuery = useQuery<ClinicMember[]>({ queryKey: ['/api/clinic/members'] });
  const members = membersQuery.data ?? [];
  // Filter to MD/DO only — picker should never offer an ineligible candidate.
  const physicianCandidates = members.filter((m) => m.id !== userId && isCollabEligible(m));
  const [primary, setPrimary] = useState<string>("");
  const [quotaKind, setQuotaKind] = useState<'percent' | 'count'>("percent");
  const [quota, setQuota] = useState<number>(20);
  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/chart-review/agreements', {
        primaryPhysicianUserId: parseInt(primary),
        quotaKind,
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
          As a mid-level clinician, configure the physician (MD or DO) who will review
          a percentage — or fixed count — of your signed notes. You can adjust quota
          and rules anytime.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Primary collaborating physician (MD/DO)</Label>
            <Select value={primary} onValueChange={setPrimary}>
              <SelectTrigger data-testid="select-primary-physician">
                <SelectValue placeholder={physicianCandidates.length === 0 ? "No MD/DO members in this clinic" : "Choose physician"} />
              </SelectTrigger>
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
            <Label className="text-xs">Quota kind</Label>
            <Select value={quotaKind} onValueChange={(v) => setQuotaKind(v as 'percent' | 'count')}>
              <SelectTrigger data-testid="select-quota-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percent of signed notes</SelectItem>
                <SelectItem value="count">Fixed count of charts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">
              {quotaKind === 'percent' ? "Monthly quota (%)" : "Monthly quota (charts)"}
            </Label>
            <Input
              type="number"
              min={1}
              max={quotaKind === 'percent' ? 100 : 999}
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
  const [quotaKind, setQuotaKind] = useState<'percent' | 'count'>((agreement.quotaKind as 'percent' | 'count') ?? 'percent');
  const [quotaValue, setQuotaValue] = useState(agreement.quotaValue);
  const [quotaPeriod, setQuotaPeriod] = useState(agreement.quotaPeriod);
  const [enforcementPeriod, setEnforcementPeriod] = useState(agreement.enforcementPeriod);
  const [ruleControlledSubstance, setRuleControlledSubstance] = useState(agreement.ruleControlledSubstance);
  const [ruleNewDiagnosis, setRuleNewDiagnosis] = useState(agreement.ruleNewDiagnosis);
  const lockedFields: string[] = agreement.physicianLockedFields ?? [];
  const isLocked = (f: string) => lockedFields.includes(f);

  // Lists both seated (active) collaborators AND pending external invites for
  // this agreement. The pending list satisfies the "newly invited reviewer
  // appears immediately even before they accept" UX requirement.
  const collaboratorsQuery = useQuery<CollaboratorsList>({
    queryKey: ['/api/chart-review/agreements', agreement.id, 'collaborators'],
    queryFn: async () => {
      const res = await fetch(`/api/chart-review/agreements/${agreement.id}/collaborators`);
      if (!res.ok) return { seated: [], pending: [] };
      return res.json();
    },
  });

  const membersQuery = useQuery<ClinicMember[]>({ queryKey: ['/api/clinic/members'] });

  const saveMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/chart-review/agreements/${agreement.id}`, {
        reviewType, quotaKind, quotaValue, quotaPeriod, enforcementPeriod,
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
  const [externalOpen, setExternalOpen] = useState(false);

  const { user: authUser } = useAuth();
  const isAdmin = authUser?.adminRole === "owner" || authUser?.adminRole === "admin";

  // Cancel a still-pending external-physician invite. Releases any reserved
  // Stripe seat (the server handles that) and refreshes the collaborator list.
  const cancelInviteMut = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest('POST', `/api/chart-review/agreements/${agreement.id}/invites/${inviteId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements', agreement.id, 'collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements', agreement.id, 'invites'] });
      toast({ title: "Invite cancelled" });
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Cancel failed", description: errorMessage(e) }),
  });

  // Re-email the original invite token. The server bumps the invite's
  // expiration so the resent link works even if the original 72h window
  // had already lapsed.
  const resendInviteMut = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest('POST', `/api/chart-review/agreements/${agreement.id}/invites/${inviteId}/resend`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements', agreement.id, 'collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements', agreement.id, 'invites'] });
      toast({ title: "Invite resent", description: "We re-emailed the same invite link and refreshed its expiration." });
    },
    onError: (e: unknown) => toast({ variant: "destructive", title: "Resend failed", description: errorMessage(e) }),
  });

  // Dedicated pending-invites query — sourced from the new
  // GET /api/chart-review/agreements/:id/invites endpoint so the panel can
  // refresh independently of the collaborators list.
  const invitesQuery = useQuery<Array<{
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    credentials: 'MD' | 'DO' | null;
    accessScope: 'full' | 'chart_review_only';
    inviteExpires: string;
    createdAt: string;
  }>>({
    queryKey: ['/api/chart-review/agreements', agreement.id, 'invites'],
    queryFn: async () => {
      const res = await fetch(`/api/chart-review/agreements/${agreement.id}/invites`);
      if (!res.ok) return [];
      return res.json();
    },
  });
  const pendingInvites = invitesQuery.data ?? [];

  // Promote an existing chart-review-only collaborator to a full clinic
  // provider (admin-only). Reuses the same /api/clinic/upgrade-collaborator
  // endpoint the seat-prompt path uses, including the 402 confirmation
  // round-trip when an extra Stripe seat is needed.
  const [upgradeTarget, setUpgradeTarget] = useState<{
    userId: number;
    displayName: string;
  } | null>(null);
  const [upgradeSeatPrompt, setUpgradeSeatPrompt] = useState<{
    message: string;
    seatPrice?: number;
  } | null>(null);
  const [upgradeConfirm, setUpgradeConfirm] = useState(false);
  const upgradeMut = useMutation({
    mutationFn: async (vars: { userId: number; confirmExtraSeat?: boolean }) => {
      const res = await apiRequest('POST', `/api/clinic/upgrade-collaborator`, {
        userId: vars.userId,
        confirmExtraSeat: vars.confirmExtraSeat ?? false,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements', agreement.id, 'collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clinic/members'] });
      toast({
        title: "Upgraded to full provider",
        description: data?.billingUpdated
          ? "An extra seat was added to your subscription."
          : "No seat charge — your plan had room.",
      });
      setUpgradeTarget(null);
      setUpgradeSeatPrompt(null);
      setUpgradeConfirm(false);
    },
    onError: (e: any) => {
      const msg = typeof e?.message === "string" ? e.message : "";
      if (msg.startsWith("402:")) {
        let detail: any = null;
        try { detail = JSON.parse(msg.slice(4).trim()); } catch { /* ignore */ }
        if (detail?.requiresSeatConfirmation) {
          setUpgradeSeatPrompt({
            message: detail?.message ?? "Upgrading this collaborator will add an extra seat to your subscription.",
            seatPrice: detail?.seatPrice,
          });
          return;
        }
      }
      toast({ variant: "destructive", title: "Upgrade failed", description: errorMessage(e) });
    },
  });

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
                  <SelectItem value="prospective">Prospective (full gate)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                Quota kind {isLocked('quotaKind') && <Badge variant="outline" className="ml-1">locked</Badge>}
              </Label>
              <Select
                value={quotaKind}
                onValueChange={(v) => setQuotaKind(v === 'count' ? 'count' : 'percent')}
                disabled={isLocked('quotaKind')}
              >
                <SelectTrigger data-testid="select-quota-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percent of signed notes</SelectItem>
                  <SelectItem value="count">Fixed count of charts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {quotaKind === 'percent' ? "Quota value (%)" : "Quota value (charts)"}
                {isLocked('quotaValue') && <Badge variant="outline" className="ml-1">locked</Badge>}
              </Label>
              <Input
                type="number"
                min={1}
                max={quotaKind === 'percent' ? 100 : 999}
                value={quotaValue}
                onChange={(e) => setQuotaValue(parseInt(e.target.value || "0"))}
                disabled={isLocked('quotaValue')}
                data-testid="input-quota-value"
              />
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
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 flex-wrap">
          <CardTitle className="text-sm">Add backup collaborating physician</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExternalOpen(true)}
            data-testid="button-open-invite-external"
          >
            <Mail className="w-4 h-4 mr-1" />
            Invite outside MD/DO
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Backup physicians share the queue but do not increase your quota.
            Only MD or DO members can serve as collaborating physicians.
            Outside physicians joining for chart review only do not consume a clinic seat.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-48">
              <Label className="text-xs">Physician (MD/DO)</Label>
              <Select value={newCollabId} onValueChange={setNewCollabId}>
                <SelectTrigger data-testid="select-new-collaborator">
                  <SelectValue placeholder={
                    (membersQuery.data ?? []).filter((m) => m.id !== userId && isCollabEligible(m)).length === 0
                      ? "No MD/DO members in this clinic"
                      : "Choose…"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {(membersQuery.data ?? [])
                    .filter((m) => m.id !== userId && isCollabEligible(m))
                    .map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.displayName}{m.title ? ` — ${m.title}` : ""}
                      </SelectItem>
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

          {/* Active collaborators on this agreement. Pending external invites
              are surfaced in a dedicated "Pending invites" card below so admins
              can resend or cancel them without scrolling through seated rows. */}
          {(collaboratorsQuery.data?.seated?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Collaborators on this agreement</Label>
              <div className="flex flex-col gap-1.5">
                {(collaboratorsQuery.data?.seated ?? []).map((s) => {
                  const isExternal = s.accessScope === "chart_review_only";
                  return (
                    <div
                      key={`seated-${s.id}`}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 flex-wrap"
                      data-testid={`row-seated-collaborator-${s.physicianUserId}`}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" data-testid={`badge-seated-collaborator-${s.physicianUserId}`}>
                          {s.displayName}
                        </Badge>
                        <Badge variant="outline" className="text-xs">{s.role}</Badge>
                        <Badge
                          variant="outline"
                          className="text-xs"
                          data-testid={`badge-scope-${s.physicianUserId}`}
                        >
                          {isExternal ? "Active · chart-review" : "Active · full"}
                        </Badge>
                      </div>
                      {isExternal && isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setUpgradeTarget({ userId: s.physicianUserId, displayName: s.displayName }); setUpgradeConfirm(false); setUpgradeSeatPrompt(null); }}
                          data-testid={`button-upgrade-collaborator-${s.physicianUserId}`}
                        >
                          Upgrade to full access
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending invites panel — every clinic_provider_invites row with
          status='pending' for this agreement. Each row shows email, name,
          access scope, sent date, plus Resend (re-emails the original token
          and refreshes the 72h expiration) and Cancel (marks status='cancelled'
          and audit-logs). Hidden entirely when there are no pending invites
          so admins aren't shown an empty-state on every visit. */}
      {pendingInvites.length > 0 && (
        <Card data-testid="card-pending-invites">
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Pending invites
              <Badge variant="outline" className="text-xs" data-testid="badge-pending-invites-count">
                {pendingInvites.length}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground" data-testid="text-pending-handoff-note">
              Outside physicians who haven't accepted their email invite yet.
              They'll inherit this agreement's queue ({collaboratorsQuery.data?.queuedItemCount ?? 0}{" "}
              chart{collaboratorsQuery.data?.queuedItemCount === 1 ? "" : "s"} currently waiting) the moment they accept.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvites.map((p) => {
              const expiresAt = new Date(p.inviteExpires);
              const sentAt = new Date(p.createdAt);
              const expired = expiresAt.getTime() <= Date.now();
              return (
                <div
                  key={`pending-${p.id}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-dashed p-3 flex-wrap"
                  data-testid={`row-pending-invite-${p.id}`}
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" data-testid={`text-pending-invite-name-${p.id}`}>
                        {p.displayName}
                      </span>
                      {p.credentials && (
                        <Badge variant="outline" className="text-xs" data-testid={`badge-pending-invite-credentials-${p.id}`}>
                          {p.credentials}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs" data-testid={`badge-pending-invite-scope-${p.id}`}>
                        {p.accessScope === "full" ? "Full clinic access" : "Chart-review only"}
                      </Badge>
                      {expired && (
                        <Badge variant="destructive" className="text-xs" data-testid={`badge-pending-invite-expired-${p.id}`}>
                          Link expired
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground break-all" data-testid={`text-pending-invite-email-${p.id}`}>
                      {p.email}
                    </div>
                    <div className="text-xs text-muted-foreground" data-testid={`text-pending-invite-sent-${p.id}`}>
                      Sent {format(sentAt, "MMM d, yyyy 'at' h:mm a")} ·{" "}
                      {expired
                        ? `Expired ${formatDistanceToNow(expiresAt, { addSuffix: true })}`
                        : `Expires ${formatDistanceToNow(expiresAt, { addSuffix: true })}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendInviteMut.mutate(p.id)}
                      disabled={resendInviteMut.isPending || cancelInviteMut.isPending}
                      data-testid={`button-resend-invite-${p.id}`}
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      {resendInviteMut.isPending && resendInviteMut.variables === p.id ? "Resending…" : "Resend"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelInviteMut.mutate(p.id)}
                      disabled={cancelInviteMut.isPending || resendInviteMut.isPending}
                      data-testid={`button-cancel-invite-${p.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Admin-only confirm dialog for upgrading an external reviewer to full
          provider. Mirrors the invite dialog's seat-confirm pattern: server may
          short-circuit with 402 + requiresSeatConfirmation when an extra seat
          is needed; we then surface the seat price and re-submit with confirm. */}
      <Dialog open={!!upgradeTarget} onOpenChange={(o) => { if (!o) { setUpgradeTarget(null); setUpgradeSeatPrompt(null); setUpgradeConfirm(false); } }}>
        <DialogContent data-testid="dialog-upgrade-collaborator">
          <DialogHeader>
            <DialogTitle>Upgrade to full clinic access</DialogTitle>
            <DialogDescription>
              {upgradeTarget?.displayName} currently has chart-review-only
              access in this clinic. Upgrading converts them to a full provider
              with access to all patients, encounters, and clinic data.
            </DialogDescription>
          </DialogHeader>
          {upgradeSeatPrompt && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
              <p className="text-xs" data-testid="text-upgrade-seat-prompt">{upgradeSeatPrompt.message}</p>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={upgradeConfirm}
                  onChange={(e) => setUpgradeConfirm(e.target.checked)}
                  data-testid="checkbox-upgrade-confirm-seat"
                />
                Yes, add an extra seat to my subscription
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setUpgradeTarget(null); setUpgradeSeatPrompt(null); setUpgradeConfirm(false); }}
              data-testid="button-cancel-upgrade"
            >
              Cancel
            </Button>
            <Button
              onClick={() => upgradeTarget && upgradeMut.mutate({
                userId: upgradeTarget.userId,
                confirmExtraSeat: !!upgradeSeatPrompt && upgradeConfirm,
              })}
              disabled={upgradeMut.isPending || (!!upgradeSeatPrompt && !upgradeConfirm)}
              data-testid="button-confirm-upgrade"
            >
              {upgradeMut.isPending ? "Upgrading…" : upgradeSeatPrompt ? "Confirm & upgrade" : "Upgrade"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InviteExternalCollaboratorDialog
        agreementId={agreement.id}
        open={externalOpen}
        onOpenChange={setExternalOpen}
      />
    </div>
  );
}

// ─── Invite outside MD/DO as chart-review-only OR full-access collaborator ─
function InviteExternalCollaboratorDialog({
  agreementId, open, onOpenChange,
}: {
  agreementId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.adminRole === "owner" || user?.adminRole === "admin";

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [credentials, setCredentials] = useState<"MD" | "DO">("MD");
  const [npi, setNpi] = useState("");
  const [dea, setDea] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"primary" | "backup">("backup");
  // Access scope: chart-review-only (no seat) or full clinic access (consumes a seat).
  // Non-admins can only invite chart-review-only.
  const [scope, setScope] = useState<"chart_review_only" | "full">("chart_review_only");
  // For the 402 seat-confirmation round-trip on the 'full' branch.
  const [seatPrompt, setSeatPrompt] = useState<{ message: string; seatPrice?: number } | null>(null);
  const [confirmExtraSeat, setConfirmExtraSeat] = useState(false);

  const reset = () => {
    setEmail(""); setFirstName(""); setLastName("");
    setCredentials("MD"); setNpi(""); setDea(""); setPhone("");
    setRole("backup"); setScope("chart_review_only");
    setSeatPrompt(null); setConfirmExtraSeat(false);
  };

  const inviteMut = useMutation({
    mutationFn: async (vars: { confirmExtraSeat?: boolean }) => {
      const res = await apiRequest('POST', `/api/chart-review/agreements/${agreementId}/external-collaborators`, {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        credentials,
        // NPI is REQUIRED for outside MD/DO invites — server enforces, but
        // we still send the trimmed value (canSubmit blocks empty/invalid).
        npi: npi.trim(),
        dea: dea.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        accessScope: scope,
        confirmExtraSeat: vars.confirmExtraSeat ?? false,
      });
      // The 402 seat-confirmation path is a "soft error" we want to surface in
      // the dialog rather than throw — apiRequest only throws on !ok, so we
      // handle 402 manually by parsing it before re-throwing.
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements', agreementId, 'collaborators'] });
      // Refresh the new "Pending invites" panel so the just-sent invite shows
      // up immediately, without waiting for a manual refetch / page refresh.
      queryClient.invalidateQueries({ queryKey: ['/api/chart-review/agreements', agreementId, 'invites'] });
      const isFull = data?.accessScope === "full";
      if (data?.mode === "linked_existing_user" || data?.mode === "linked_existing_provider") {
        toast({
          title: "Outside physician linked",
          description: isFull
            ? "Their account was added to this clinic as a full provider and seated on this agreement."
            : "Their existing ClinIQ account was added to this agreement for chart review only.",
        });
      } else {
        toast({
          title: "Invite sent",
          description: isFull
            ? "We emailed the physician an invite for full clinic access. A seat has been reserved."
            : "We emailed the physician an invite. They'll join for chart review only — no seat is used.",
        });
      }
      reset();
      onOpenChange(false);
    },
    onError: async (e: any) => {
      // queryClient.apiRequest throws `${status}: ${textBody}`. Detect the 402
      // seat-confirmation prompt by parsing the body, and surface a confirm step.
      const msg = typeof e?.message === "string" ? e.message : "";
      if (msg.startsWith("402:")) {
        let detail: any = null;
        try { detail = JSON.parse(msg.slice(4).trim()); } catch { /* ignore */ }
        if (detail?.requiresSeatConfirmation) {
          setSeatPrompt({
            message: detail?.message ?? "Adding this physician as a full provider will add an extra seat to your subscription.",
            seatPrice: detail?.seatPrice,
          });
          return;
        }
      }
      toast({ variant: "destructive", title: "Could not invite", description: errorMessage(e) });
    },
  });

  const isValidNpiClient = (s: string) => /^\d{10}$/.test(s);
  // NPI is required for outside collaborating physicians — it's how identity
  // is unified across clinics (email+NPI) and how the signed-note credential
  // line is filled out. The server returns 400 if missing/invalid; we mirror
  // that here so the user gets immediate feedback.
  const npiOk = !!npi.trim() && isValidNpiClient(npi.trim());
  const canSubmit = !!email.trim() && !!firstName.trim() && !!lastName.trim() && npiOk && !inviteMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent data-testid="dialog-invite-external">
        <DialogHeader>
          <DialogTitle>Invite outside MD/DO physician</DialogTitle>
          <DialogDescription>
            Choose how much of your clinic this physician will see. Chart-review-only is free
            (no seat consumed); full clinic access uses one provider seat.
          </DialogDescription>
        </DialogHeader>
        {/* Access scope picker — always visible. The 'full' branch is admin-only. */}
        <div className="space-y-2 rounded-md border p-3">
          <Label className="text-xs">Access scope</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label
              className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer hover-elevate ${scope === "chart_review_only" ? "border-primary" : ""}`}
              data-testid="radio-scope-chart-review-only"
            >
              <input
                type="radio"
                name="invite-scope"
                value="chart_review_only"
                checked={scope === "chart_review_only"}
                onChange={() => setScope("chart_review_only")}
                className="mt-1"
              />
              <span className="text-xs">
                <span className="font-medium">Chart review only</span>
                <span className="block text-muted-foreground">
                  Sees only charts routed to them on this agreement. No seat consumed.
                </span>
              </span>
            </label>
            <label
              className={`flex items-start gap-2 rounded-md border p-2 ${isAdmin ? "cursor-pointer hover-elevate" : "cursor-not-allowed opacity-50"} ${scope === "full" ? "border-primary" : ""}`}
              data-testid="radio-scope-full"
              title={isAdmin ? undefined : "Only clinic owners or admins can grant full clinic access"}
            >
              <input
                type="radio"
                name="invite-scope"
                value="full"
                disabled={!isAdmin}
                checked={scope === "full"}
                onChange={() => setScope("full")}
                className="mt-1"
              />
              <span className="text-xs">
                <span className="font-medium">Full clinic access</span>
                <span className="block text-muted-foreground">
                  Full provider in this clinic (consumes a Stripe seat). Admin only.
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dr.smith@example.com"
              data-testid="input-external-email"
            />
          </div>
          <div>
            <Label className="text-xs">First name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-external-first-name" />
          </div>
          <div>
            <Label className="text-xs">Last name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-external-last-name" />
          </div>
          <div>
            <Label className="text-xs">Credentials</Label>
            <Select value={credentials} onValueChange={(v) => setCredentials(v === "DO" ? "DO" : "MD")}>
              <SelectTrigger data-testid="select-external-credentials"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MD">MD</SelectItem>
                <SelectItem value="DO">DO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Role on agreement</Label>
            <Select value={role} onValueChange={(v) => setRole(v === "primary" ? "primary" : "backup")}>
              <SelectTrigger data-testid="select-external-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="backup">Backup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">NPI (required, 10 digits)</Label>
            <Input
              value={npi}
              onChange={(e) => setNpi(e.target.value)}
              data-testid="input-external-npi"
              className={!npiOk ? "border-destructive" : ""}
            />
            {!npiOk && (
              <p className="text-xs text-destructive mt-1" data-testid="error-npi">
                {npi.trim() ? "NPI must be 10 digits." : "NPI is required."}
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">DEA (optional)</Label>
            <Input value={dea} onChange={(e) => setDea(e.target.value)} data-testid="input-external-dea" />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Phone (optional)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-external-phone" />
          </div>
        </div>
        {seatPrompt && (
          <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2">
            <p className="text-xs">{seatPrompt.message}</p>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={confirmExtraSeat}
                onChange={(e) => setConfirmExtraSeat(e.target.checked)}
                data-testid="checkbox-confirm-extra-seat"
              />
              Yes, add an extra seat to my subscription
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-invite-external">
            Cancel
          </Button>
          <Button
            onClick={() => inviteMut.mutate({ confirmExtraSeat: !!seatPrompt && confirmExtraSeat })}
            disabled={!canSubmit || (!!seatPrompt && !confirmExtraSeat)}
            data-testid="button-submit-invite-external"
          >
            {inviteMut.isPending ? "Sending…" : seatPrompt ? "Confirm & send" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
