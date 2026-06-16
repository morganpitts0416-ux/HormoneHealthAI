import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, X, ChevronDown, ChevronUp } from "lucide-react";

export type MedEntry = {
  drugName: string;
  genericName?: string;
  strength?: string;
  strengthUnit?: string;
  form?: string;
  route?: string;
  sig?: string;
  quantity?: string;
  daysSupply?: string;
  refills?: string;
  startDate?: string;
  indication?: string;
};

const STRENGTH_UNITS = ["MCG", "MG", "MG/ML", "MEQ", "Units", "IU", "G", "%"];
const FORMS = ["Tab", "Cap", "Liquid", "Patch", "Injection", "Cream", "Gel", "Ointment", "Spray", "Drops", "Powder", "Suppository", "Other"];
const ROUTES = ["Oral", "Sublingual", "Topical", "Transdermal", "Subcutaneous", "Intramuscular", "Intravenous", "Intranasal", "Ophthalmic", "Otic", "Rectal", "Vaginal", "Other"];

const EMPTY: MedEntry = {
  drugName: "",
  genericName: "",
  strength: "",
  strengthUnit: "MG",
  form: "Tab",
  route: "Oral",
  sig: "",
  quantity: "",
  daysSupply: "",
  refills: "",
  startDate: "",
  indication: "",
};

interface Props {
  value: MedEntry[];
  onChange: (v: MedEntry[]) => void;
}

export function MedicationListField({ value, onChange }: Props) {
  const entries: MedEntry[] = Array.isArray(value)
    ? value.filter(e => e && typeof e === "object")
    : [];

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<MedEntry>(EMPTY);

  const set = (k: keyof MedEntry, v: string) => setDraft(d => ({ ...d, [k]: v }));

  const startAdd = () => { setDraft(EMPTY); setEditingIdx(-1); };
  const startEdit = (i: number) => { setDraft({ ...EMPTY, ...entries[i] }); setEditingIdx(i); };
  const cancel = () => { setEditingIdx(null); setDraft(EMPTY); };

  const save = () => {
    if (!draft.drugName.trim()) return;
    if (editingIdx === -1) {
      onChange([...entries, { ...draft }]);
    } else if (editingIdx !== null) {
      const arr = [...entries];
      arr[editingIdx] = { ...draft };
      onChange(arr);
    }
    setEditingIdx(null);
    setDraft(EMPTY);
  };

  const remove = (i: number) => {
    const arr = [...entries];
    arr.splice(i, 1);
    onChange(arr);
    if (editingIdx === i) { setEditingIdx(null); setDraft(EMPTY); }
  };

  return (
    <div className="space-y-2">
      {entries.map((med, i) => (
        <div key={i} className="rounded-md overflow-hidden text-sm" style={{ backgroundColor: "#edf2e6", border: "1px solid #c4d4a8" }}>
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="font-medium" style={{ color: "#2e3a20" }}>{med.drugName}</span>
              {(med.strength || med.strengthUnit || med.form) && (
                <span className="text-muted-foreground ml-2">
                  {[med.strength, med.strengthUnit, med.form].filter(Boolean).join(" ")}
                </span>
              )}
              {med.route && med.route !== "Oral" && (
                <span className="text-muted-foreground ml-1">· {med.route}</span>
              )}
              {med.sig && <p className="text-xs text-muted-foreground mt-0.5 truncate">{med.sig}</p>}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => editingIdx === i ? cancel() : startEdit(i)}
                className="p-1 rounded"
                data-testid={`edit-med-entry-${i}`}
              >
                {editingIdx === i
                  ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "#5a7040" }} />
                  : <Pencil className="w-3.5 h-3.5" style={{ color: "#5a7040" }} />}
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-1 rounded text-destructive"
                data-testid={`remove-med-entry-${i}`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {editingIdx === i && (
            <MedEntryForm
              draft={draft}
              set={set}
              onSave={save}
              onCancel={cancel}
              isNew={false}
            />
          )}
        </div>
      ))}

      {editingIdx === -1 && (
        <div className="rounded-md overflow-hidden text-sm border" style={{ backgroundColor: "#f9fbf6", borderColor: "#c4d4a8" }}>
          <MedEntryForm
            draft={draft}
            set={set}
            onSave={save}
            onCancel={cancel}
            isNew={true}
          />
        </div>
      )}

      {editingIdx === null && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="text-xs gap-1.5"
          onClick={startAdd}
          data-testid="button-add-med-entry"
        >
          <Plus className="h-3 w-3" /> Add medication
        </Button>
      )}
    </div>
  );
}

function MedEntryForm({
  draft,
  set,
  onSave,
  onCancel,
  isNew,
}: {
  draft: MedEntry;
  set: (k: keyof MedEntry, v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  return (
    <div className="px-3 py-3 space-y-3 border-t" style={{ borderColor: "#c4d4a8" }}>
      {isNew && (
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#5a7040" }}>
          Add Medication
        </p>
      )}

      <div className="space-y-1">
        <Label className="text-xs">
          Drug Name <span className="text-destructive">*</span>
        </Label>
        <Input
          value={draft.drugName}
          onChange={e => set("drugName", e.target.value)}
          placeholder="e.g. Metformin"
          data-testid="input-medentry-drug-name"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Generic Name</Label>
        <Input
          value={draft.genericName ?? ""}
          onChange={e => set("genericName", e.target.value)}
          placeholder="Generic or brand name (optional)"
          data-testid="input-medentry-generic-name"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Strength</Label>
          <Input
            value={draft.strength ?? ""}
            onChange={e => set("strength", e.target.value)}
            placeholder="e.g. 500"
            data-testid="input-medentry-strength"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit</Label>
          <Select value={draft.strengthUnit ?? "MG"} onValueChange={v => set("strengthUnit", v)}>
            <SelectTrigger data-testid="select-medentry-strength-unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STRENGTH_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Form</Label>
          <Select value={draft.form ?? "Tab"} onValueChange={v => set("form", v)}>
            <SelectTrigger data-testid="select-medentry-form"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Route</Label>
        <Select value={draft.route ?? "Oral"} onValueChange={v => set("route", v)}>
          <SelectTrigger data-testid="select-medentry-route"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROUTES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Sig / Directions</Label>
        <Textarea
          value={draft.sig ?? ""}
          onChange={e => set("sig", e.target.value)}
          placeholder="e.g. Take 1 tablet by mouth twice daily with food"
          rows={2}
          data-testid="textarea-medentry-sig"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Quantity</Label>
          <Input
            value={draft.quantity ?? ""}
            onChange={e => set("quantity", e.target.value)}
            placeholder="e.g. 60"
            data-testid="input-medentry-quantity"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Days Supply</Label>
          <Input
            type="number"
            min="0"
            value={draft.daysSupply ?? ""}
            onChange={e => set("daysSupply", e.target.value)}
            placeholder="e.g. 30"
            data-testid="input-medentry-days-supply"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Refills</Label>
          <Input
            type="number"
            min="0"
            value={draft.refills ?? ""}
            onChange={e => set("refills", e.target.value)}
            placeholder="e.g. 3"
            data-testid="input-medentry-refills"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Start Date</Label>
          <Input
            type="date"
            value={draft.startDate ?? ""}
            onChange={e => set("startDate", e.target.value)}
            data-testid="input-medentry-start-date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reason / Indication</Label>
          <Input
            value={draft.indication ?? ""}
            onChange={e => set("indication", e.target.value)}
            placeholder="e.g. Type 2 diabetes"
            data-testid="input-medentry-indication"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={!draft.drugName.trim()}
          data-testid="button-save-med-entry"
        >
          {isNew ? "Add" : "Save Changes"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
