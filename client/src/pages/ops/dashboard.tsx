import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  Building2,
  Users,
  FileText,
  CreditCard,
  Activity,
  ClipboardList,
  UserCog,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Lock,
  Unlock,
  MoreHorizontal,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface OpsAdmin {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

type Tab =
  | "overview"
  | "clinics"
  | "users"
  | "baa"
  | "subscriptions"
  | "security"
  | "audit"
  | "admins";

interface PagedResult {
  data: any[];
  total: number;
  page: number;
  limit: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

async function opsGet(path: string): Promise<any> {
  const r = await fetch(path, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function opsPost(path: string, body: unknown): Promise<any> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || r.statusText);
  }
  return r.json();
}

async function opsPatch(path: string, body: unknown): Promise<any> {
  const r = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.message || r.statusText);
  }
  return r.json();
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTs(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-500 text-xs">—</span>;
  const color =
    value === "active"
      ? "bg-emerald-900/50 text-emerald-300 border-emerald-800"
      : value === "trial"
      ? "bg-amber-900/50 text-amber-300 border-amber-800"
      : value === "suspended"
      ? "bg-red-900/50 text-red-300 border-red-800"
      : "bg-slate-800 text-slate-400 border-slate-700";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs border font-medium ${color}`}>
      {value}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color =
    role === "owner"
      ? "bg-violet-900/50 text-violet-300 border-violet-800"
      : role === "admin"
      ? "bg-blue-900/50 text-blue-300 border-blue-800"
      : "bg-slate-800 text-slate-400 border-slate-700";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs border font-medium ${color}`}>
      {role}
    </span>
  );
}

function Pagination({
  page,
  total,
  limit,
  onPage,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-800 mt-3">
      <span className="text-xs text-slate-500">
        {total} total · page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-7 w-7 text-slate-400"
          data-testid="button-ops-prev-page"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="h-7 w-7 text-slate-400"
          data-testid="button-ops-next-page"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function TableShell({ children, loading, error }: { children: React.ReactNode; loading: boolean; error: string }) {
  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="flex items-center gap-2 py-8 text-red-400 text-sm">
        <AlertCircle className="w-4 h-4" /> {error}
      </div>
    );
  return <>{children}</>;
}

// ── Tab components ───────────────────────────────────────────────────────────

function OverviewTab({ admin }: { admin: OpsAdmin }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    opsGet("/api/ops/overview")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-100 font-medium">Overview</h2>
        <Button size="icon" variant="ghost" onClick={load} className="h-8 w-8 text-slate-400">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Clinics", value: data.totalClinics, icon: Building2 },
              { label: "Total Users", value: data.totalUsers, icon: Users },
              { label: "Signed BAAs", value: data.totalBaaSigned, icon: FileText },
              { label: "Active Clinics", value: data.activeClinics, icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="bg-slate-900 border-slate-800">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span className="text-xs text-slate-500">{label}</span>
                  </div>
                  <p className="text-2xl font-mono font-semibold text-slate-100">{value ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {data.recentAuditEvents?.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Recent admin activity</h3>
              <div className="space-y-1">
                {data.recentAuditEvents.map((ev: any) => (
                  <div key={ev.id} className="flex items-center justify-between py-2 border-b border-slate-800/70 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-slate-300 bg-slate-800/80 px-1.5 py-0.5 rounded">
                        {ev.action}
                      </span>
                      {ev.targetType && (
                        <span className="text-xs text-slate-500">{ev.targetType}</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-600">{fmtTs(ev.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function ClinicsTab() {
  const [result, setResult] = useState<PagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(search ? { search } : {}) });
    opsGet(`/api/ops/clinics?${q}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-slate-100 font-medium">Clinics</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { setSearch(searchInput); setPage(1); }
              }}
              placeholder="Search clinics…"
              className="pl-8 h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 w-44"
              data-testid="input-ops-clinics-search"
            />
          </div>
          <Button size="icon" variant="ghost" onClick={() => { setSearch(searchInput); setPage(1); }} className="h-8 w-8 text-slate-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <TableShell loading={loading} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Clinic", "Owner", "Plan", "Status", "Members", "Created"].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data.map((c: any) => (
                <tr key={c.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4 text-slate-200 font-medium text-xs">{c.name}</td>
                  <td className="py-2.5 pr-4">
                    <div className="text-xs text-slate-300">{[c.owner_first_name, c.owner_last_name].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-xs text-slate-500">{c.owner_email || "—"}</div>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{c.subscription_plan || "—"}</td>
                  <td className="py-2.5 pr-4"><StatusBadge value={c.subscription_status} /></td>
                  <td className="py-2.5 pr-4 text-xs font-mono text-slate-400">{c.member_count ?? 0}</td>
                  <td className="py-2.5 text-xs text-slate-500">{fmt(c.created_at)}</td>
                </tr>
              ))}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-600 text-xs">No clinics found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result && <Pagination page={page} total={result.total} limit={PAGE_SIZE} onPage={setPage} />}
      </TableShell>
    </div>
  );
}

function UsersTab() {
  const [result, setResult] = useState<PagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(search ? { search } : {}) });
    opsGet(`/api/ops/users?${q}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-slate-100 font-medium">Users</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
              placeholder="Search users…"
              className="pl-8 h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 w-44"
              data-testid="input-ops-users-search"
            />
          </div>
          <Button size="icon" variant="ghost" onClick={() => { setSearch(searchInput); setPage(1); }} className="h-8 w-8 text-slate-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <TableShell loading={loading} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Name", "Email", "Title", "Subscription", "Clinics", "Joined"].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data.map((u: any) => (
                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4 text-xs text-slate-200 font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{u.email}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{u.title || "—"}</td>
                  <td className="py-2.5 pr-4"><StatusBadge value={u.subscription_status} /></td>
                  <td className="py-2.5 pr-4 text-xs font-mono text-slate-400">{u.clinic_count ?? 0}</td>
                  <td className="py-2.5 text-xs text-slate-500">{fmt(u.created_at)}</td>
                </tr>
              ))}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-600 text-xs">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result && <Pagination page={page} total={result.total} limit={PAGE_SIZE} onPage={setPage} />}
      </TableShell>
    </div>
  );
}

function BaaTab() {
  const [result, setResult] = useState<PagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(search ? { search } : {}) });
    opsGet(`/api/ops/baa-signatures?${q}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-slate-100 font-medium">BAAs & Compliance</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
              placeholder="Search signer…"
              className="pl-8 h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 w-44"
              data-testid="input-ops-baa-search"
            />
          </div>
          <Button size="icon" variant="ghost" onClick={() => { setSearch(searchInput); setPage(1); }} className="h-8 w-8 text-slate-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <TableShell loading={loading} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Signer", "Email", "Clinic", "BAA Version", "IP Address", "Signed At"].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data.map((b: any) => (
                <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4 text-xs text-slate-200 font-medium">
                    {[b.first_name, b.last_name].filter(Boolean).join(" ") || b.signature_name || "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{b.email}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{b.clinic_name || "—"}</td>
                  <td className="py-2.5 pr-4 text-xs font-mono text-slate-500">{b.baa_version || "—"}</td>
                  <td className="py-2.5 pr-4 text-xs font-mono text-slate-500">{b.ip_address || "—"}</td>
                  <td className="py-2.5 text-xs text-slate-500">{fmtTs(b.signed_at)}</td>
                </tr>
              ))}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-600 text-xs">No BAA signatures found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result && <Pagination page={page} total={result.total} limit={PAGE_SIZE} onPage={setPage} />}
      </TableShell>
    </div>
  );
}

function SubscriptionsTab() {
  const [result, setResult] = useState<PagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    opsGet(`/api/ops/subscriptions?${q}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-100 font-medium">Subscriptions</h2>
        <Button size="icon" variant="ghost" onClick={load} className="h-8 w-8 text-slate-400">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>
      <TableShell loading={loading} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Clinic", "Owner", "Plan", "Status", "Trial Ends", "Stripe Sub"].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data.map((s: any) => (
                <tr key={s.clinic_id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4 text-xs text-slate-200 font-medium">{s.clinic_name}</td>
                  <td className="py-2.5 pr-4">
                    <div className="text-xs text-slate-300">{[s.owner_first_name, s.owner_last_name].filter(Boolean).join(" ") || "—"}</div>
                    <div className="text-xs text-slate-500">{s.owner_email || "—"}</div>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{s.subscription_plan || "—"}</td>
                  <td className="py-2.5 pr-4"><StatusBadge value={s.subscription_status} /></td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">{s.trial_ends_at ? fmt(s.trial_ends_at) : "—"}</td>
                  <td className="py-2.5 text-xs font-mono text-slate-600">{s.stripe_subscription_id ? s.stripe_subscription_id.slice(0, 18) + "…" : "—"}</td>
                </tr>
              ))}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-600 text-xs">No subscriptions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result && <Pagination page={page} total={result.total} limit={PAGE_SIZE} onPage={setPage} />}
      </TableShell>
    </div>
  );
}

function SecurityTab() {
  const [result, setResult] = useState<PagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    opsGet(`/api/ops/security-events?${q}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-100 font-medium">Security Events</h2>
        <Button size="icon" variant="ghost" onClick={load} className="h-8 w-8 text-slate-400">
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>
      <p className="text-xs text-slate-600">Auth and security events only. No clinical or PHI data.</p>
      <TableShell loading={loading} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Action", "User", "Email", "IP Address", "Timestamp"].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data.map((e: any) => (
                <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded">{e.action}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">
                    {[e.first_name, e.last_name].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">{e.user_email || "—"}</td>
                  <td className="py-2.5 pr-4 text-xs font-mono text-slate-600">{e.ip_address || "—"}</td>
                  <td className="py-2.5 text-xs text-slate-500">{fmtTs(e.created_at)}</td>
                </tr>
              ))}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-600 text-xs">No security events found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result && <Pagination page={page} total={result.total} limit={PAGE_SIZE} onPage={setPage} />}
      </TableShell>
    </div>
  );
}

function AuditLogTab() {
  const [result, setResult] = useState<PagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState("");
  const [filterInput, setFilterInput] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(filterAction ? { action: filterAction } : {}) });
    opsGet(`/api/ops/audit-log?${q}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, filterAction]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-slate-100 font-medium">Audit Log</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setFilterAction(filterInput); setPage(1); } }}
              placeholder="Filter by action…"
              className="pl-8 h-8 text-xs bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-600 w-44"
              data-testid="input-ops-audit-filter"
            />
          </div>
          <Button size="icon" variant="ghost" onClick={() => { setFilterAction(filterInput); setPage(1); }} className="h-8 w-8 text-slate-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <TableShell loading={loading} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Admin", "Action", "Target", "IP", "Timestamp"].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data.map((e: any) => (
                <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4">
                    <div className="text-xs text-slate-300">
                      {[e.admin_first_name, e.admin_last_name].filter(Boolean).join(" ") || "system"}
                    </div>
                    <div className="text-xs text-slate-600">{e.admin_email || ""}</div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className="font-mono text-xs bg-slate-800/80 text-slate-300 px-1.5 py-0.5 rounded">{e.action}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">
                    {e.target_type ? `${e.target_type} ${e.target_id ?? ""}` : "—"}
                  </td>
                  <td className="py-2.5 pr-4 text-xs font-mono text-slate-600">{e.ip_address || "—"}</td>
                  <td className="py-2.5 text-xs text-slate-500">{fmtTs(e.created_at)}</td>
                </tr>
              ))}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-slate-600 text-xs">No audit events found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result && <Pagination page={page} total={result.total} limit={PAGE_SIZE} onPage={setPage} />}
      </TableShell>
    </div>
  );
}

function AdminsTab({ currentAdmin }: { currentAdmin: OpsAdmin }) {
  const [result, setResult] = useState<PagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState("");
  const [newForm, setNewForm] = useState({ email: "", password: "", firstName: "", lastName: "", role: "admin" });
  const [showNewPassword, setShowNewPassword] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    opsGet(`/api/ops/admins?page=${page}&limit=${PAGE_SIZE}`)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setActionError("");
    try {
      await opsPost("/api/ops/admins", newForm);
      setCreating(false);
      setNewForm({ email: "", password: "", firstName: "", lastName: "", role: "admin" });
      load();
    } catch (e: any) {
      setActionError(e.message);
    }
  };

  const handleUpdate = async (id: number, updates: any) => {
    try {
      await opsPatch(`/api/ops/admins/${id}`, updates);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-slate-100 font-medium">Admin Management</h2>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={load} className="h-8 w-8 text-slate-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={() => { setCreating(true); setActionError(""); }}
            className="bg-slate-100 text-slate-900 hover:bg-white h-8 text-xs"
            data-testid="button-ops-add-admin"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add admin
          </Button>
        </div>
      </div>

      <TableShell loading={loading} error={error}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {["Name", "Email", "Role", "Status", "Last Login", "Actions"].map((h) => (
                  <th key={h} className="pb-2 text-left text-xs font-medium text-slate-500 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result?.data.map((a: any) => (
                <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2.5 pr-4 text-xs text-slate-200 font-medium">
                    {[a.firstName, a.lastName].filter(Boolean).join(" ")}
                    {a.id === currentAdmin.id && (
                      <span className="ml-1.5 text-slate-600 text-xs">(you)</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">{a.email}</td>
                  <td className="py-2.5 pr-4"><RoleBadge role={a.role} /></td>
                  <td className="py-2.5 pr-4"><StatusBadge value={a.status} /></td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">
                    {a.lastLoginAt ? fmtTs(a.lastLoginAt) : "Never"}
                    {a.lockedUntil && new Date(a.lockedUntil) > new Date() && (
                      <div className="flex items-center gap-1 text-amber-400 mt-0.5">
                        <Lock className="w-3 h-3" /> Locked
                      </div>
                    )}
                  </td>
                  <td className="py-2.5">
                    {a.id !== currentAdmin.id && (
                      <div className="flex items-center gap-1">
                        {a.status === "active" ? (
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400 hover:text-red-300 px-2"
                            onClick={() => handleUpdate(a.id, { status: "suspended" })}
                            data-testid={`button-ops-suspend-admin-${a.id}`}>
                            Suspend
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-emerald-400 hover:text-emerald-300 px-2"
                            onClick={() => handleUpdate(a.id, { status: "active" })}
                            data-testid={`button-ops-activate-admin-${a.id}`}>
                            Activate
                          </Button>
                        )}
                        {a.role !== "owner" && (
                          <Button size="sm" variant="ghost" className="h-6 text-xs text-violet-400 hover:text-violet-300 px-2"
                            onClick={() => handleUpdate(a.id, { role: "owner" })}
                            data-testid={`button-ops-promote-admin-${a.id}`}>
                            Make owner
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && result?.data.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-600 text-xs">No admins</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {result && <Pagination page={page} total={result.total} limit={PAGE_SIZE} onPage={setPage} />}
      </TableShell>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add platform admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {actionError && (
              <div className="flex items-start gap-2 rounded-md bg-red-950/60 border border-red-900/60 px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />
                <p className="text-red-300 text-xs">{actionError}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">First name</label>
                <Input value={newForm.firstName} onChange={(e) => setNewForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-slate-100" data-testid="input-ops-new-admin-firstname" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Last name</label>
                <Input value={newForm.lastName} onChange={(e) => setNewForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-slate-100" data-testid="input-ops-new-admin-lastname" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Email</label>
              <Input type="email" value={newForm.email} onChange={(e) => setNewForm((f) => ({ ...f, email: e.target.value }))}
                className="bg-slate-800 border-slate-700 text-slate-100" data-testid="input-ops-new-admin-email" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Password <span className="text-slate-600">(min 12 chars)</span></label>
              <div className="relative">
                <Input type={showNewPassword ? "text" : "password"} value={newForm.password}
                  onChange={(e) => setNewForm((f) => ({ ...f, password: e.target.value }))}
                  className="bg-slate-800 border-slate-700 text-slate-100 pr-10"
                  data-testid="input-ops-new-admin-password" />
                <button type="button" tabIndex={-1} onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showNewPassword ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Role</label>
              <Select value={newForm.role} onValueChange={(v) => setNewForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100" data-testid="select-ops-new-admin-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="viewer" className="text-slate-200">Viewer</SelectItem>
                  <SelectItem value="admin" className="text-slate-200">Admin</SelectItem>
                  <SelectItem value="owner" className="text-slate-200">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)} className="text-slate-400">Cancel</Button>
            <Button onClick={handleCreate}
              disabled={!newForm.email || !newForm.password || !newForm.firstName || !newForm.lastName}
              className="bg-slate-100 text-slate-900 hover:bg-white"
              data-testid="button-ops-confirm-create-admin">
              Create admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function OpsDashboard() {
  const [, setLocation] = useLocation();
  const [admin, setAdmin] = useState<OpsAdmin | null>(null);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch("/api/ops/auth/me", { credentials: "include" })
      .then((r) => {
        if (!r.ok) { setLocation("/ops"); return null; }
        return r.json();
      })
      .then((data) => {
        if (data?.admin) { setAdmin(data.admin); setChecking(false); }
        else { setLocation("/ops"); }
      })
      .catch(() => setLocation("/ops"));
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/ops/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setLocation("/ops");
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }
  if (!admin) return null;

  const tabs: { id: Tab; label: string; icon: React.FC<any>; ownerOnly?: boolean }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "clinics", label: "Clinics", icon: Building2 },
    { id: "users", label: "Users", icon: Users },
    { id: "baa", label: "BAAs & Compliance", icon: FileText },
    { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
    { id: "security", label: "Security Events", icon: Shield },
    { id: "audit", label: "Audit Log", icon: ClipboardList },
    { id: "admins", label: "Admin Mgmt", icon: UserCog, ownerOnly: true },
  ].filter((t) => !t.ownerOnly || admin.role === "owner");

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4 text-slate-300" />
            </div>
            <span className="text-slate-200 font-semibold text-sm tracking-tight">ClinIQ Ops</span>
            <span className="text-slate-700 text-xs">|</span>
            <span className="text-slate-500 text-xs hidden sm:block">
              {admin.firstName} {admin.lastName}
            </span>
            <RoleBadge role={admin.role} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-slate-500 hover:text-slate-300 h-8 text-xs gap-1.5"
            data-testid="button-ops-logout"
          >
            {loggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
            Sign out
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto w-full px-4 flex flex-col flex-1 py-6 gap-6">
        {/* Tab navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto pb-1" role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors
                ${activeTab === id
                  ? "bg-slate-800 text-slate-100 border border-slate-700"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-900 border border-transparent"
                }`}
              data-testid={`tab-ops-${id}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>

        {/* Tab content */}
        <div className="flex-1">
          {activeTab === "overview" && <OverviewTab admin={admin} />}
          {activeTab === "clinics" && <ClinicsTab />}
          {activeTab === "users" && <UsersTab />}
          {activeTab === "baa" && <BaaTab />}
          {activeTab === "subscriptions" && <SubscriptionsTab />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "audit" && <AuditLogTab />}
          {activeTab === "admins" && admin.role === "owner" && <AdminsTab currentAdmin={admin} />}
        </div>
      </div>
    </div>
  );
}
