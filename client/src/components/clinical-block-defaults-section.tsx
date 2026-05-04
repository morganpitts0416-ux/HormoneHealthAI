import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowDown, ArrowUp, Plus, RotateCcw, Save, Trash2,
} from "lucide-react";
import {
  ROS_SYSTEMS, PE_SYSTEMS,
  type ClinicalSystemOverride,
} from "@shared/note-builtin-blocks";

interface BlockDefaultsResponse {
  rosSystems: ClinicalSystemOverride[] | null;
  peSystems: ClinicalSystemOverride[] | null;
}

function shippedDefaults(kind: "ros" | "pe"): ClinicalSystemOverride[] {
  const list = kind === "ros" ? ROS_SYSTEMS : PE_SYSTEMS;
  return list.map((name) => ({ name, defaultFinding: "" }));
}

function normalize(rows: ClinicalSystemOverride[]): ClinicalSystemOverride[] {
  return rows
    .map((r) => ({
      name: (r.name ?? "").trim(),
      defaultFinding: (r.defaultFinding ?? "").trim(),
    }))
    .filter((r) => r.name.length > 0);
}

function rowsEqual(
  a: ClinicalSystemOverride[],
  b: ClinicalSystemOverride[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if ((a[i].defaultFinding ?? "") !== (b[i].defaultFinding ?? "")) return false;
  }
  return true;
}

export function ClinicalBlockDefaultsSection() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<BlockDefaultsResponse>({
    queryKey: ["/api/clinical-block-defaults"],
  });

  const [rosRows, setRosRows] = useState<ClinicalSystemOverride[]>([]);
  const [peRows, setPeRows] = useState<ClinicalSystemOverride[]>([]);

  // Hydrate from server, falling back to shipped defaults.
  useEffect(() => {
    if (!data) return;
    setRosRows(
      data.rosSystems && data.rosSystems.length > 0
        ? data.rosSystems.map((r) => ({ name: r.name, defaultFinding: r.defaultFinding ?? "" }))
        : shippedDefaults("ros"),
    );
    setPeRows(
      data.peSystems && data.peSystems.length > 0
        ? data.peSystems.map((r) => ({ name: r.name, defaultFinding: r.defaultFinding ?? "" }))
        : shippedDefaults("pe"),
    );
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        rosSystems: rowsEqual(normalize(rosRows), shippedDefaults("ros"))
          ? null
          : normalize(rosRows),
        peSystems: rowsEqual(normalize(peRows), shippedDefaults("pe"))
          ? null
          : normalize(peRows),
      };
      return apiRequest("PUT", "/api/clinical-block-defaults", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinical-block-defaults"] });
      toast({ title: "Saved", description: "Your clinical block defaults are updated." });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save defaults",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    },
  });

  const dirty = useMemo(() => {
    const currentRos = data?.rosSystems && data.rosSystems.length > 0
      ? data.rosSystems
      : shippedDefaults("ros");
    const currentPe = data?.peSystems && data.peSystems.length > 0
      ? data.peSystems
      : shippedDefaults("pe");
    return !rowsEqual(normalize(rosRows), normalize(currentRos))
      || !rowsEqual(normalize(peRows), normalize(currentPe));
  }, [data, rosRows, peRows]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold" style={{ color: "#1c2414" }}>Clinical Block Defaults</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Customize the systems and per-system normal-finding text used when you insert a Review of Systems or Physical Exam block. These defaults flow through the slash menu, manual SOAP builder, and template builder.
        </p>
      </div>

      <SystemListEditor
        kind="ros"
        title="Review of Systems"
        description="When a row is left at Normal with no extra notes, the default finding is what shows up in the saved note."
        rows={rosRows}
        onChange={setRosRows}
      />

      <SystemListEditor
        kind="pe"
        title="Physical Examination"
        description="Tip: replace the generic 'Normal/Negative' label with descriptive findings like 'RRR, no murmurs, rubs, or gallops'."
        rows={peRows}
        onChange={setPeRows}
      />

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setRosRows(shippedDefaults("ros"));
            setPeRows(shippedDefaults("pe"));
          }}
          data-testid="button-block-defaults-reset-all"
        >
          <RotateCcw className="w-4 h-4 mr-2" /> Reset to shipped defaults
        </Button>
        <Button
          onClick={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending || isLoading}
          style={{ backgroundColor: "#2e3a20", color: "#f9f6f0" }}
          data-testid="button-block-defaults-save"
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMut.isPending ? "Saving..." : "Save Defaults"}
        </Button>
      </div>
    </div>
  );
}

function SystemListEditor({
  kind, title, description, rows, onChange,
}: {
  kind: "ros" | "pe";
  title: string;
  description: string;
  rows: ClinicalSystemOverride[];
  onChange: (rows: ClinicalSystemOverride[]) => void;
}) {
  const [newName, setNewName] = useState("");

  const update = (idx: number, patch: Partial<ClinicalSystemOverride>) => {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx: number) => onChange(rows.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const add = () => {
    const v = newName.trim();
    if (!v) return;
    if (rows.some((r) => r.name.toLowerCase() === v.toLowerCase())) return;
    onChange([...rows, { name: v, defaultFinding: "" }]);
    setNewName("");
  };
  const reset = () => {
    const list = kind === "ros" ? ROS_SYSTEMS : PE_SYSTEMS;
    onChange(list.map((name) => ({ name, defaultFinding: "" })));
  };

  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-sm font-semibold">{title}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            data-testid={`button-block-defaults-reset-${kind}`}
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset
          </Button>
        </div>

        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground italic" data-testid={`text-empty-${kind}`}>
              No systems. Add one below to start customizing.
            </p>
          )}
          {rows.map((row, idx) => (
            <div
              key={`${kind}-${idx}`}
              className="grid grid-cols-12 items-start gap-2"
              data-testid={`row-system-${kind}-${idx}`}
            >
              <Input
                className="col-span-3 h-9 text-sm"
                value={row.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="System name"
                data-testid={`input-system-name-${kind}-${idx}`}
              />
              <Textarea
                className="col-span-7 text-sm min-h-9"
                rows={1}
                value={row.defaultFinding}
                onChange={(e) => update(idx, { defaultFinding: e.target.value })}
                placeholder="Default normal finding (optional) — e.g. RRR, no murmurs"
                data-testid={`input-system-finding-${kind}-${idx}`}
              />
              <div className="col-span-2 flex items-center gap-1 justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  data-testid={`button-system-up-${kind}-${idx}`}
                  title="Move up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => move(idx, 1)}
                  disabled={idx === rows.length - 1}
                  data-testid={`button-system-down-${kind}-${idx}`}
                  title="Move down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(idx)}
                  data-testid={`button-system-remove-${kind}-${idx}`}
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t">
          <Label className="sr-only" htmlFor={`add-system-${kind}`}>Add system</Label>
          <Input
            id={`add-system-${kind}`}
            className="h-9 text-sm flex-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a new system..."
            data-testid={`input-add-system-${kind}`}
          />
          <Button
            size="sm"
            onClick={add}
            disabled={!newName.trim()}
            data-testid={`button-add-system-${kind}`}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
