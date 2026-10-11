
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { findExactFormulation } from "@/lib/prescription-directory";

interface PrescriptionDialogProps {
  open: boolean;
  onClose: () => void;
  patientId: number;
  patientName: string;
  editPrescriptionId?: number | null;
}

const emptyMedication = () => ({
  medicationName: "",
  strength: "",
  dosageForm: "",
  dose: "",
  route: "",
  frequency: "",
  daysSupply: "",
  sig: "",
  quantity: "",
  refills: "0",
  indication: "",
  substitutionAllowed: true,
});

type Medication = ReturnType<typeof emptyMedication>;
type MedicationField = Exclude<keyof Medication, "substitutionAllowed">;

type CatalogMedication = { id: number; medicationName: string; strength: string; dosageForm: string; isActive: boolean };
type SavedSig = { id: number; medicationId: number; sig: string; dose: string | null; route: string | null; frequency: string | null; isActive: boolean };
type SigCandidate = { medicationIndex: number; medicationId: number | null; manual: boolean; medicationName: string; strength: string; dosageForm: string; sig: string; dose: string; route: string; frequency: string };

type SavedPharmacy = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
};

const emptyPharmacy = () => ({
  pharmacyName: "",
  pharmacyAddress: "",
  pharmacyPhone: "",
  pharmacyFax: "",
});

export function PrescriptionDialog({
  open,
  onClose,
  patientId,
  patientName,
  editPrescriptionId = null,
}: PrescriptionDialogProps) {
  const { toast } = useToast();

  const [medications, setMedications] = useState<Medication[]>([
    emptyMedication(),
  ]);
  const [pharmacy, setPharmacy] = useState(emptyPharmacy());
  const [saving, setSaving] = useState(false);
const [loadingDraft, setLoadingDraft] = useState(false);
const [loadedDraftId, setLoadedDraftId] = useState<number | null>(null);
const [error, setError] = useState("");

  const [catalogResults, setCatalogResults] = useState<CatalogMedication[]>([]);
  const [favoriteSearchOpen, setFavoriteSearchOpen] = useState<number | null>(null);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogSelections, setCatalogSelections] = useState<Record<number, CatalogMedication | null>>({});
  const [sigOptions, setSigOptions] = useState<Record<number, SavedSig[]>>({});
  const [sigLoading, setSigLoading] = useState<number | null>(null);
  const [sigErrors, setSigErrors] = useState<Record<number, string>>({});
  const [sigSearchOpen, setSigSearchOpen] = useState<number | null>(null);
  const [sigSearchTerms, setSigSearchTerms] = useState<Record<number, string>>({});
  const [sigCandidates, setSigCandidates] = useState<SigCandidate[]>([]);
  const [savedDraftAwaitingSigs, setSavedDraftAwaitingSigs] = useState(false);
  const [sigSaveError, setSigSaveError] = useState("");

  const [savedPharmacies, setSavedPharmacies] = useState<SavedPharmacy[]>([]);
  const [pharmacySearchOpen, setPharmacySearchOpen] = useState(false);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(false);
  const [savingPharmacy, setSavingPharmacy] = useState(false);

  const medicationSearchController = useRef<AbortController | null>(null);
  const pharmacySearchController = useRef<AbortController | null>(null);
  const sigSearchControllers = useRef<Record<number, AbortController>>({});
  const contextGeneration = useRef(0);

  useEffect(() => {
    if (!open) {
      medicationSearchController.current?.abort();
      Object.values(sigSearchControllers.current).forEach(controller => controller.abort());
      sigSearchControllers.current = {};
      pharmacySearchController.current?.abort();
      setFavoriteSearchOpen(null);
      setPharmacySearchOpen(false);
    }

    return () => {
      medicationSearchController.current?.abort();
      Object.values(sigSearchControllers.current).forEach(controller => controller.abort());
      sigSearchControllers.current = {};
      pharmacySearchController.current?.abort();
    };
  }, [open]);
useEffect(() => {
  contextGeneration.current++;
  setSaving(false);
  medicationSearchController.current?.abort();
  Object.values(sigSearchControllers.current).forEach(controller => controller.abort());
  sigSearchControllers.current = {};
  pharmacySearchController.current?.abort();
  setCatalogSelections({});
  setSigOptions({});
  setSigErrors({});
  setSigCandidates([]);
  setSigSearchOpen(null);
  setSavedDraftAwaitingSigs(false);
  setSigSaveError("");
  if (!open) {
    setLoadingDraft(false);
    setLoadedDraftId(null);
    setMedications([emptyMedication()]);
    setPharmacy(emptyPharmacy());
    setError("");
    return;
  }

  setLoadedDraftId(null);
  setMedications([emptyMedication()]);
  setPharmacy(emptyPharmacy());
  setError("");

  if (!editPrescriptionId) {
    setLoadingDraft(false);
    return;
  }

  const controller = new AbortController();

  async function loadDraft() {
    setLoadingDraft(true);
setLoadedDraftId(null);
setError("");

    try {
      const response = await fetch(
        `/api/prescriptions/${editPrescriptionId}`,
        {
          credentials: "include",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error("Unable to load prescription draft.");
      }

      const draft = await response.json();

      if (draft.patientId !== patientId || draft.status !== "draft") {
        throw new Error(
          "This prescription cannot be edited in the current patient chart."
        );
      }

      if (controller.signal.aborted) return;

      setMedications([
        {
          medicationName: draft.medicationName ?? "",
          strength: draft.strength ?? "",
          dosageForm: draft.dosageForm ?? "",
          dose: draft.dose ?? "",
          route: draft.route ?? "",
          frequency: draft.frequency ?? "",
          daysSupply: draft.daysSupply?.toString() ?? "",
          sig: draft.sig ?? "",
          quantity: draft.quantity ?? "",
          refills: draft.refills?.toString() ?? "0",
          indication: draft.indication ?? "",
          substitutionAllowed: draft.substitutionAllowed ?? true,
        },
      ]);

      setPharmacy({
        pharmacyName: draft.pharmacyName ?? "",
        pharmacyAddress: draft.pharmacyAddress ?? "",
        pharmacyPhone: draft.pharmacyPhone ?? "",
        pharmacyFax: draft.pharmacyFax ?? "",
      });
      setLoadedDraftId(editPrescriptionId);
      if (draft.medicationName && draft.strength && draft.dosageForm) {
        const catalog = await fetch(`/api/prescription-medications?search=${encodeURIComponent(draft.medicationName)}`, {
          credentials: "include", signal: controller.signal,
        });
        if (catalog.ok) {
          const exact = findExactFormulation(await catalog.json(), draft);
          if (controller.signal.aborted) return;
          if (exact) {
            setCatalogSelections(previous => ({ ...previous, 0: exact }));
            void loadMedicationSigs(0, exact.id);
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load prescription draft."
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoadingDraft(false);
      }
    }
  }

  void loadDraft();

  return () => controller.abort();
}, [open, editPrescriptionId, patientId]);
  function updateMedication(
    index: number,
    field: keyof Medication,
    value: string | boolean
  ) {
    // Full directions are authoritative. Editing them invalidates structured
    // defaults from a previously selected SIG (e.g. one tablet vs half a tablet).
    // Selecting a saved SIG sets its own matching details immediately afterwards.
    if (field === "sig" && medications[index]?.sig !== value) {
      setMedications(previous => previous.map((medication, i) => i === index
        ? { ...medication, sig: value as string, dose: "", route: "", frequency: "" }
        : medication));
      return;
    }
    if ((field === "medicationName" || field === "strength" || field === "dosageForm") &&
      medications[index] && medications[index][field] !== value) {
      medicationSearchController.current?.abort();
      sigSearchControllers.current[index]?.abort();
      setCatalogSelections(previous => ({ ...previous, [index]: null }));
      setSigOptions(previous => ({ ...previous, [index]: [] }));
      setSigSearchOpen(null);
      setSigErrors(previous => ({ ...previous, [index]: "" }));
      setMedications(previous => previous.map((medication, i) => i === index
        ? {
            ...medication,
            [field]: value as string,
            ...(field === "medicationName" ? { strength: "", dosageForm: "" } : {}),
            sig: "",
            dose: "",
            route: "",
            frequency: "",
          }
        : medication));
      return;
    }
    setMedications((previous) =>
      previous.map((medication, i) =>
        i === index ? { ...medication, [field]: value } : medication
      )
    );
  }

 
  async function searchMedicationFavorites(index: number, search: string) {
    medicationSearchController.current?.abort();

    const controller = new AbortController();
    medicationSearchController.current = controller;

    setFavoriteSearchOpen(index);
    setCatalogResults([]);
    setCatalogError("");

    if (!search.trim()) {
      setFavoritesLoading(false);
      return;
    }

    setFavoritesLoading(true);

    try {
      const response = await fetch(
        `/api/prescription-medications?search=${encodeURIComponent(search)}&includeInactive=false`,
        {
          credentials: "include",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error("Unable to search clinic medication directory");
      }

      const results = await response.json();

      if (!controller.signal.aborted) {
        setCatalogResults(Array.isArray(results) ? results : []);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setCatalogResults([]);
        setCatalogError(error instanceof Error ? error.message : "Unable to search medications.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setFavoritesLoading(false);
      }
    }
  }


  function selectMedicationFavorite(index: number, favorite: CatalogMedication) {
    medicationSearchController.current?.abort();
    setMedications((previous) =>
      previous.map((medication, i) =>
        i === index
          ? {
              ...medication,
              medicationName: favorite.medicationName,
              strength: favorite.strength,
              dosageForm: favorite.dosageForm,
            }
          : medication
      )
    );

    setFavoriteSearchOpen(null);
    setCatalogResults([]);
    setCatalogSelections(previous => ({ ...previous, [index]: favorite }));
    setSigOptions(previous => ({ ...previous, [index]: [] }));
    updateMedication(index, "sig", "");
    updateMedication(index, "dose", "");
    updateMedication(index, "route", "");
    updateMedication(index, "frequency", "");
    void loadMedicationSigs(index, favorite.id);
  }

  async function loadMedicationSigs(index: number, medicationId: number) {
    sigSearchControllers.current[index]?.abort();
    const controller = new AbortController();
    sigSearchControllers.current[index] = controller;
    setSigLoading(index);
    setSigErrors(previous => ({ ...previous, [index]: "" }));
    try {
      const response = await fetch(`/api/prescription-medications/${medicationId}/sigs?includeInactive=false`, { credentials: "include", signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load saved directions.");
      const results = await response.json();
      if (!controller.signal.aborted) setSigOptions(previous => ({ ...previous, [index]: Array.isArray(results) ? results : [] }));
    } catch (cause) {
      if (!controller.signal.aborted) setSigErrors(previous => ({ ...previous, [index]: cause instanceof Error ? cause.message : "Unable to load saved directions." }));
    } finally { if (!controller.signal.aborted) setSigLoading(null); }
  }

  function selectSavedSig(index: number, saved: SavedSig) {
    updateMedication(index, "sig", saved.sig);
    updateMedication(index, "dose", saved.dose || "");
    updateMedication(index, "route", saved.route || "");
    updateMedication(index, "frequency", saved.frequency || "");
    setSigSearchOpen(null);
  }

  function addMedication() {
    if (medications.length >= 20) {
      setError("A maximum of 20 medications is allowed per batch.");
      return;
    }

    setError("");
    setMedications((previous) => [...previous, emptyMedication()]);
  }

  function removeMedication(index: number) {
    if (medications.length === 1) return;

    setMedications((previous) =>
      previous.filter((_, i) => i !== index)
    );
    setCatalogSelections(previous => Object.fromEntries(Object.entries(previous)
      .filter(([key]) => Number(key) !== index)
      .map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value])));
    setSigOptions(previous => Object.fromEntries(Object.entries(previous)
      .filter(([key]) => Number(key) !== index)
      .map(([key, value]) => [Number(key) > index ? Number(key) - 1 : Number(key), value])));
    setError("");
  }

  function medicationInput(
    index: number,
    field: MedicationField,
    placeholder: string,
    type = "text"
  ) {
    return (
      <Input
        type={type}
        placeholder={placeholder}
        value={medications[index][field]}
        onChange={(event) =>
          updateMedication(index, field, event.target.value)
        }
        disabled={saving}
      />
    );
  }

  function updatePharmacy(
    field: keyof ReturnType<typeof emptyPharmacy>,
    value: string
  ) {
    setPharmacy((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

 
  async function searchSavedPharmacies(search: string) {
    pharmacySearchController.current?.abort();

    const controller = new AbortController();
    pharmacySearchController.current = controller;

    setPharmacySearchOpen(true);
    setSavedPharmacies([]);
    setPharmaciesLoading(true);

    try {
      const response = await fetch(
        `/api/prescription-pharmacies?search=${encodeURIComponent(search)}`,
        {
          credentials: "include",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error("Unable to search pharmacies");
      }

      const results = await response.json();

      if (!controller.signal.aborted) {
        setSavedPharmacies(Array.isArray(results) ? results : []);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setSavedPharmacies([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setPharmaciesLoading(false);
      }
    }
  }


  function selectSavedPharmacy(selected: SavedPharmacy) {
    pharmacySearchController.current?.abort();
    setPharmacy({
      pharmacyName: selected.name,
      pharmacyAddress: selected.address || "",
      pharmacyPhone: selected.phone || "",
      pharmacyFax: selected.fax || "",
    });

    setPharmacySearchOpen(false);
    setSavedPharmacies([]);
  }

  async function saveCurrentPharmacy() {
    if (!pharmacy.pharmacyName.trim()) {
      toast({
        title: "Pharmacy name required",
        description: "Enter a pharmacy name before saving.",
        variant: "destructive",
      });
      return;
    }

    setSavingPharmacy(true);

    try {
      const response = await fetch("/api/prescription-pharmacies", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pharmacy.pharmacyName.trim(),
          address: pharmacy.pharmacyAddress.trim() || null,
          phone: pharmacy.pharmacyPhone.trim() || null,
          fax: pharmacy.pharmacyFax.trim() || null,
        }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Unable to save pharmacy");
      }

      toast({
        title: "Pharmacy saved",
        description: "This pharmacy is now available in your clinic's saved pharmacy list.",
      });

      setPharmacySearchOpen(false);
    } catch (error) {
      toast({
        title: "Unable to save pharmacy",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingPharmacy(false);
    }
  }

  function resetForm() {
    setMedications([emptyMedication()]);
    setPharmacy(emptyPharmacy());
    setError("");
    setCatalogSelections({});
    setSigOptions({});
    setSigCandidates([]);
    setSavedDraftAwaitingSigs(false);
  }

  async function saveCandidate(candidate: SigCandidate, addMedicationFirst: boolean) {
    const generation = contextGeneration.current;
    setSigSaveError("");
    try {
      let medicationId = candidate.medicationId;
      if (medicationId == null && addMedicationFirst) {
        const medicationResponse = await fetch("/api/prescription-medications", {
          method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ medicationName: candidate.medicationName, strength: candidate.strength, dosageForm: candidate.dosageForm }),
        });
        const medResult = await medicationResponse.json().catch(() => ({}));
        if (generation !== contextGeneration.current) return;
        if (medicationResponse.status === 409) {
          const lookup = await fetch(`/api/prescription-medications?search=${encodeURIComponent(candidate.medicationName)}`, { credentials: "include" });
          const exact = lookup.ok ? findExactFormulation(await lookup.json(), candidate) : null;
          if (!exact) throw new Error(medResult.error || "Review this formulation in the directory before saving directions.");
          medicationId = exact.id;
        } else {
          if (!medicationResponse.ok) throw new Error(medResult.error || "Unable to add this exact formulation to the clinic directory.");
          medicationId = medResult.id;
        }
        if (generation !== contextGeneration.current) return;
        setSigCandidates(previous => previous.map(item => item === candidate ? { ...item, medicationId } : item));
      }
      if (medicationId == null) return;
      const response = await fetch(`/api/prescription-medications/${medicationId}/sigs`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sig: candidate.sig, dose: candidate.dose || null, route: candidate.route || null, frequency: candidate.frequency || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (generation !== contextGeneration.current) return;
      if (!response.ok) throw new Error(result.error || "Unable to save these directions.");
      setSigCandidates(previous => previous.filter(item => !(item.medicationIndex === candidate.medicationIndex && item.sig === candidate.sig)));
    } catch (cause) {
      if (generation === contextGeneration.current) setSigSaveError(cause instanceof Error ? cause.message : "Unable to save these directions.");
    }
  }

  function skipCandidate(candidate: SigCandidate) {
    setSigCandidates(previous => previous.filter(item => item !== candidate));
    setSigSaveError("");
  }

  async function saveAllDrafts() {
  const generation = contextGeneration.current;
  if (savedDraftAwaitingSigs) return;
  if (saving || loadingDraft) return;
if (editPrescriptionId && loadedDraftId !== editPrescriptionId) {
  setError("The prescription draft has not loaded successfully. Changes cannot be saved.");
  return;
}
  if (editPrescriptionId && medications.length !== 1) {
    setError("An existing prescription must contain exactly one medication.");
    return;
  }

  setError("");

    const payloadMedications = [];

    for (let index = 0; index < medications.length; index++) {
      const medication = medications[index];

      if (
        !medication.medicationName.trim() ||
        !medication.sig.trim() ||
        !medication.quantity.trim()
      ) {
        setError(
          `Medication ${index + 1}: Name, complete directions, and quantity are required.`
        );
        return;
      }

      const refills = Number(medication.refills);
      const daysSupply = medication.daysSupply.trim()
        ? Number(medication.daysSupply)
        : null;

      if (
        !Number.isInteger(refills) ||
        refills < 0 ||
        refills > 99
      ) {
        setError(
          `Medication ${index + 1}: Refills must be between 0 and 99.`
        );
        return;
      }

      if (
        daysSupply !== null &&
        (!Number.isInteger(daysSupply) ||
          daysSupply < 1 ||
          daysSupply > 365)
      ) {
        setError(
          `Medication ${index + 1}: Days supply must be between 1 and 365.`
        );
        return;
      }

      payloadMedications.push({
        medicationName: medication.medicationName,
        strength: medication.strength,
        dosageForm: medication.dosageForm,
        dose: medication.dose,
        route: medication.route,
        frequency: medication.frequency,
        daysSupply,
        sig: medication.sig,
        quantity: medication.quantity,
        ...pharmacy,
        refills,
        indication: medication.indication,
        substitutionAllowed: medication.substitutionAllowed,
      });
    }

    setSaving(true);

    try {
      const response = await fetch(
  editPrescriptionId
    ? `/api/prescriptions/${editPrescriptionId}`
    : `/api/patients/${patientId}/prescriptions/batch`,
  {
    method: editPrescriptionId ? "PATCH" : "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
  editPrescriptionId
    ? {
        ...payloadMedications[0],
        patientId,
      }
    : { medications: payloadMedications }
),
  }
);

      const result = await response.json().catch(() => ({}));
      if (generation !== contextGeneration.current) return;

      if (!response.ok) {
        throw new Error(
          result.error ||
            `Unable to save prescriptions (${response.status})`
        );
      }
      setSavedDraftAwaitingSigs(true);

      await queryClient.invalidateQueries({
        queryKey: ["/api/patients", patientId, "prescriptions"],
      });
      if (generation !== contextGeneration.current) return;

      const candidateKeys = new Set<string>();
      const candidates = medications.flatMap((medication, index) => {
        const selected = catalogSelections[index];
        const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
        const alreadySaved = selected && (sigOptions[index] || []).some(saved => saved.isActive && normalize(saved.sig) === normalize(medication.sig));
        if (!medication.sig.trim() || alreadySaved) return [];
        const identity = [selected?.id ?? medication.medicationName, medication.strength, medication.dosageForm, normalize(medication.sig)].join("|");
        if (candidateKeys.has(identity)) return [];
        candidateKeys.add(identity);
        return [{
          medicationIndex: index,
          medicationId: selected?.id ?? null,
          manual: !selected,
          medicationName: medication.medicationName.trim(),
          strength: medication.strength.trim(),
          dosageForm: medication.dosageForm.trim(),
          sig: medication.sig.trim(),
          dose: medication.dose.trim(),
          route: medication.route.trim(),
          frequency: medication.frequency.trim(),
        }];
      });
      if (candidates.length) {
        setSigCandidates(candidates);
        setSavedDraftAwaitingSigs(true);
        return;
      }

      toast({
  title: editPrescriptionId
    ? "Prescription draft updated"
    : "Prescription drafts saved",
  description: editPrescriptionId
    ? "Changes saved to the existing unsigned prescription draft. Nothing has been transmitted to a pharmacy."
    : `${payloadMedications.length} unsigned prescription draft(s) saved. Nothing has been transmitted to a pharmacy.`,
});

      resetForm();
      onClose();
    } catch (err) {
      if (generation !== contextGeneration.current) return;
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save prescription drafts."
      );
    } finally {
      if (generation === contextGeneration.current) setSaving(false);
    }
  }

  return (
   <Dialog
  open={open}
  onOpenChange={(value) => {
    if (!value && !saving && !loadingDraft) {
      onClose();
    }
  }}
>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prescribe Medication</DialogTitle>

          <p className="text-sm text-muted-foreground">
            Patient: {patientName}
          </p>

          <p className="text-xs text-muted-foreground">
            Draft only — prescriptions are not signed or transmitted.
          </p>
        </DialogHeader>

        <fieldset
  disabled={
    saving ||
    loadingDraft ||
    savedDraftAwaitingSigs ||
    (!!editPrescriptionId && loadedDraftId !== editPrescriptionId)
  }
  className="space-y-6 min-w-0"
>
          {medications.map((medication, index) => (
            <div
              key={index}
              className="rounded-lg border p-4 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  Medication {index + 1}
                </h3>

                {medications.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => removeMedication(index)}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                
                <div className="col-span-2 space-y-1 relative">
                  <Label>Medication Name</Label>
                  <Input
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={favoriteSearchOpen === index}
                    aria-controls={`medication-options-${index}`}
                    value={medication.medicationName}
                    placeholder="Start typing a medication name..."
                    disabled={saving}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateMedication(index, "medicationName", value);
                      void searchMedicationFavorites(index, value);
                    }}
                  />

                  {favoriteSearchOpen === index && medication.medicationName.trim() && (
                    <div id={`medication-options-${index}`} role="listbox" aria-label="Clinic medication formulations" className="absolute z-20 top-full left-0 right-0 rounded-md border bg-background shadow-sm max-h-48 overflow-y-auto">
                      {favoritesLoading ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          Searching clinic formulations…
                        </p>
                      ) : catalogError ? <p role="alert" className="p-3 text-sm text-destructive">{catalogError}</p> : catalogResults.length > 0 ? (
                        catalogResults.map((favorite) => (
                          <button
                            key={favorite.id}
                            role="option"
                            aria-selected={catalogSelections[index]?.id === favorite.id}
                            type="button"
                            className="w-full text-left p-3 text-sm hover:bg-muted border-b last:border-b-0"
                            onClick={() => selectMedicationFavorite(index, favorite)}
                          >
                            <span className="font-medium">
                              {favorite.medicationName} · {favorite.strength} · {favorite.dosageForm}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="p-3 text-sm text-muted-foreground">
                          No exact clinic formulation found. Continue with manually entered details; cataloguing is always a separate explicit step.
                        </p>
                      )}
                    </div>
                  )}
                  {catalogSelections[index] && <p className="text-xs text-muted-foreground">Selected exact formulation: {catalogSelections[index]?.medicationName} · {catalogSelections[index]?.strength} · {catalogSelections[index]?.dosageForm}</p>}
                </div>


                <div className="space-y-1">
                  <Label>Strength</Label>
                  {medicationInput(
                    index,
                    "strength",
                    "e.g., 100 mg"
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Dosage Form</Label>
                  {medicationInput(
                    index,
                    "dosageForm",
                    "Tablet, capsule, cream, etc."
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Dose</Label>
                  {medicationInput(
                    index,
                    "dose",
                    "e.g., 1 tablet"
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Route</Label>
                  {medicationInput(
                    index,
                    "route",
                    "e.g., oral"
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Frequency</Label>
                  {medicationInput(
                    index,
                    "frequency",
                    "e.g., once daily"
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Days Supply</Label>
                  {medicationInput(
                    index,
                    "daysSupply",
                    "e.g., 30",
                    "number"
                  )}
                </div>

                <div className="col-span-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Complete Prescription Directions (SIG)</Label>
                    {catalogSelections[index] && <Button type="button" size="sm" variant="outline" onClick={() => setSigSearchOpen(sigSearchOpen === index ? null : index)} aria-expanded={sigSearchOpen === index} aria-controls={`sig-options-${index}`}>Saved directions</Button>}
                  </div>
                  {sigSearchOpen === index && catalogSelections[index] && (
                    <div id={`sig-options-${index}`} role="listbox" aria-label="Saved SIGs for selected formulation" className="rounded-md border bg-background max-h-40 overflow-y-auto">
                      <Input aria-label="Search saved directions" placeholder="Search saved directions…" value={sigSearchTerms[index] || ""} onChange={event => setSigSearchTerms(previous => ({ ...previous, [index]: event.target.value }))} />
                      {sigLoading === index ? <p className="p-3 text-sm text-muted-foreground">Loading saved directions…</p>
                        : sigErrors[index] ? <p role="alert" className="p-3 text-sm text-destructive">{sigErrors[index]} <button type="button" className="underline" onClick={() => catalogSelections[index] && void loadMedicationSigs(index, catalogSelections[index]!.id)}>Retry</button></p>
                        : (sigOptions[index] || []).filter(saved => `${saved.sig} ${saved.dose || ""} ${saved.route || ""} ${saved.frequency || ""}`.toLowerCase().includes((sigSearchTerms[index] || "").trim().toLowerCase())).length ? (sigOptions[index] || []).filter(saved => `${saved.sig} ${saved.dose || ""} ${saved.route || ""} ${saved.frequency || ""}`.toLowerCase().includes((sigSearchTerms[index] || "").trim().toLowerCase())).map(saved => <button type="button" role="option" key={saved.id} className="block w-full border-b p-3 text-left text-sm hover:bg-muted" onClick={() => selectSavedSig(index, saved)}><span>{saved.sig}</span>{(saved.dose || saved.route || saved.frequency) && <span className="block text-xs text-muted-foreground">{[saved.dose, saved.route, saved.frequency].filter(Boolean).join(" · ")}</span>}</button>)
                        : <p className="p-3 text-sm text-muted-foreground">No saved directions for this formulation. Type directions below.</p>}
                    </div>
                  )}

                  <Textarea
                    rows={3}
                    placeholder="Take one tablet by mouth daily."
                    value={medication.sig}
                    onChange={(event) =>
                      updateMedication(
                        index,
                        "sig",
                        event.target.value
                      )
                    }
                    disabled={saving}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Quantity</Label>
                  {medicationInput(
                    index,
                    "quantity",
                    "e.g., 30 tablets"
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Refills</Label>
                  {medicationInput(
                    index,
                    "refills",
                    "0",
                    "number"
                  )}
                </div>

                <div className="col-span-2 space-y-1">
                  <Label>Indication</Label>
                  {medicationInput(
                    index,
                    "indication",
                    "Reason for prescription"
                  )}
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <Checkbox
                    checked={medication.substitutionAllowed}
                    onCheckedChange={(checked) =>
                      updateMedication(
                        index,
                        "substitutionAllowed",
                        checked === true
                      )
                    }
                    disabled={saving}
                  />

                  <Label>Generic substitution allowed</Label>
                </div>
                
              </div>
            </div>
          ))}

          {!editPrescriptionId && (
  <Button
    type="button"
    variant="outline"
    disabled={saving || medications.length >= 20}
    onClick={addMedication}
  >
    + Add Medication
  </Button>
)}

          <div className="border-t pt-5 space-y-4">
            <h3 className="font-semibold">Pharmacy Information</h3>

            <p className="text-xs text-muted-foreground">
              This pharmacy will be used for all medications in
              this batch.
            </p>

            
            <div className="space-y-1 relative">
              <Label>Pharmacy Name</Label>
              <Input
                value={pharmacy.pharmacyName}
                placeholder="Search saved pharmacies..."
                onFocus={() => {
                  void searchSavedPharmacies(pharmacy.pharmacyName);
                }}
                onChange={(event) => {
                  const value = event.target.value;
                  updatePharmacy("pharmacyName", value);
                  void searchSavedPharmacies(value);
                }}
                disabled={saving}
              />

              {pharmacySearchOpen && (
                <div className="rounded-md border bg-background shadow-sm max-h-48 overflow-y-auto">
                  {pharmaciesLoading ? (
                    <p className="p-3 text-sm text-muted-foreground">
                      Searching pharmacies...
                    </p>
                  ) : savedPharmacies.length > 0 ? (
                    savedPharmacies.map((saved) => (
                      <button
                        key={saved.id}
                        type="button"
                        className="w-full text-left p-3 text-sm hover:bg-muted border-b last:border-b-0"
                        onClick={() => selectSavedPharmacy(saved)}
                      >
                        <span className="font-medium">{saved.name}</span>
                        {saved.address && (
                          <span className="block text-xs text-muted-foreground">
                            {saved.address}
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <p className="p-3 text-sm text-muted-foreground">
                      No saved pharmacies found.
                    </p>
                  )}
                </div>
              )}
            </div>


            <div className="space-y-1">
              <Label>Pharmacy Address</Label>
              <Input
                value={pharmacy.pharmacyAddress}
                placeholder="Street, city, state, ZIP"
                onChange={(event) =>
                  updatePharmacy(
                    "pharmacyAddress",
                    event.target.value
                  )
                }
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Pharmacy Phone</Label>
                <Input
                  value={pharmacy.pharmacyPhone}
                  onChange={(event) =>
                    updatePharmacy(
                      "pharmacyPhone",
                      event.target.value
                    )
                  }
                  disabled={saving}
                />
              </div>

              <div className="space-y-1">
                <Label>Pharmacy Fax</Label>
                <Input
                  value={pharmacy.pharmacyFax}
                  onChange={(event) =>
                    updatePharmacy(
                      "pharmacyFax",
                      event.target.value
                    )
                  }
                  disabled={saving}
                />
              </div>
              
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || savingPharmacy}
              onClick={() => void saveCurrentPharmacy()}
            >
              {savingPharmacy ? "Saving Pharmacy..." : "Save Pharmacy"}
            </Button>

            </div>
          </div>
        </fieldset>

        {savedDraftAwaitingSigs && (
          <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50/60 p-4" aria-labelledby="save-sig-review-title">
            <div>
              <h3 id="save-sig-review-title" className="font-semibold">Prescription draft saved — review reusable directions</h3>
              <p className="mt-1 text-sm text-muted-foreground">The draft is saved and remains unsigned. Saving a SIG is optional and does not submit or change the prescription.</p>
            </div>
            {sigCandidates.length ? sigCandidates.map(candidate => (
              <div key={`${candidate.medicationIndex}-${candidate.medicationName}-${candidate.sig}`} className="rounded-md border bg-background p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Save these directions for this medication?</p>
                <p className="mt-1 text-sm font-medium">{candidate.medicationName} · {candidate.strength || "Strength not entered"} · {candidate.dosageForm || "Form not entered"}</p>
                <p className="mt-1 text-sm">{candidate.sig}</p>
                <p className="mt-1 text-xs text-muted-foreground">{[candidate.dose, candidate.route, candidate.frequency].filter(Boolean).join(" · ")}</p>
                {candidate.manual && candidate.medicationId == null
                  ? <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void saveCandidate(candidate, true)} disabled={saving || !candidate.medicationName || !candidate.strength || !candidate.dosageForm}>Yes — add this exact formulation and save SIG</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => skipCandidate(candidate)}>No — skip</Button>
                    <a className="inline-flex h-9 items-center rounded-md border px-3 text-sm underline-offset-4 hover:underline" href="/account?section=prescriptionDirectory">Open Prescription Directory</a>
                  </div>
                  : <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void saveCandidate(candidate, false)} disabled={saving}>Yes — save directions</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => skipCandidate(candidate)}>No — skip</Button>
                  </div>}
              </div>
            )) : <p className="text-sm text-muted-foreground">Direction storage is complete. You may close this window.</p>}
            {sigSaveError && <div role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{sigSaveError}<p className="mt-1 text-xs">The prescription draft is already saved. Retry saving these directions or choose No to skip; the prescription will not be submitted again.</p></div>}
            {!sigCandidates.length && <Button type="button" onClick={() => { toast({ title: editPrescriptionId ? "Prescription draft updated" : "Prescription draft saved", description: "Unsigned draft only; nothing was transmitted." }); resetForm(); onClose(); }}>Done</Button>}
          </section>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          {!savedDraftAwaitingSigs && <Button
  variant="outline"
  disabled={saving || loadingDraft}
  onClick={onClose}
>
  Close
          </Button>}

          {!savedDraftAwaitingSigs && <Button
  disabled={
    saving ||
    loadingDraft ||
    (!!editPrescriptionId && loadedDraftId !== editPrescriptionId)
  }
  onClick={saveAllDrafts}
>
  {saving
    ? "Saving..."
    : loadingDraft
      ? "Loading Draft..."
      : editPrescriptionId
        ? "Save Changes"
        : `Save All Drafts (${medications.length})`}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
