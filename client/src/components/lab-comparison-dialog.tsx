import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { LabResult, SimpleLabUpload } from "@shared/schema";

interface Props {
  open: boolean;
  onClose: () => void;
  labs: LabResult[];
  simpleUploads: SimpleLabUpload[];
  patientName: string;
}

type CellStatus = "normal" | "borderline" | "abnormal" | "critical" | "quick";

interface Cell {
  value: string;
  status: CellStatus;
}

interface FlowRow {
  testName: string;
  unit: string;
  cells: (Cell | null)[];
}

interface Column {
  dateStr: string;
  dateMs: number;
  isQuick: boolean;
}

function statusClass(status: CellStatus | undefined): string {
  if (!status || status === "normal" || status === "quick") return "";
  if (status === "borderline") return "text-amber-600 dark:text-amber-400 font-semibold";
  if (status === "abnormal") return "text-blue-600 dark:text-blue-400 font-semibold";
  if (status === "critical") return "text-red-600 dark:text-red-500 font-bold";
  return "";
}

function fmtDate(dateStr: string): { year: string; day: string } {
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? "T12:00:00" : ""));
    return {
      year: d.getFullYear().toString(),
      day: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
    };
  } catch {
    return { year: "", day: dateStr };
  }
}

// Maps common quick-entry name variants to the canonical category name used
// by full-eval AI interpretations so both appear in the same comparison row.
const QUICK_NAME_CANONICAL: Record<string, string> = {
  "testosterone free":           "Free Testosterone",
  "free testosterone":           "Free Testosterone",
  "testosterone (free)":         "Free Testosterone",
  "testosterone total":          "Total Testosterone",
  "total testosterone":          "Total Testosterone",
  "testosterone (total)":        "Total Testosterone",
  "testosterone bioavailable":   "Bioavailable Testosterone",
  "bioavailable testosterone":   "Bioavailable Testosterone",
  "testosterone, free":          "Free Testosterone",
  "testosterone, total":         "Total Testosterone",
  "dhea-s":                      "DHEA-S",
  "dhea sulfate":                "DHEA-S",
  "dhea":                        "DHEA-S",
  "tsh":                         "TSH",
  "free t4":                     "Free T4",
  "free t3":                     "Free T3",
  "reverse t3":                  "Reverse T3",
  "vitamin d":                   "Vitamin D (25-OH)",
  "vitamin d (25-oh)":           "Vitamin D (25-OH)",
  "25-oh vitamin d":             "Vitamin D (25-OH)",
  "vitamin b12":                 "Vitamin B12",
  "b12":                         "Vitamin B12",
  "hemoglobin a1c":              "Hemoglobin A1c",
  "hba1c":                       "Hemoglobin A1c",
  "a1c":                         "Hemoglobin A1c",
  "hs-crp":                      "hs-CRP",
  "hs crp":                      "hs-CRP",
  "crp":                         "hs-CRP",
  "cortisol (am)":               "Cortisol (AM)",
  "cortisol am":                 "Cortisol (AM)",
  "cortisol":                    "Cortisol (AM)",
  "igf-1":                       "IGF-1",
  "igf1":                        "IGF-1",
  "iron saturation":             "Iron Saturation",
  "iron sat":                    "Iron Saturation",
  "% saturation":                "Iron Saturation",
  "tibc":                        "TIBC",
  "total iron binding":          "TIBC",
  "fasting glucose":             "Fasting Glucose",
  "fasting insulin":             "Fasting Insulin",
  "total cholesterol":           "Total Cholesterol",
  "ldl cholesterol":             "LDL Cholesterol",
  "hdl cholesterol":             "HDL Cholesterol",
  "ldl":                         "LDL Cholesterol",
  "hdl":                         "HDL Cholesterol",
};

function canonicalTestName(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return QUICK_NAME_CANONICAL[lower] ?? raw.trim();
}

function buildMatrix(labs: LabResult[], simpleUploads: SimpleLabUpload[]) {
  type NEntry = { testName: string; value: string; unit: string; status?: CellStatus };
  type NDraw = { dateStr: string; dateMs: number; isQuick: boolean; entries: NEntry[] };

  const draws: NDraw[] = [];

  for (const lab of labs) {
    const interp = (lab.interpretationResult as any) ?? null;
    if (!interp?.interpretations?.length) continue;
    const entries: NEntry[] = (interp.interpretations as any[])
      .filter(i => i.category && i.value != null && String(i.value).trim() !== "")
      .map(i => ({
        testName: String(i.category).trim(),
        value: String(i.value),
        unit: String(i.unit ?? ""),
        status: (i.status as CellStatus) ?? "normal",
      }));
    if (entries.length) {
      draws.push({ dateStr: lab.labDate, dateMs: new Date(lab.labDate).getTime(), isQuick: false, entries });
    }
  }

  for (const u of simpleUploads) {
    const raw = (u.entries as Array<{ name: string; value: string; unit?: string }>) || [];
    const entries: NEntry[] = raw
      .filter(e => e.name && String(e.value ?? "").trim() !== "")
      .map(e => ({
        testName: canonicalTestName(e.name),
        value: String(e.value),
        unit: e.unit ?? "",
        status: "quick" as CellStatus,
      }));
    if (entries.length) {
      draws.push({ dateStr: u.labDate, dateMs: new Date(u.labDate).getTime(), isQuick: true, entries });
    }
  }

  draws.sort((a, b) => a.dateMs - b.dateMs);

  const testNameSet = new Set<string>();
  draws.forEach(d => d.entries.forEach(e => testNameSet.add(e.testName)));
  const testNames = Array.from(testNameSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );

  const unitMap: Record<string, string> = {};
  draws.forEach(d => d.entries.forEach(e => { if (e.unit) unitMap[e.testName] = e.unit; }));

  const cellMap: Record<string, Record<number, Cell>> = {};
  draws.forEach((d, col) => {
    d.entries.forEach(e => {
      if (!cellMap[e.testName]) cellMap[e.testName] = {};
      cellMap[e.testName][col] = { value: e.value, status: e.status ?? "normal" };
    });
  });

  const rows: FlowRow[] = testNames.map(testName => ({
    testName,
    unit: unitMap[testName] ?? "",
    cells: draws.map((_, col) => cellMap[testName]?.[col] ?? null),
  }));

  const columns: Column[] = draws.map(d => ({ dateStr: d.dateStr, dateMs: d.dateMs, isQuick: d.isQuick }));

  return { columns, rows };
}

export function LabComparisonDialog({ open, onClose, labs, simpleUploads, patientName }: Props) {
  const { columns, rows } = useMemo(
    () => buildMatrix(labs, simpleUploads),
    [labs, simpleUploads]
  );

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden flex flex-col"
        style={{ maxWidth: "92vw", width: "92vw", maxHeight: "88vh" }}
      >
        <DialogHeader className="px-5 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Lab Comparison
            <span className="text-muted-foreground font-normal">— {patientName}</span>
            <Badge variant="secondary" className="text-xs font-normal ml-1">
              {rows.length} test{rows.length !== 1 ? "s" : ""} &middot; {columns.length} draw{columns.length !== 1 ? "s" : ""}
            </Badge>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Oldest &rarr; newest, left to right &nbsp;&middot;&nbsp;
            <span className="text-blue-600 dark:text-blue-400 font-medium">Blue = abnormal</span>
            &nbsp;&middot;&nbsp;
            <span className="text-red-600 dark:text-red-500 font-medium">Red = critical</span>
            &nbsp;&middot;&nbsp;
            <span className="text-amber-600 dark:text-amber-400 font-medium">Amber = borderline</span>
            &nbsp;&middot;&nbsp;Quick = manual entry
          </p>
        </DialogHeader>

        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-16 text-sm text-muted-foreground">
            No interpreted lab data available to compare. Run a full lab evaluation first.
          </div>
        ) : (
          <div
            className="flex-1 overflow-auto"
            style={{ overscrollBehavior: "contain" }}
            data-testid="lab-comparison-scroll-container"
          >
            <table
              className="border-collapse"
              style={{ width: "max-content", minWidth: "100%" }}
              data-testid="lab-comparison-table"
            >
              <thead>
                <tr>
                  {/* ── sticky top-left corner: Test label ── */}
                  <th
                    className="sticky left-0 top-0 z-[30] bg-muted text-left px-4 py-2.5 text-xs font-semibold border-r border-b whitespace-nowrap"
                    style={{ minWidth: 220 }}
                  >
                    Test
                  </th>

                  {/* ── date column headers ── */}
                  {columns.map((col, i) => {
                    const { year, day } = fmtDate(col.dateStr);
                    return (
                      <th
                        key={i}
                        className="sticky top-0 z-[20] bg-muted text-center px-3 py-2 text-xs font-semibold border-r border-b"
                        style={{ minWidth: 96 }}
                        data-testid={`lab-comparison-col-${i}`}
                      >
                        <div className="text-[10px] text-muted-foreground leading-none mb-0.5">{year}</div>
                        <div className="leading-none">{day}</div>
                        {col.isQuick && (
                          <div className="text-[9px] text-muted-foreground font-normal mt-0.5 leading-none">Quick</div>
                        )}
                      </th>
                    );
                  })}

                  {/* ── sticky top-right corner: Unit label ── */}
                  <th
                    className="sticky right-0 top-0 z-[30] bg-muted text-left px-3 py-2.5 text-xs font-semibold border-l border-b whitespace-nowrap"
                    style={{ minWidth: 72 }}
                  >
                    Unit
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, ri) => {
                  const stripe = ri % 2 === 0 ? "bg-background" : "bg-muted/25";
                  return (
                    <tr key={row.testName} data-testid={`lab-comparison-row-${ri}`}>
                      {/* ── sticky left: test name ── */}
                      <td
                        className={`sticky left-0 z-[10] px-4 py-2 text-xs font-medium border-r whitespace-nowrap ${stripe}`}
                      >
                        {row.testName}
                      </td>

                      {/* ── value cells ── */}
                      {row.cells.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 text-center text-xs border-r tabular-nums font-mono"
                          data-testid={`lab-comparison-cell-${ri}-${ci}`}
                        >
                          {cell ? (
                            <span className={statusClass(cell.status)}>{cell.value}</span>
                          ) : (
                            <span className="text-muted-foreground/35 select-none">—</span>
                          )}
                        </td>
                      ))}

                      {/* ── sticky right: unit ── */}
                      <td
                        className={`sticky right-0 z-[10] px-3 py-2 text-[11px] text-muted-foreground border-l whitespace-nowrap ${stripe}`}
                      >
                        {row.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
