
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

type MedicationFavorite = {
  id: number;
  medicationName: string;
  strength: string | null;
  dosageForm: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  sig: string;
  quantity: string | null;
  daysSupply: number | null;
  refills: number;
  sharedWithClinic: boolean;
};

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

  const [favorites, setFavorites] = useState<MedicationFavorite[]>([]);
  const [favoriteSearchOpen, setFavoriteSearchOpen] = useState<number | null>(null);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  const [savedPharmacies, setSavedPharmacies] = useState<SavedPharmacy[]>([]);
  const [pharmacySearchOpen, setPharmacySearchOpen] = useState(false);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(false);
  const [savingPharmacy, setSavingPharmacy] = useState(false);

  const medicationSearchController = useRef<AbortController | null>(null);
  const pharmacySearchController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      medicationSearchController.current?.abort();
      pharmacySearchController.current?.abort();
      setFavoriteSearchOpen(null);
      setPharmacySearchOpen(false);
    }

    return () => {
      medicationSearchController.current?.abort();
      pharmacySearchController.current?.abort();
    };
  }, [open]);
useEffect(() => {
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
    setFavorites([]);

    if (!search.trim()) {
      setFavoritesLoading(false);
      return;
    }

    setFavoritesLoading(true);

    try {
      const response = await fetch(
        `/api/prescription-medication-templates?search=${encodeURIComponent(search)}`,
        {
          credentials: "include",
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error("Unable to search medication favorites");
      }

      const results = await response.json();

      if (!controller.signal.aborted) {
        setFavorites(Array.isArray(results) ? results : []);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setFavorites([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setFavoritesLoading(false);
      }
    }
  }


  function selectMedicationFavorite(index: number, favorite: MedicationFavorite) {
    medicationSearchController.current?.abort();
    setMedications((previous) =>
      previous.map((medication, i) =>
        i === index
          ? {
              ...medication,
              medicationName: favorite.medicationName,
              strength: favorite.strength || "",
              dosageForm: favorite.dosageForm || "",
              dose: favorite.dose || "",
              route: favorite.route || "",
              frequency: favorite.frequency || "",
              sig: favorite.sig,
              quantity: favorite.quantity || "",
              daysSupply: favorite.daysSupply?.toString() || "",
              refills: favorite.refills.toString(),
            }
          : medication
      )
    );

    setFavoriteSearchOpen(null);
    setFavorites([]);
  }

  async function saveMedicationFavorite(index: number) {
    const medication = medications[index];

    if (!medication.medicationName.trim() || !medication.sig.trim()) {
      toast({
        title: "Missing information",
        description: "Enter a medication name and SIG before saving a favorite.",
        variant: "destructive",
      });
      return;
    }

    const refills = Number(medication.refills);
    const daysSupply = medication.daysSupply.trim()
      ? Number(medication.daysSupply)
      : null;

    if (
      !Number.isInteger(refills) ||
      refills < 0 ||
      refills > 99 ||
      (daysSupply !== null &&
        (!Number.isInteger(daysSupply) ||
          daysSupply < 1 ||
          daysSupply > 365))
    ) {
      toast({
        title: "Invalid prescription values",
        description: "Check refills and days supply before saving.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(
        "/api/prescription-medication-templates",
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            medicationName: medication.medicationName.trim(),
            strength: medication.strength.trim() || null,
            dosageForm: medication.dosageForm.trim() || null,
            dose: medication.dose.trim() || null,
            route: medication.route.trim() || null,
            frequency: medication.frequency.trim() || null,
            sig: medication.sig.trim(),
            quantity: medication.quantity.trim() || null,
            daysSupply,
            refills,
            sharedWithClinic: false,
          }),
        }
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Unable to save favorite");
      }

      toast({
        title: "Medication favorite saved",
        description: "Saved to your personal medication favorites.",
      });
    } catch (error) {
      toast({
        title: "Unable to save favorite",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
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
  }

  async function saveAllDrafts() {
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
        ...medication,
        ...pharmacy,
        refills,
        daysSupply,
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

      if (!response.ok) {
        throw new Error(
          result.error ||
            `Unable to save prescriptions (${response.status})`
        );
      }

      await queryClient.invalidateQueries({
        queryKey: ["/api/patients", patientId, "prescriptions"],
      });

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
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save prescription drafts."
      );
    } finally {
      setSaving(false);
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
                    <div className="rounded-md border bg-background shadow-sm max-h-48 overflow-y-auto">
                      {favoritesLoading ? (
                        <p className="p-3 text-sm text-muted-foreground">
                          Searching favorites...
                        </p>
                      ) : favorites.length > 0 ? (
                        favorites.map((favorite) => (
                          <button
                            key={favorite.id}
                            type="button"
                            className="w-full text-left p-3 text-sm hover:bg-muted border-b last:border-b-0"
                            onClick={() => selectMedicationFavorite(index, favorite)}
                          >
                            <span className="font-medium">
                              {favorite.medicationName}
                            </span>
                            {favorite.strength && ` — ${favorite.strength}`}
                            <span className="block text-xs text-muted-foreground">
                              {favorite.sig}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="p-3 text-sm text-muted-foreground">
                          No saved favorites found.
                        </p>
                      )}
                    </div>
                  )}
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
                  <Label>Complete Prescription Directions (SIG)</Label>

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
                
                <div className="col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void saveMedicationFavorite(index)}
                  >
                    Save as Favorite
                  </Button>
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

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
  variant="outline"
  disabled={saving || loadingDraft}
  onClick={onClose}
>
  Close
</Button>

          <Button
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
</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
