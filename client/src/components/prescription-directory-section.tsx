import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

type Medication = { id: number; medicationName: string; strength: string; dosageForm: string; isActive: boolean };
type Sig = { id: number; medicationId: number; sig: string; dose: string | null; route: string | null; frequency: string | null; isActive: boolean };
type Pharmacy = { id: number; name: string; address: string | null; phone: string | null; fax: string | null; isActive: boolean };
type DirectoryKind = "medications" | "pharmacies";

async function request<T>(url: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method, credentials: "include", signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result as T;
}

export function PrescriptionDirectorySection() {
  const { user } = useAuth();
  const role = String(user?.clinicalRole || user?.staffRole || user?.role || "").toLowerCase();
  const authorized = !!user && (!user.isStaff || /nurse|rn|provider/.test(role));
  const [kind, setKind] = useState<DirectoryKind>("medications");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [medications, setMedications] = useState<Medication[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [sigs, setSigs] = useState<Sig[]>([]);
  const [selected, setSelected] = useState<Medication | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [medForm, setMedForm] = useState({ medicationName: "", strength: "", dosageForm: "" });
  const [pharmForm, setPharmForm] = useState({ name: "", address: "", phone: "", fax: "" });
  const [sigForm, setSigForm] = useState({ sig: "", dose: "", route: "", frequency: "" });
  const [editingMed, setEditingMed] = useState<number | null>(null);
  const [editingPharm, setEditingPharm] = useState<number | null>(null);
  const [editingSig, setEditingSig] = useState<number | null>(null);
  const directoryRequest = useRef<AbortController | null>(null);
  useEffect(() => () => directoryRequest.current?.abort(), []);

  const reload = useCallback(async () => {
    directoryRequest.current?.abort();
    const controller = new AbortController();
    directoryRequest.current = controller;
    setLoading(true); setError("");
    try {
      if (kind === "medications") {
        const items = await request<Medication[]>(`/api/prescription-medications?search=${encodeURIComponent(search)}&includeInactive=${includeInactive}`, "GET", undefined, controller.signal);
        if (controller.signal.aborted) return;
        setMedications(items);
        if (selected) {
          const fresh = items.find(item => item.id === selected.id);
          setSelected(fresh ?? null);
        }
      } else {
        const items = await request<Pharmacy[]>(`/api/prescription-pharmacies?search=${encodeURIComponent(search)}&includeInactive=${includeInactive}`, "GET", undefined, controller.signal);
        if (!controller.signal.aborted) setPharmacies(items);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load directory.");
    }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [kind, search, includeInactive, selected?.id]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    setEditingSig(null);
    setSigForm({ sig: "", dose: "", route: "", frequency: "" });
  }, [selected?.id, selected?.medicationName, selected?.strength, selected?.dosageForm]);
  useEffect(() => {
    if (!selected) { setSigs([]); return; }
    setSigs([]);
    let current = true;
    request<Sig[]>(`/api/prescription-medications/${selected.id}/sigs?includeInactive=${includeInactive}`)
      .then(rows => { if (current) setSigs(rows); })
      .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : "Unable to load directions."); });
    return () => { current = false; };
  }, [selected?.id, selected?.medicationName, selected?.strength, selected?.dosageForm, selected?.isActive, includeInactive]);

  async function saveMedication() {
    setSaving(true); setError("");
    try {
      const identityChanged = !!editingMed && medications.find(m => m.id === editingMed && (m.medicationName !== medForm.medicationName || m.strength !== medForm.strength || m.dosageForm !== medForm.dosageForm));
      if (identityChanged && !window.confirm("Changing this formulation archives its saved SIGs. Continue?")) return;
      await request(editingMed ? `/api/prescription-medications/${editingMed}` : "/api/prescription-medications", editingMed ? "PATCH" : "POST", medForm);
      setMedForm({ medicationName: "", strength: "", dosageForm: "" }); setEditingMed(null); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save medication."); }
    finally { setSaving(false); }
  }
  async function toggleMedication(med: Medication) {
    try { await request(`/api/prescription-medications/${med.id}`, "PATCH", { isActive: !med.isActive }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update medication."); }
  }
  async function saveSig() {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      const body = { sig: sigForm.sig, dose: sigForm.dose || null, route: sigForm.route || null, frequency: sigForm.frequency || null };
      await request(editingSig ? `/api/prescription-medications/${selected.id}/sigs/${editingSig}` : `/api/prescription-medications/${selected.id}/sigs`, editingSig ? "PATCH" : "POST", body);
      setSigForm({ sig: "", dose: "", route: "", frequency: "" }); setEditingSig(null);
      setSigs(await request<Sig[]>(`/api/prescription-medications/${selected.id}/sigs?includeInactive=${includeInactive}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save directions."); }
    finally { setSaving(false); }
  }
  async function toggleSig(sig: Sig) {
    if (!selected) return;
    try {
      await request(`/api/prescription-medications/${selected.id}/sigs/${sig.id}`, "PATCH", { isActive: !sig.isActive });
      setSigs(await request<Sig[]>(`/api/prescription-medications/${selected.id}/sigs?includeInactive=${includeInactive}`));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update directions."); }
  }
  async function savePharmacy() {
    setSaving(true); setError("");
    try {
      await request(editingPharm ? `/api/prescription-pharmacies/${editingPharm}` : "/api/prescription-pharmacies", editingPharm ? "PATCH" : "POST", pharmForm);
      setPharmForm({ name: "", address: "", phone: "", fax: "" }); setEditingPharm(null); await reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save pharmacy."); }
    finally { setSaving(false); }
  }
  async function togglePharmacy(pharm: Pharmacy) {
    try { await request(`/api/prescription-pharmacies/${pharm.id}`, "PATCH", { isActive: !pharm.isActive }); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update pharmacy."); }
  }

  if (!authorized) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">Prescription directory access is limited to authorized providers and nursing staff. The server remains the authority for access.</CardContent></Card>;
  return <section className="space-y-5" aria-labelledby="prescription-directory-title">
    <header>
      <h2 id="prescription-directory-title" className="text-lg font-semibold">Prescription Directory</h2>
      <p className="mt-1 text-sm text-muted-foreground">Clinic-shared formulations, reusable directions, and pharmacies. Directory entries never sign or transmit a prescription.</p>
    </header>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={kind === "medications" ? "default" : "outline"} onClick={() => { setKind("medications"); setSelected(null); }}>Medications &amp; SIGs</Button>
      <Button variant={kind === "pharmacies" ? "default" : "outline"} onClick={() => setKind("pharmacies")}>Pharmacies</Button>
      <Input aria-label="Search directory" className="max-w-xs" placeholder="Search directory" value={search} onChange={e => setSearch(e.target.value)} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />Include inactive</label>
      <Button variant="outline" onClick={() => void reload()} disabled={loading}>Refresh</Button>
    </div>
    {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}<Button className="ml-3" variant="outline" size="sm" onClick={() => void reload()}>Retry</Button></div>}
    {kind === "medications" ? <>
      <Card><CardHeader><CardTitle className="text-base">{editingMed ? "Edit formulation" : "Add clinic medication formulation"}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="directory-med-name">Medication name</Label><Input id="directory-med-name" value={medForm.medicationName} onChange={e => setMedForm({ ...medForm, medicationName: e.target.value })} /></div>
        <div><Label htmlFor="directory-med-strength">Strength</Label><Input id="directory-med-strength" value={medForm.strength} onChange={e => setMedForm({ ...medForm, strength: e.target.value })} /></div>
        <div><Label htmlFor="directory-med-form">Dosage form</Label><Input id="directory-med-form" value={medForm.dosageForm} onChange={e => setMedForm({ ...medForm, dosageForm: e.target.value })} /></div>
        <div className="sm:col-span-3 flex gap-2"><Button onClick={() => void saveMedication()} disabled={saving || !medForm.medicationName.trim() || !medForm.strength.trim() || !medForm.dosageForm.trim()}>{saving ? "Saving…" : editingMed ? "Save formulation" : "Add formulation"}</Button>{editingMed && <Button variant="outline" onClick={() => { setEditingMed(null); setMedForm({ medicationName: "", strength: "", dosageForm: "" }); }}>Cancel</Button>}</div>
      </CardContent></Card>
      {loading ? <div className="h-24 animate-pulse rounded-md bg-muted" aria-label="Loading medication directory" /> : medications.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No matching clinic formulations. Add an exact name, strength, and dosage form above.</CardContent></Card> : <div className="space-y-2">{medications.map(m => <Card key={m.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
        <button className="min-w-0 text-left" onClick={() => setSelected(m)} aria-pressed={selected?.id === m.id}><span className="font-medium">{m.medicationName} · {m.strength} · {m.dosageForm}</span><span className="ml-2 text-xs text-muted-foreground">{m.isActive ? "Active" : "Inactive"}</span></button>
        <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingMed(m.id); setMedForm({ medicationName: m.medicationName, strength: m.strength, dosageForm: m.dosageForm }); }}>Edit</Button><Button size="sm" variant="outline" onClick={() => void toggleMedication(m)}>{m.isActive ? "Deactivate" : "Reactivate"}</Button></div>
      </CardContent></Card>)}</div>}
      {selected && <Card><CardHeader><CardTitle className="text-base">Saved SIGs · {selected.medicationName} {selected.strength} {selected.dosageForm}</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Complete directions</Label><Textarea value={sigForm.sig} onChange={e => setSigForm({ ...sigForm, sig: e.target.value })} /></div>{(["dose", "route", "frequency"] as const).map(field => <div key={field}><Label className="capitalize">{field} (optional)</Label><Input value={sigForm[field]} onChange={e => setSigForm({ ...sigForm, [field]: e.target.value })} /></div>)}</div>
        <Button onClick={() => void saveSig()} disabled={saving || !sigForm.sig.trim() || !selected.isActive}>{editingSig ? "Save directions" : "Add saved directions"}</Button>
        {editingSig && <Button variant="outline" onClick={() => { setEditingSig(null); setSigForm({ sig: "", dose: "", route: "", frequency: "" }); }}>Cancel edit</Button>}
        {!selected.isActive && <p className="text-sm text-muted-foreground">Reactivate this medication before adding or reactivating directions.</p>}
        {sigs.length ? sigs.map(s => <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><div><p className="text-sm">{s.sig}</p><p className="text-xs text-muted-foreground">{[s.dose, s.route, s.frequency].filter(Boolean).join(" · ") || "No structured details"} · {s.isActive ? "Active" : "Inactive"}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingSig(s.id); setSigForm({ sig: s.sig, dose: s.dose || "", route: s.route || "", frequency: s.frequency || "" }); }}>Edit</Button><Button size="sm" variant="outline" onClick={() => void toggleSig(s)}>{s.isActive ? "Deactivate" : "Reactivate"}</Button></div></div>) : <p className="text-sm text-muted-foreground">No saved directions for this formulation.</p>}
      </CardContent></Card>}
    </> : <>
      <Card><CardHeader><CardTitle className="text-base">{editingPharm ? "Edit pharmacy" : "Add clinic pharmacy"}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        {(["name", "address", "phone", "fax"] as const).map(field => <div key={field}><Label htmlFor={`directory-pharmacy-${field}`} className="capitalize">{field}{field === "name" ? " *" : ""}</Label><Input id={`directory-pharmacy-${field}`} value={pharmForm[field]} onChange={e => setPharmForm({ ...pharmForm, [field]: e.target.value })} /></div>)}
        <div className="flex gap-2"><Button onClick={() => void savePharmacy()} disabled={saving || !pharmForm.name.trim()}>{saving ? "Saving…" : editingPharm ? "Save pharmacy" : "Add pharmacy"}</Button>{editingPharm && <Button variant="outline" onClick={() => { setEditingPharm(null); setPharmForm({ name: "", address: "", phone: "", fax: "" }); }}>Cancel</Button>}</div>
      </CardContent></Card>
      {loading ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : pharmacies.length === 0 ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No matching clinic pharmacies.</CardContent></Card> : <div className="space-y-2">{pharmacies.map(p => <Card key={p.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4"><div><p className="font-medium">{p.name} {!p.isActive && <span className="text-xs text-muted-foreground">Inactive</span>}</p><p className="text-sm text-muted-foreground">{[p.address, p.phone, p.fax].filter(Boolean).join(" · ")}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setEditingPharm(p.id); setPharmForm({ name: p.name, address: p.address || "", phone: p.phone || "", fax: p.fax || "" }); }}>Edit</Button><Button size="sm" variant="outline" onClick={() => void togglePharmacy(p)}>{p.isActive ? "Deactivate" : "Reactivate"}</Button></div></CardContent></Card>)}</div>}
    </>}
  </section>;
}
