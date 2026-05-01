import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Upload, Camera, ScanLine, Trash2, Eye, Download, FileText, Image as ImageIcon, Loader2, X } from "lucide-react";
import jsPDF from "jspdf";

type PatientDocumentSummary = {
  id: number;
  clinicId: number;
  patientId: number;
  uploadedByUserId: number | null;
  uploadedByName: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  category: string;
  notes: string | null;
  source: string;
  createdAt: string;
};

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "outside_records", label: "Outside Medical Records" },
  { value: "pa_form", label: "Prior Auth (PA) Form" },
  { value: "pmp", label: "PMP Report" },
  { value: "imaging", label: "Imaging Report" },
  { value: "lab_external", label: "External Lab Result" },
  { value: "referral", label: "Referral" },
  { value: "consent", label: "Consent" },
  { value: "insurance", label: "Insurance" },
  { value: "id", label: "Photo ID" },
  { value: "other", label: "Other" },
];

function categoryLabel(value: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === value)?.label ?? "Other";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

interface Props {
  patientId: number;
}

export default function PatientDocumentsCard({ patientId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showSection, setShowSection] = useState(true);
  const [category, setCategory] = useState<string>("outside_records");
  const [notes, setNotes] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const { data: documents = [], isLoading } = useQuery<PatientDocumentSummary[]>({
    queryKey: ["/api/patients", patientId, "documents"],
    enabled: Number.isFinite(patientId),
  });

  const uploadMut = useMutation({
    mutationFn: async (args: { files: File[]; source: "upload" | "scan" | "photo"; category: string; notes: string }) => {
      // Client-side guards mirror server limits to surface friendly errors
      // before crossing the network: 25 MB / file, 50 MB total, 10 files.
      const MAX_FILE = 25 * 1024 * 1024;
      const MAX_TOTAL = 50 * 1024 * 1024;
      const MAX_COUNT = 10;
      if (args.files.length > MAX_COUNT) {
        throw new Error(`Up to ${MAX_COUNT} files per upload.`);
      }
      const oversized = args.files.find((f) => f.size > MAX_FILE);
      if (oversized) throw new Error(`"${oversized.name}" exceeds the 25 MB limit.`);
      const total = args.files.reduce((acc, f) => acc + f.size, 0);
      if (total > MAX_TOTAL) throw new Error(`Total upload exceeds 50 MB. Try fewer files at once.`);

      const fd = new FormData();
      for (const f of args.files) fd.append("files", f, f.name);
      fd.append("category", args.category);
      fd.append("source", args.source);
      if (args.notes) fd.append("notes", args.notes);
      const res = await fetch(`/api/patients/${patientId}/documents`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `Upload failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (created: any[]) => {
      qc.invalidateQueries({ queryKey: ["/api/patients", patientId, "documents"] });
      toast({
        title: "Uploaded",
        description: `${created.length} file${created.length === 1 ? "" : "s"} added to chart.`,
      });
      setNotes("");
    },
    onError: (e: any) => {
      toast({ title: "Upload failed", description: e?.message ?? String(e), variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(`/api/patients/${patientId}/documents/${docId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Delete failed"));
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/patients", patientId, "documents"] });
      toast({ title: "Deleted" });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e?.message ?? String(e), variant: "destructive" });
    },
  });

  function handleFiles(files: FileList | File[] | null, source: "upload" | "scan" | "photo" = "upload") {
    if (!files) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    uploadMut.mutate({ files: list, source, category, notes });
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files, "upload");
  }

  const pendingCount = useMemo(
    () => documents.length,
    [documents],
  );

  return (
    <Card data-testid="card-patient-documents">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            Uploaded Documents
            {pendingCount > 0 && (
              <Badge variant="outline" className="text-xs" data-testid="badge-doc-count">
                {pendingCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSection((s) => !s)}
              className="text-xs"
              data-testid="button-toggle-documents"
            >
              {showSection ? "Hide" : "Show"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMut.isPending}
              data-testid="button-upload-documents"
            >
              <Upload className="h-3 w-3" /> Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploadMut.isPending}
              data-testid="button-take-photo"
            >
              <Camera className="h-3 w-3" /> Take Photo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={() => setScanOpen(true)}
              disabled={uploadMut.isPending}
              data-testid="button-scan-document"
            >
              <ScanLine className="h-3 w-3" /> Scan
            </Button>
          </div>
        </div>
      </CardHeader>

      {showSection && (
        <CardContent className="space-y-4">
          {/* Hidden inputs driving Upload + Take Photo buttons */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files, "upload");
              e.currentTarget.value = "";
            }}
            data-testid="input-file-upload"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files, "photo");
              e.currentTarget.value = "";
            }}
            data-testid="input-camera-capture"
          />

          {/* Category + notes for incoming uploads */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="text-xs" data-testid="select-document-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value} data-testid={`select-category-${c.value}`}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Notes (optional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Records from Dr. Smith dated 3/14/26"
                className="text-xs"
                data-testid="input-document-notes"
              />
            </div>
          </div>

          {/* Drag-drop zone */}
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`rounded-md border-2 border-dashed p-6 text-center transition-colors ${
              isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"
            }`}
            data-testid="dropzone-documents"
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">
              {uploadMut.isPending ? "Uploading…" : "Drop files here, or use the buttons above"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDFs and images up to 25 MB. Files are stored securely in this patient's chart.
            </p>
          </div>

          {/* Document list */}
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const isImage = doc.mimeType.startsWith("image/");
                const Icon = isImage ? ImageIcon : FileText;
                const downloadUrl = `/api/patients/${patientId}/documents/${doc.id}/download`;
                return (
                  <div
                    key={doc.id}
                    className="rounded-md border p-3 space-y-1.5"
                    data-testid={`document-row-${doc.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-start gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" data-testid={`text-document-name-${doc.id}`}>
                            {doc.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(doc.createdAt)}
                            {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                            {` · ${formatBytes(doc.sizeBytes)}`}
                          </p>
                          {doc.notes && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">{doc.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs" data-testid={`badge-category-${doc.id}`}>
                          {categoryLabel(doc.category)}
                        </Badge>
                        {doc.source !== "upload" && (
                          <Badge variant="outline" className="text-xs">
                            {doc.source === "scan" ? "Scanned" : "Photo"}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          asChild
                          data-testid={`button-view-document-${doc.id}`}
                        >
                          <a href={`${downloadUrl}?inline=1`} target="_blank" rel="noreferrer">
                            <Eye className="h-3 w-3" /> View
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          asChild
                          data-testid={`button-download-document-${doc.id}`}
                        >
                          <a href={downloadUrl} download={doc.fileName}>
                            <Download className="h-3 w-3" /> Download
                          </a>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (window.confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) {
                              deleteMut.mutate(doc.id);
                            }
                          }}
                          disabled={deleteMut.isPending}
                          data-testid={`button-delete-document-${doc.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}

      {/* Multi-page scan dialog — combines snapped images into a single PDF */}
      <ScanDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        category={category}
        notes={notes}
        isUploading={uploadMut.isPending}
        onSubmit={(file) => {
          uploadMut.mutate(
            { files: [file], source: "scan", category, notes },
            {
              onSuccess: () => setScanOpen(false),
            },
          );
        }}
      />
    </Card>
  );
}

// ── Multi-page scanner dialog ──────────────────────────────────────────────
// Uses the device camera (or file picker on desktop) to snap one or more
// pages, lets the user preview and reorder/remove, then bundles every page
// into a single PDF via jsPDF before uploading.
interface ScanDialogProps {
  open: boolean;
  onClose: () => void;
  category: string;
  notes: string;
  isUploading: boolean;
  onSubmit: (file: File) => void;
}

function ScanDialog({ open, onClose, isUploading, onSubmit }: ScanDialogProps) {
  const [pages, setPages] = useState<{ dataUrl: string; width: number; height: number }[]>([]);
  const [docName, setDocName] = useState<string>("");
  const [building, setBuilding] = useState(false);
  const captureRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setPages([]);
      setDocName("");
    }
  }, [open]);

  function addPageFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        setPages((prev) => [...prev, { dataUrl, width: img.naturalWidth, height: img.naturalHeight }]);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function buildAndSubmit() {
    if (pages.length === 0) return;
    setBuilding(true);
    try {
      // jsPDF page units: pt. We use the first page's aspect to determine
      // orientation, then fit each subsequent page into the same canvas.
      const firstLandscape = pages[0].width > pages[0].height;
      const pdf = new jsPDF({
        orientation: firstLandscape ? "landscape" : "portrait",
        unit: "pt",
        format: "letter",
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pages.forEach((p, i) => {
        if (i > 0) {
          const landscape = p.width > p.height;
          pdf.addPage("letter", landscape ? "landscape" : "portrait");
        }
        // Fit image preserving aspect ratio.
        const ratio = Math.min(pageW / p.width, pageH / p.height);
        const w = p.width * ratio;
        const h = p.height * ratio;
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;
        pdf.addImage(p.dataUrl, "JPEG", x, y, w, h, undefined, "FAST");
      });
      const blob = pdf.output("blob");
      const fileName = (docName.trim() || `Scan ${new Date().toISOString().slice(0, 10)}`) + ".pdf";
      const file = new File([blob], fileName, { type: "application/pdf" });
      onSubmit(file);
    } finally {
      setBuilding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scan Document</DialogTitle>
          <DialogDescription>
            Use your device camera to snap one or more pages. They'll be combined into a single PDF and saved to this patient's chart.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="Document name (optional)"
            className="text-sm"
            data-testid="input-scan-name"
          />

          <input
            ref={captureRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addPageFromFile(f);
              e.currentTarget.value = "";
            }}
            data-testid="input-scan-capture"
          />

          <Button
            variant="default"
            className="w-full gap-2"
            onClick={() => captureRef.current?.click()}
            data-testid="button-add-scan-page"
          >
            <Camera className="w-4 h-4" />
            {pages.length === 0 ? "Capture First Page" : `Capture Another Page (${pages.length} so far)`}
          </Button>

          {pages.length > 0 && (
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {pages.map((p, idx) => (
                <div key={idx} className="relative rounded-md border overflow-hidden" data-testid={`scan-page-${idx}`}>
                  <img src={p.dataUrl} alt={`Page ${idx + 1}`} className="w-full h-32 object-cover" />
                  <div className="absolute top-1 left-1 bg-background/80 text-xs px-1.5 py-0.5 rounded">
                    Page {idx + 1}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute top-1 right-1 h-6 w-6 bg-background/80"
                    onClick={() => setPages((prev) => prev.filter((_, i) => i !== idx))}
                    data-testid={`button-remove-scan-page-${idx}`}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={building || isUploading} data-testid="button-cancel-scan">
            Cancel
          </Button>
          <Button
            onClick={buildAndSubmit}
            disabled={pages.length === 0 || building || isUploading}
            data-testid="button-save-scan"
          >
            {building || isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save to Chart ({pages.length} page{pages.length === 1 ? "" : "s"})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
