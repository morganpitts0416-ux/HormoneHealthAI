import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, FileText, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Clinic {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
}

interface LegacyClinicContact {
  address: string | null;
  phone: string | null;
}

interface Provider {
  credentialId: number;
  userId: number;
  name: string;
  title: string | null;
  npi: string | null;
  verificationCurrent: boolean;
  licenseState: string | null;
  licenseNumber: string | null;
  licenseType: string | null;
  licenseExpiresAt: string | null;
  deaNumber: string | null;
  deaState: string | null;
  deaExpiresAt: string | null;
  prescribingAuthorized: boolean;
  verifiedAt: string | null;
  verifiedByUserId: number | null;
  verificationHash?: string;
  providerActive: boolean;
  hasSavedSignature: boolean;
  isSelf: boolean;
}

interface HistoryEntry {
  id: number;
  credentialId: number;
  clinicId: number;
  providerUserId: number;
  verifierUserId: number;
  verifierName: string;
  action: string;
  verificationSource: string;
  notes: string | null;
  createdAt: string;
  credentialSnapshot?: {
    npi?: string | null;
    licenseNumber?: string | null;
    licenseState?: string | null;
    licenseType?: string | null;
    licenseExpiresAt?: string | null;
  } | null;
}

interface VerificationResponse {
  clinic: Clinic;
  legacyClinicContact: LegacyClinicContact | null;
  providers: Provider[];
}

interface RequestError extends Error {
  status?: number;
}

async function request<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `Request failed (${response.status})`) as RequestError;
    error.status = response.status;
    throw error;
  }
  return result as T;
}

function dateLabel(value: string | null) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function PrescriberVerificationSettings() {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [legacyContact, setLegacyContact] = useState<LegacyClinicContact | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [denied, setDenied] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmedBusinessContact, setConfirmedBusinessContact] = useState(false);
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [sources, setSources] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [actionError, setActionError] = useState<Record<number, string>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [requiresReview, setRequiresReview] = useState<Record<number, boolean>>({});
  const [historyProviderId, setHistoryProviderId] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const listController = useRef<AbortController | null>(null);
  const historyController = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError("");
    setDenied(false);
    setClinic(null);
    setProviders([]);
    setLegacyContact(null);
    historyController.current?.abort();
    historyController.current = null;
    setHistoryProviderId(null);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(false);
    try {
      const result = await request<VerificationResponse>("/api/prescriber-verification", "GET", undefined, controller.signal);
      if (controller.signal.aborted || version !== requestVersion.current) return;
      setClinic(result.clinic);
      setProviders(result.providers);
      setLegacyContact(result.legacyClinicContact);
      setAddress(result.clinic.address ?? "");
      setPhone(result.clinic.phone ?? "");
    } catch (cause) {
      if (controller.signal.aborted || version !== requestVersion.current) return;
      const error = cause as RequestError;
      if (error.status === 403) {
        setDenied(true);
        setLoadError("");
      } else {
        setLoadError(cause instanceof Error ? cause.message : "Unable to load prescriber verification.");
      }
    } finally {
      if (!controller.signal.aborted && version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      listController.current?.abort();
      historyController.current?.abort();
      requestVersion.current += 1;
    };
  }, [load]);

  const showHistory = async (provider: Provider) => {
    historyController.current?.abort();
    const controller = new AbortController();
    historyController.current = controller;
    setHistoryProviderId(provider.credentialId);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const rows = await request<HistoryEntry[]>(
        `/api/prescriber-verification/${provider.credentialId}/history`,
        "GET",
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted && historyController.current === controller) setHistory(rows);
    } catch (cause) {
      if (!controller.signal.aborted && historyController.current === controller) {
        setHistoryError(cause instanceof Error ? cause.message : "Unable to load verification history.");
      }
    } finally {
      if (!controller.signal.aborted && historyController.current === controller) setHistoryLoading(false);
    }
  };

  const clearHistory = () => {
    historyController.current?.abort();
    historyController.current = null;
    setHistoryProviderId(null);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(false);
  };

  const submitVerification = async (provider: Provider, approved: boolean) => {
    const source = (sources[provider.credentialId] ?? "").trim();
    const note = (notes[provider.credentialId] ?? "").trim();
    if (source.length < 5 || source.length > 300) {
      setActionError(previous => ({ ...previous, [provider.credentialId]: "Enter a verification source between 5 and 300 characters." }));
      return;
    }
    if (note.length > 2000) {
      setActionError(previous => ({ ...previous, [provider.credentialId]: "Notes must be 2,000 characters or fewer." }));
      return;
    }
    setPendingId(provider.credentialId);
    setActionError(previous => ({ ...previous, [provider.credentialId]: "" }));
    try {
      await request(`/api/prescriber-credentials/${provider.credentialId}/verify`, "POST", {
        approved,
        verificationHash: provider.verificationHash,
        verificationSource: source,
        ...(note ? { notes: note } : {}),
      });
      setRequiresReview(previous => ({ ...previous, [provider.credentialId]: false }));
      await load();
      if (historyProviderId === provider.credentialId) await showHistory(provider);
    } catch (cause) {
      const error = cause as RequestError;
      setActionError(previous => ({
        ...previous,
        [provider.credentialId]: error.status === 409
          ? "Credentials changed since this review was loaded. The current record has been refreshed; review it again before submitting a new decision."
          : cause instanceof Error ? cause.message : "Unable to update verification.",
      }));
      if (error.status === 409) {
        setRequiresReview(previous => ({ ...previous, [provider.credentialId]: true }));
        await load();
      }
    } finally {
      setPendingId(null);
    }
  };

  const saveContact = async () => {
    setContactError("");
    setContactSuccess(false);
    if (!address.trim() || address.trim().length > 2000) {
      setContactError("Enter a clinic business address (up to 2,000 characters).");
      return;
    }
    if (phone.trim().length < 7 || phone.trim().length > 50) {
      setContactError("Enter a clinic business phone number between 7 and 50 characters.");
      return;
    }
    if (!confirmedBusinessContact) {
      setContactError("Confirm that this is the clinic’s business contact information, not a personal address or phone.");
      return;
    }
    setSavingContact(true);
    try {
      const saved = await request<Clinic>("/api/prescription-clinic-contact", "PATCH", {
        address: address.trim(),
        phone: phone.trim(),
        confirmedClinicContact: true,
      });
      setClinic(previous => previous ? { ...previous, ...saved } : saved);
      setAddress(saved.address ?? "");
      setPhone(saved.phone ?? "");
      setConfirmedBusinessContact(false);
      setContactSuccess(true);
    } catch (cause) {
      setContactError(cause instanceof Error ? cause.message : "Unable to save clinic prescription contact.");
    } finally {
      setSavingContact(false);
    }
  };

  if (loading) {
    return <div className="space-y-4" aria-label="Loading prescriber verification">
      <div className="h-28 animate-pulse rounded-md bg-muted" />
      <div className="h-48 animate-pulse rounded-md bg-muted" />
    </div>;
  }

  if (denied) {
    return <Card><CardContent className="flex items-start gap-3 pt-6">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-medium">Prescriber verification access denied</p>
        <p className="mt-1 text-sm text-muted-foreground">Only active, full-access clinic owners and administrators can view these records. No provider records were loaded.</p>
      </div>
    </CardContent></Card>;
  }

  if (loadError || !clinic) {
    return <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
      <p role="alert" className="text-sm text-destructive">{loadError || "Clinic verification data is unavailable."}</p>
      <Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>
    </CardContent></Card>;
  }

  return <section className="space-y-5" aria-labelledby="prescriber-verification-title">
    <header>
      <h2 id="prescriber-verification-title" className="text-lg font-semibold">Prescriber Verification</h2>
      <p className="mt-1 text-sm text-muted-foreground">Review clinic clinicians’ credentials and record independent verification decisions.</p>
    </header>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />Prescription letterhead contact</CardTitle>
        <CardDescription>Business contact printed for clinic prescriptions. This is separate from personal profile and legacy account information.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium">{clinic.name}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="prescription-clinic-address">Clinic business address</Label>
            <Textarea id="prescription-clinic-address" maxLength={2000} value={address} onChange={event => setAddress(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prescription-clinic-phone">Clinic business phone</Label>
            <Input id="prescription-clinic-phone" maxLength={50} value={phone} onChange={event => setPhone(event.target.value)} />
            <p className="text-xs text-muted-foreground">Fax: {clinic.fax || "Not provided"}</p>
          </div>
        </div>
        {legacyContact && <div className="rounded-md border bg-muted/30 p-3">
          <p className="text-sm font-medium">Legacy contact available for review</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{legacyContact.address || "No legacy address"} · {legacyContact.phone || "No legacy phone"}</p>
          <Button type="button" className="mt-3" size="sm" variant="outline" onClick={() => {
            setAddress(legacyContact.address ?? "");
            setPhone(legacyContact.phone ?? "");
            setConfirmedBusinessContact(false);
            setContactSuccess(false);
          }}>Review and copy legacy values</Button>
          <p className="mt-2 text-xs text-muted-foreground">Copied values are not saved. Confirm they are the clinic’s business details before saving; do not use personal contact information.</p>
        </div>}
        <label className="flex items-start gap-2 text-sm">
          <input className="mt-1" type="checkbox" checked={confirmedBusinessContact} onChange={event => setConfirmedBusinessContact(event.target.checked)} />
          <span>I confirm this is the clinic’s business address and phone number, not a personal address or phone.</span>
        </label>
        {contactError && <p role="alert" className="text-sm text-destructive">{contactError}</p>}
        {contactSuccess && <p role="status" className="text-sm text-emerald-700">Prescription clinic contact saved.</p>}
        <Button type="button" onClick={() => void saveContact()} disabled={savingContact}>
          {savingContact ? "Saving…" : "Save prescription contact"}
        </Button>
      </CardContent>
    </Card>

    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold">Clinicians</h3>
        <p className="text-sm text-muted-foreground">Approval and revocation are recorded by the server. No decision is made automatically.</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
    </div>

    {providers.length === 0 ? <Card><CardContent className="py-8 text-center">
      <UserRoundCheck className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">No prescriber credentials to review</p>
      <p className="mt-1 text-xs text-muted-foreground">Credentialed clinicians in this clinic will appear here.</p>
    </CardContent></Card> : <div className="space-y-3">
      {providers.map(provider => {
        const prerequisites = [
          !provider.hasSavedSignature ? "A saved signature is required." : "",
          !provider.npi?.trim() ? "An NPI is required." : "",
          !provider.licenseNumber?.trim() || !provider.licenseState?.trim() || !provider.licenseType?.trim() ? "Current license details are required." : "",
          !provider.licenseExpiresAt ? "A license expiration date is needed to confirm the license is current." :
            new Date(provider.licenseExpiresAt).getTime() < Date.now() ? "License expiration date has passed." : "",
        ].filter(Boolean);
        const isAuthorized = provider.prescribingAuthorized;
        const isCurrent = isAuthorized && provider.verificationCurrent;
        const hasValidVerificationHash = typeof provider.verificationHash === "string" && /^[a-f0-9]{64}$/i.test(provider.verificationHash);
        const canDecide = !provider.isSelf && prerequisites.length === 0 && hasValidVerificationHash && !requiresReview[provider.credentialId];
        return <Card key={provider.credentialId}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{provider.name}{provider.title ? `, ${provider.title}` : ""}</CardTitle>
                <CardDescription className="mt-1">NPI {provider.npi || "Not provided"} · {provider.providerActive ? "Active clinician" : "Inactive clinician"}</CardDescription>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${isCurrent ? "border-emerald-700/20 bg-emerald-50 text-emerald-800" : "border-amber-700/20 bg-amber-50 text-amber-800"}`}>
                {isCurrent ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                {isCurrent ? "Verified for prescribing" : isAuthorized ? "Re-verification required" : "Not verified"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <p><span className="text-muted-foreground">License:</span> {provider.licenseType || "Type missing"} · {provider.licenseNumber || "Number missing"} · {provider.licenseState || "State missing"}</p>
              <p><span className="text-muted-foreground">License expires:</span> {dateLabel(provider.licenseExpiresAt)}</p>
              <p><span className="text-muted-foreground">DEA:</span> {provider.deaNumber || "Not provided"}{provider.deaState ? ` · ${provider.deaState}` : ""}</p>
              <p><span className="text-muted-foreground">DEA expires:</span> {dateLabel(provider.deaExpiresAt)}</p>
              <p><span className="text-muted-foreground">Last verified:</span> {dateLabel(provider.verifiedAt)}</p>
            </div>
            {prerequisites.length > 0 && <div className="rounded-md border border-amber-700/20 bg-amber-50/60 p-3">
              <p className="text-sm font-medium text-amber-900">Prerequisites needed</p>
              <ul className="mt-1 list-inside list-disc text-xs text-amber-900">{prerequisites.map(item => <li key={item}>{item}</li>)}</ul>
              <p className="mt-1 text-xs text-muted-foreground">The server revalidates prerequisites when a decision is submitted.</p>
            </div>}
            {provider.isSelf && <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">You cannot approve or revoke your own credentials. An independent clinic administrator is required, including when you are the clinic owner.</p>}
            {requiresReview[provider.credentialId] && <div className="rounded-md border border-amber-700/20 bg-amber-50/60 p-3">
              <p className="text-sm text-amber-900">The provider’s credentials changed after the prior review. Review the refreshed NPI and license details above before continuing.</p>
              <Button type="button" className="mt-2" size="sm" variant="outline" onClick={() => {
                setRequiresReview(previous => ({ ...previous, [provider.credentialId]: false }));
                setActionError(previous => ({ ...previous, [provider.credentialId]: "" }));
              }}>I reviewed the refreshed credentials</Button>
            </div>}
            {!hasValidVerificationHash && <p className="text-sm text-muted-foreground">Verification is unavailable until current credential review data is loaded.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`verification-source-${provider.credentialId}`}>Verification source <span className="text-muted-foreground">(required, 5–300 characters)</span></Label>
                <Input id={`verification-source-${provider.credentialId}`} maxLength={300} value={sources[provider.credentialId] ?? ""} onChange={event => setSources(previous => ({ ...previous, [provider.credentialId]: event.target.value }))} placeholder="e.g. State licensing board, checked 06/12/2025" />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`verification-notes-${provider.credentialId}`}>Review notes <span className="text-muted-foreground">(optional, up to 2,000 characters)</span></Label>
                <Textarea id={`verification-notes-${provider.credentialId}`} maxLength={2000} value={notes[provider.credentialId] ?? ""} onChange={event => setNotes(previous => ({ ...previous, [provider.credentialId]: event.target.value }))} />
              </div>
            </div>
            {actionError[provider.credentialId] && <p role="alert" className="text-sm text-destructive">{actionError[provider.credentialId]}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!canDecide || pendingId === provider.credentialId} onClick={() => void submitVerification(provider, true)}>
                <ShieldCheck className="mr-2 h-4 w-4" />{pendingId === provider.credentialId ? "Saving…" : isAuthorized && !isCurrent ? "Re-approve / verify current credentials" : isCurrent ? "Confirm approval" : "Approve prescribing"}
              </Button>
              <Button type="button" variant="outline" disabled={!canDecide || pendingId === provider.credentialId || !isAuthorized} onClick={() => void submitVerification(provider, false)}>
                Revoke authorization
              </Button>
              <Button type="button" variant="ghost" onClick={() => historyProviderId === provider.credentialId ? clearHistory() : void showHistory(provider)}>
                {historyProviderId === provider.credentialId ? "Hide history" : "View history"}
              </Button>
            </div>
            {historyProviderId === provider.credentialId && <div className="rounded-md border bg-muted/20 p-3">
              <h4 className="text-sm font-medium">Verification history</h4>
              {historyLoading ? <div className="mt-3 h-12 animate-pulse rounded bg-muted" /> :
                historyError ? <p role="alert" className="mt-2 text-sm text-destructive">{historyError}</p> :
                  history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No verification history recorded.</p> :
                    <ol className="mt-3 space-y-3">{history.map(entry => {
                      const snapshot = entry.credentialSnapshot;
                      const reviewedValues = snapshot ? [
                        snapshot.npi && `NPI ${snapshot.npi}`,
                        snapshot.licenseType,
                        snapshot.licenseNumber && `License ${snapshot.licenseNumber}`,
                        snapshot.licenseState && `State ${snapshot.licenseState}`,
                        snapshot.licenseExpiresAt && `Expires ${dateLabel(snapshot.licenseExpiresAt)}`,
                      ].filter(Boolean) : [];
                      return <li key={entry.id} className="border-l-2 pl-3">
                        <p className="text-sm font-medium">{entry.action} · {entry.verifierName}</p>
                        <p className="text-xs text-muted-foreground">{dateLabel(entry.createdAt)} · {entry.verificationSource}</p>
                        {entry.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{entry.notes}</p>}
                        {reviewedValues.length > 0 && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Credentials reviewed:</span> {reviewedValues.join(" · ")}</p>}
                      </li>;
                    })}</ol>}
              {historyError && <Button className="mt-2" size="sm" variant="outline" onClick={() => void showHistory(provider)}>Retry history</Button>}
            </div>}
          </CardContent>
        </Card>;
      })}
    </div>}
  </section>;
}
