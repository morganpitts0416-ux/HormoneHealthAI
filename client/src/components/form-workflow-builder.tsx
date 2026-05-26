import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, ChevronDown, ChevronUp, ChevronRight, ArrowLeft,
  Bell, UserCheck, ClipboardList, MessageSquare, FileText, StickyNote,
  Clock, GitBranch, RefreshCw, StopCircle, Loader2, Pencil, Info,
  Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type StepType =
  | "notify_staff" | "assign_staff" | "create_task"
  | "send_spruce_sms" | "send_portal_message" | "add_internal_note"
  | "wait_delay" | "if_then_branch" | "update_status" | "stop_workflow";

interface StepConfig {
  // notify_staff / assign_staff
  staffUserId?: number | null;
  message?: string;
  note?: string;
  // create_task
  title?: string;
  assigneeUserId?: number | null;
  priority?: string;
  // send_spruce_sms / send_portal_message
  mode?: "static" | "june" | "june_draft";
  staticMessage?: string;
  juneInstructions?: string;
  // add_internal_note
  content?: string;
  // wait_delay
  amount?: number;
  unit?: "hours" | "days";
  // if_then_branch
  condition?: string;
  conditionDetail?: string;
  trueBranch?: LocalStep[];
  falseBranch?: LocalStep[];
  // update_status
  statusField?: string;
  statusValue?: string;
  // stop_workflow
  reason?: string;
}

interface LocalStep {
  id: string;
  stepType: StepType;
  config: StepConfig;
}

interface FormWorkflow {
  id: number;
  clinicId: number;
  name: string;
  description: string | null;
  triggerFormId: number | null;
  enabled: boolean;
  stopConditions: string[];
  createdAt: string;
  updatedAt: string;
}

interface FormWorkflowWithSteps extends FormWorkflow {
  steps: Array<{ id: number; workflowId: number; position: number; stepType: string; config: StepConfig }>;
}

interface IntakeFormOption {
  id: number;
  name: string;
  status: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STEP_META: Record<StepType, { label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  notify_staff:        { label: "Notify Staff",          description: "Send an internal notification to a staff member",      icon: Bell },
  assign_staff:        { label: "Assign to Staff",       description: "Assign this workflow run to a staff member",           icon: UserCheck },
  create_task:         { label: "Create Task",           description: "Create a dashboard task or memo for the team",         icon: ClipboardList },
  send_spruce_sms:     { label: "Send Spruce SMS",       description: "Send a message to the patient via Spruce",             icon: MessageSquare },
  send_portal_message: { label: "Send Portal Message",   description: "Send a message to the patient portal",                icon: FileText },
  add_internal_note:   { label: "Add Internal Note",     description: "Add a note to the patient chart or workflow run",     icon: StickyNote },
  wait_delay:          { label: "Wait / Delay",          description: "Pause the workflow for a set amount of time",          icon: Clock },
  if_then_branch:      { label: "If / Then Branch",      description: "Branch the workflow based on a condition",            icon: GitBranch },
  update_status:       { label: "Update Status",         description: "Update the patient or lead status",                   icon: RefreshCw },
  stop_workflow:       { label: "Stop Workflow",         description: "End this workflow run",                               icon: StopCircle },
};

const STOP_CONDITIONS = [
  { key: "patient_responds",       label: "Patient responds" },
  { key: "staff_replies",          label: "Staff replies" },
  { key: "task_completed",         label: "Task completed" },
  { key: "appointment_scheduled",  label: "Appointment scheduled" },
  { key: "max_attempts_reached",   label: "Max attempts reached" },
  { key: "manually_stopped",       label: "Manually stopped" },
];

const BRANCH_CONDITIONS = [
  { key: "patient_responds",          label: "Patient responds" },
  { key: "no_response_in_wait",       label: "No response within wait period" },
  { key: "staff_replies",             label: "Staff replies" },
  { key: "task_completed",            label: "Task is completed" },
  { key: "appointment_scheduled",     label: "Appointment is scheduled" },
  { key: "form_response_contains",    label: "Form response contains value" },
  { key: "patient_matched",           label: "Patient is matched in system" },
  { key: "patient_unmatched",         label: "Patient is unmatched" },
];

const MESSAGE_MODES = [
  { value: "static",     label: "Static template",       description: "Exact message sent as written" },
  { value: "june",       label: "Instruct June",         description: "June composes a custom message from your instructions" },
  { value: "june_draft", label: "June draft for review", description: "June drafts — staff reviews before sending" },
];

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high",   label: "High" },
  { value: "urgent", label: "Urgent" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function serverStepsToLocal(steps: FormWorkflowWithSteps["steps"]): LocalStep[] {
  return steps
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(s => ({ id: uid(), stepType: s.stepType as StepType, config: s.config ?? {} }));
}

// ── Step config panels ─────────────────────────────────────────────────────

function NotifyStaffConfig({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Message (optional)</Label>
        <Textarea
          value={config.message ?? ""}
          onChange={e => onChange({ ...config, message: e.target.value })}
          placeholder="Brief context for the staff notification..."
          className="text-sm resize-none mt-1"
          rows={2}
          data-testid="input-notify-message"
        />
      </div>
    </div>
  );
}

function AssignStaffConfig({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Assignment Note (optional)</Label>
        <Textarea
          value={config.note ?? ""}
          onChange={e => onChange({ ...config, note: e.target.value })}
          placeholder="Instructions or context for the assignee..."
          className="text-sm resize-none mt-1"
          rows={2}
          data-testid="input-assign-note"
        />
      </div>
    </div>
  );
}

function CreateTaskConfig({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Task Title <span className="text-destructive">*</span></Label>
        <Input
          value={config.title ?? ""}
          onChange={e => onChange({ ...config, title: e.target.value })}
          placeholder="e.g. Review new patient intake for scheduling"
          className="text-sm mt-1"
          data-testid="input-task-title"
        />
      </div>
      <div>
        <Label className="text-xs font-medium">Priority</Label>
        <Select value={config.priority ?? "normal"} onValueChange={v => onChange({ ...config, priority: v })}>
          <SelectTrigger className="text-sm mt-1" data-testid="select-task-priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function SendMessageConfig({ config, onChange, isPortal }: { config: StepConfig; onChange: (c: StepConfig) => void; isPortal?: boolean }) {
  const mode = config.mode ?? "june";
  const availableModes = isPortal
    ? MESSAGE_MODES.filter(m => m.value !== "june_draft")
    : MESSAGE_MODES;

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Message Mode</Label>
        <div className="mt-1.5 space-y-1.5">
          {availableModes.map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => onChange({ ...config, mode: m.value as StepConfig["mode"] })}
              className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                mode === m.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover-elevate"
              }`}
              data-testid={`mode-${m.value}`}
            >
              <p className="text-xs font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.description}</p>
            </button>
          ))}
        </div>
      </div>

      {mode === "static" && (
        <div>
          <Label className="text-xs font-medium">Message Text</Label>
          <Textarea
            value={config.staticMessage ?? ""}
            onChange={e => onChange({ ...config, staticMessage: e.target.value })}
            placeholder="The exact message that will be sent to the patient..."
            className="text-sm resize-none mt-1"
            rows={4}
            data-testid="input-static-message"
          />
          <p className="text-xs text-muted-foreground mt-1">Sent exactly as written — no AI modification.</p>
        </div>
      )}

      {(mode === "june" || mode === "june_draft") && (
        <div>
          <Label className="text-xs font-medium">Instructions for June</Label>
          <Textarea
            value={config.juneInstructions ?? ""}
            onChange={e => onChange({ ...config, juneInstructions: e.target.value })}
            placeholder={`e.g. "Ask the patient what days and times work best for their consultation. Mention the Signature Wellness Evaluation includes a full lab panel."`}
            className="text-sm resize-none mt-1"
            rows={4}
            maxLength={1000}
            data-testid="input-june-instructions"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "june"
              ? "June composes a natural, personalized message based on your instructions and the form submission context."
              : "June drafts a message — a staff member reviews and approves before it sends."}
          </p>
        </div>
      )}
    </div>
  );
}

function AddNoteConfig({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <div>
      <Label className="text-xs font-medium">Note Content</Label>
      <Textarea
        value={config.content ?? ""}
        onChange={e => onChange({ ...config, content: e.target.value })}
        placeholder="Internal note to add to the patient chart or workflow run..."
        className="text-sm resize-none mt-1"
        rows={3}
        data-testid="input-note-content"
      />
    </div>
  );
}

function WaitDelayConfig({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <div>
      <Label className="text-xs font-medium">Wait Duration</Label>
      <div className="flex gap-2 mt-1">
        <Input
          type="number"
          min={1}
          max={365}
          value={config.amount ?? 24}
          onChange={e => onChange({ ...config, amount: Math.max(1, parseInt(e.target.value) || 1) })}
          className="text-sm w-24"
          data-testid="input-wait-amount"
        />
        <Select value={config.unit ?? "hours"} onValueChange={v => onChange({ ...config, unit: v as "hours" | "days" })}>
          <SelectTrigger className="text-sm flex-1" data-testid="select-wait-unit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="days">Days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Workflow pauses here until the wait period elapses or a stop condition fires.
      </p>
    </div>
  );
}

function UpdateStatusConfig({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs font-medium">Status Field</Label>
        <Select
          value={config.statusField ?? "lead_status"}
          onValueChange={v => onChange({ ...config, statusField: v })}
        >
          <SelectTrigger className="text-sm mt-1" data-testid="select-status-field">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lead_status">Lead Status</SelectItem>
            <SelectItem value="patient_status">Patient Status</SelectItem>
            <SelectItem value="form_review_status">Form Review Status</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs font-medium">New Value</Label>
        <Input
          value={config.statusValue ?? ""}
          onChange={e => onChange({ ...config, statusValue: e.target.value })}
          placeholder="e.g. new_patient, scheduled, reviewed"
          className="text-sm mt-1"
          data-testid="input-status-value"
        />
      </div>
    </div>
  );
}

function StopWorkflowConfig({ config, onChange }: { config: StepConfig; onChange: (c: StepConfig) => void }) {
  return (
    <div>
      <Label className="text-xs font-medium">Stop Reason (optional)</Label>
      <Input
        value={config.reason ?? ""}
        onChange={e => onChange({ ...config, reason: e.target.value })}
        placeholder="e.g. workflow complete, patient scheduled"
        className="text-sm mt-1"
        data-testid="input-stop-reason"
      />
    </div>
  );
}

// ── IfThenBranch (recursive) ───────────────────────────────────────────────

function IfThenBranchConfig({
  config,
  onChange,
}: {
  config: StepConfig;
  onChange: (c: StepConfig) => void;
}) {
  function addSubStep(branch: "true" | "false", type: StepType) {
    const key = branch === "true" ? "trueBranch" : "falseBranch";
    const current = config[key] ?? [];
    onChange({ ...config, [key]: [...current, { id: uid(), stepType: type, config: {} }] });
  }

  function updateSubStep(branch: "true" | "false", idx: number, updated: LocalStep) {
    const key = branch === "true" ? "trueBranch" : "falseBranch";
    const arr = [...(config[key] ?? [])];
    arr[idx] = updated;
    onChange({ ...config, [key]: arr });
  }

  function removeSubStep(branch: "true" | "false", idx: number) {
    const key = branch === "true" ? "trueBranch" : "falseBranch";
    const arr = (config[key] ?? []).filter((_, i) => i !== idx);
    onChange({ ...config, [key]: arr });
  }

  function moveSubStep(branch: "true" | "false", idx: number, dir: -1 | 1) {
    const key = branch === "true" ? "trueBranch" : "falseBranch";
    const arr = [...(config[key] ?? [])];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onChange({ ...config, [key]: arr });
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs font-medium">Condition</Label>
        <Select
          value={config.condition ?? "patient_responds"}
          onValueChange={v => onChange({ ...config, condition: v })}
        >
          <SelectTrigger className="text-sm mt-1" data-testid="select-branch-condition">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BRANCH_CONDITIONS.map(c => (
              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.condition === "form_response_contains" && (
        <div>
          <Label className="text-xs font-medium">Value to match</Label>
          <Input
            value={config.conditionDetail ?? ""}
            onChange={e => onChange({ ...config, conditionDetail: e.target.value })}
            placeholder="e.g. yes, interested, Monday"
            className="text-sm mt-1"
            data-testid="input-condition-detail"
          />
        </div>
      )}

      {(["true", "false"] as const).map(branch => (
        <div key={branch} className={`rounded-md border px-3 pt-2 pb-3 ${
          branch === "true"
            ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
            : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"
        }`}>
          <p className={`text-xs font-semibold mb-2 ${
            branch === "true" ? "text-green-700 dark:text-green-400" : "text-orange-700 dark:text-orange-400"
          }`}>
            {branch === "true" ? "If YES (condition met)" : "If NO (condition not met)"}
          </p>
          <MiniStepList
            steps={(branch === "true" ? config.trueBranch : config.falseBranch) ?? []}
            onAdd={type => addSubStep(branch, type)}
            onUpdate={(idx, s) => updateSubStep(branch, idx, s)}
            onRemove={idx => removeSubStep(branch, idx)}
            onMove={(idx, dir) => moveSubStep(branch, idx, dir)}
            depth={1}
          />
        </div>
      ))}
    </div>
  );
}

// ── MiniStepList (used inside IfThenBranch sub-branches) ──────────────────

function MiniStepList({
  steps,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  depth = 0,
}: {
  steps: LocalStep[];
  onAdd: (type: StepType) => void;
  onUpdate: (idx: number, step: LocalStep) => void;
  onRemove: (idx: number) => void;
  onMove: (idx: number, dir: -1 | 1) => void;
  depth?: number;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      {steps.map((step, idx) => (
        <StepCard
          key={step.id}
          step={step}
          idx={idx}
          total={steps.length}
          onChange={s => onUpdate(idx, s)}
          onRemove={() => onRemove(idx)}
          onMove={dir => onMove(idx, dir)}
          depth={depth}
        />
      ))}

      <div className="relative">
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs gap-1.5 border-dashed"
          onClick={() => setAddOpen(v => !v)}
          data-testid={`btn-add-substep-${depth}`}
        >
          <Plus className="w-3 h-3" /> Add step
        </Button>
        {addOpen && (
          <AddStepMenu
            onSelect={type => { onAdd(type); setAddOpen(false); }}
            onClose={() => setAddOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── StepCard ──────────────────────────────────────────────────────────────

function StepCard({
  step,
  idx,
  total,
  onChange,
  onRemove,
  onMove,
  depth = 0,
}: {
  step: LocalStep;
  idx: number;
  total: number;
  onChange: (s: LocalStep) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const meta = STEP_META[step.stepType];
  const Icon = meta.icon;

  function updateConfig(c: StepConfig) {
    onChange({ ...step, config: c });
  }

  return (
    <Card data-testid={`step-card-${step.stepType}-${idx}`} className="rounded-md">
      <CardContent className="pt-2 pb-2 px-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={idx === 0}
              className="p-0.5 text-muted-foreground disabled:opacity-30 hover-elevate rounded"
              data-testid={`btn-step-up-${idx}`}
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={idx === total - 1}
              className="p-0.5 text-muted-foreground disabled:opacity-30 hover-elevate rounded"
              data-testid={`btn-step-down-${idx}`}
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-tight">{meta.label}</p>
              {!open && (
                <p className="text-xs text-muted-foreground leading-tight truncate">
                  {stepSummary(step)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setOpen(v => !v)}
              data-testid={`btn-step-expand-${idx}`}
            >
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onRemove}
              data-testid={`btn-step-remove-${idx}`}
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        {open && (
          <div className="mt-3 pt-3 border-t">
            <StepConfigPanel step={step} onChange={s => updateConfig(s.config)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function stepSummary(step: LocalStep): string {
  const c = step.config;
  switch (step.stepType) {
    case "notify_staff":        return c.message ? `"${c.message.slice(0, 60)}"` : "Notify staff (no message set)";
    case "assign_staff":        return c.note ? `Note: ${c.note.slice(0, 60)}` : "Assign to staff";
    case "create_task":         return c.title ? `Task: "${c.title.slice(0, 60)}"` : "Create task (no title set)";
    case "send_spruce_sms":     return c.mode === "static" ? (c.staticMessage?.slice(0, 60) ?? "Static message") : c.mode === "june_draft" ? "June draft for review" : "June composes message";
    case "send_portal_message": return c.mode === "static" ? (c.staticMessage?.slice(0, 60) ?? "Static message") : "June composes message";
    case "add_internal_note":   return c.content ? `"${c.content.slice(0, 60)}"` : "No content set";
    case "wait_delay":          return `Wait ${c.amount ?? 24} ${c.unit ?? "hours"}`;
    case "if_then_branch":      return BRANCH_CONDITIONS.find(b => b.key === c.condition)?.label ?? "Condition not set";
    case "update_status":       return c.statusField && c.statusValue ? `${c.statusField} → ${c.statusValue}` : "Status not set";
    case "stop_workflow":       return c.reason ? `Stop: ${c.reason}` : "Stop workflow";
    default: return "";
  }
}

function StepConfigPanel({ step, onChange }: { step: LocalStep; onChange: (s: LocalStep) => void }) {
  function onCfg(config: StepConfig) {
    onChange({ ...step, config });
  }
  switch (step.stepType) {
    case "notify_staff":        return <NotifyStaffConfig config={step.config} onChange={onCfg} />;
    case "assign_staff":        return <AssignStaffConfig config={step.config} onChange={onCfg} />;
    case "create_task":         return <CreateTaskConfig config={step.config} onChange={onCfg} />;
    case "send_spruce_sms":     return <SendMessageConfig config={step.config} onChange={onCfg} />;
    case "send_portal_message": return <SendMessageConfig config={step.config} onChange={onCfg} isPortal />;
    case "add_internal_note":   return <AddNoteConfig config={step.config} onChange={onCfg} />;
    case "wait_delay":          return <WaitDelayConfig config={step.config} onChange={onCfg} />;
    case "if_then_branch":      return <IfThenBranchConfig config={step.config} onChange={onCfg} />;
    case "update_status":       return <UpdateStatusConfig config={step.config} onChange={onCfg} />;
    case "stop_workflow":       return <StopWorkflowConfig config={step.config} onChange={onCfg} />;
    default: return null;
  }
}

// ── AddStepMenu ────────────────────────────────────────────────────────────

function AddStepMenu({ onSelect, onClose }: { onSelect: (t: StepType) => void; onClose: () => void }) {
  return (
    <div
      className="absolute z-50 left-0 top-full mt-1 w-full rounded-md border bg-popover shadow-md"
      onMouseLeave={onClose}
    >
      <div className="p-1 grid grid-cols-2 gap-0.5">
        {(Object.entries(STEP_META) as [StepType, typeof STEP_META[StepType]][]).map(([type, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-left hover-elevate"
              data-testid={`add-step-${type}`}
            >
              <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs">{meta.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── WorkflowEditor ─────────────────────────────────────────────────────────

function WorkflowEditor({
  workflowId,
  onBack,
}: {
  workflowId: number;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wf, isLoading } = useQuery<FormWorkflowWithSteps>({
    queryKey: ["/api/form-workflows", workflowId],
    queryFn: async () => {
      const res = await fetch(`/api/form-workflows/${workflowId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load workflow");
      return res.json();
    },
  });

  const { data: forms = [] } = useQuery<IntakeFormOption[]>({
    queryKey: ["/api/form-workflows/forms"],
  });

  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [triggerFormId, setTriggerFormId] = useState<string>("");
  const [enabled, setEnabled]         = useState(false);
  const [stopConditions, setStopConditions] = useState<string[]>([]);
  const [steps, setSteps]             = useState<LocalStep[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  useEffect(() => {
    if (!wf) return;
    setName(wf.name);
    setDescription(wf.description ?? "");
    setTriggerFormId(wf.triggerFormId ? String(wf.triggerFormId) : "");
    setEnabled(wf.enabled);
    setStopConditions((wf.stopConditions as string[]) ?? []);
    setSteps(serverStepsToLocal(wf.steps));
  }, [wf]);

  const saveMetaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/form-workflows/${workflowId}`, {
        name: name.trim(),
        description: description.trim() || null,
        triggerFormId: triggerFormId ? parseInt(triggerFormId) : null,
        enabled,
        stopConditions,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/form-workflows"] });
      queryClient.invalidateQueries({ queryKey: ["/api/form-workflows", workflowId] });
      toast({ title: "Workflow settings saved" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save failed", description: e.message }),
  });

  const saveStepsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/form-workflows/${workflowId}/steps`, { steps });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save steps");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/form-workflows", workflowId] });
      toast({ title: "Steps saved" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Save steps failed", description: e.message }),
  });

  function addStep(type: StepType) {
    setSteps(prev => [...prev, { id: uid(), stepType: type, config: {} }]);
    setAddMenuOpen(false);
  }

  function updateStep(idx: number, s: LocalStep) {
    setSteps(prev => prev.map((step, i) => i === idx ? s : step));
  }

  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx));
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    const arr = [...steps];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setSteps(arr);
  }

  function toggleStopCondition(key: string) {
    setStopConditions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button size="icon" variant="ghost" onClick={onBack} data-testid="btn-back-to-workflows">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold truncate">{name || "Untitled Workflow"}</h3>
          <p className="text-xs text-muted-foreground">Form Workflow Builder</p>
        </div>
        <Badge
          variant="outline"
          className={enabled
            ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
            : "text-muted-foreground"
          }
        >
          {enabled ? "Enabled" : "Disabled"}
        </Badge>
      </div>

      {/* Settings card */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Workflow Settings</p>

          <div>
            <Label className="text-xs font-medium">Workflow Name <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. New Patient Intake Follow-Up"
              className="text-sm mt-1"
              data-testid="input-workflow-name"
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of what this workflow does..."
              className="text-sm resize-none mt-1"
              rows={2}
              data-testid="input-workflow-description"
            />
          </div>

          <div>
            <Label className="text-xs font-medium">Trigger Form</Label>
            <Select value={triggerFormId || "none"} onValueChange={v => setTriggerFormId(v === "none" ? "" : v)}>
              <SelectTrigger className="text-sm mt-1" data-testid="select-trigger-form">
                <SelectValue placeholder="Select a form..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No trigger form selected —</SelectItem>
                {forms.map(f => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.name}
                    {f.status !== "published" && (
                      <span className="text-muted-foreground ml-1">({f.status})</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              This workflow runs when a patient submits the selected form.
            </p>
          </div>

          {/* Stop conditions */}
          <div>
            <Label className="text-xs font-medium">Stop Conditions</Label>
            <p className="text-xs text-muted-foreground mb-2">Workflow stops automatically when any selected condition is met.</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STOP_CONDITIONS.map(sc => (
                <button
                  key={sc.key}
                  type="button"
                  onClick={() => toggleStopCondition(sc.key)}
                  className={`flex items-center gap-2 text-left rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    stopConditions.includes(sc.key)
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover-elevate"
                  }`}
                  data-testid={`stop-condition-${sc.key}`}
                >
                  <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${
                    stopConditions.includes(sc.key) ? "bg-primary border-primary" : "border-muted-foreground"
                  }`}>
                    {stopConditions.includes(sc.key) && (
                      <svg className="w-2 h-2 text-primary-foreground" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  {sc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t">
            <div>
              <p className="text-xs font-medium">Enable Workflow</p>
              <p className="text-xs text-muted-foreground">Workflow runs automatically when the trigger form is submitted.</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="toggle-workflow-enabled"
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              onClick={() => saveMetaMutation.mutate()}
              disabled={saveMetaMutation.isPending || !name.trim()}
              data-testid="btn-save-workflow-settings"
            >
              {saveMetaMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step builder card */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Workflow Steps</p>
              <p className="text-xs text-muted-foreground mt-0.5">Steps run in order when this workflow is triggered.</p>
            </div>
            <Badge variant="outline" className="text-xs">{steps.length} step{steps.length !== 1 ? "s" : ""}</Badge>
          </div>

          <div className="flex items-start gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2">
            <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
              Steps are saved separately from settings. Click <strong>Save Steps</strong> after making changes to the step list.
              The workflow will not execute until Layer 2 (execution engine) is built.
            </p>
          </div>

          {steps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground border border-dashed rounded-md">
              <Zap className="w-6 h-6 mb-2 opacity-40" />
              <p className="text-xs">No steps yet. Add your first step below.</p>
            </div>
          )}

          <div className="space-y-1.5">
            {steps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                idx={idx}
                total={steps.length}
                onChange={s => updateStep(idx, s)}
                onRemove={() => removeStep(idx)}
                onMove={dir => moveStep(idx, dir)}
              />
            ))}
          </div>

          {/* Add step */}
          <div className="relative">
            <Button
              variant="outline"
              className="w-full text-xs gap-1.5 border-dashed"
              onClick={() => setAddMenuOpen(v => !v)}
              data-testid="btn-add-step"
            >
              <Plus className="w-3.5 h-3.5" /> Add Step
            </Button>
            {addMenuOpen && (
              <AddStepMenu
                onSelect={addStep}
                onClose={() => setAddMenuOpen(false)}
              />
            )}
          </div>

          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              onClick={() => saveStepsMutation.mutate()}
              disabled={saveStepsMutation.isPending}
              data-testid="btn-save-steps"
            >
              {saveStepsMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Save Steps
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── WorkflowList ───────────────────────────────────────────────────────────

function WorkflowList({ onEdit }: { onEdit: (id: number) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName]       = useState("");
  const [newDesc, setNewDesc]       = useState("");
  const [deleteId, setDeleteId]     = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useQuery<FormWorkflow[]>({
    queryKey: ["/api/form-workflows"],
  });

  const { data: forms = [] } = useQuery<IntakeFormOption[]>({
    queryKey: ["/api/form-workflows/forms"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/form-workflows", {
        name: newName.trim(),
        description: newDesc.trim() || null,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create");
      return res.json();
    },
    onSuccess: (wf: FormWorkflow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/form-workflows"] });
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      onEdit(wf.id);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Create failed", description: e.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/form-workflows/${id}`, { enabled });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/form-workflows"] }),
    onError: (e: any) => toast({ variant: "destructive", title: "Update failed", description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/form-workflows/${id}`);
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/form-workflows"] });
      setDeleteId(null);
      toast({ title: "Workflow deleted" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Delete failed", description: e.message }),
  });

  function formName(id: number | null) {
    if (!id) return null;
    return forms.find(f => f.id === id)?.name ?? `Form #${id}`;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Form Workflow Builder</p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-md leading-relaxed">
            Create automated workflows triggered by specific form submissions. Each workflow runs independently per clinic.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="btn-create-workflow">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New Workflow
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
        <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          <strong>Builder phase:</strong> You can create and configure workflows now. Automated execution (sending messages, creating tasks, wait/delay, branching) will be active in the next phase.
        </p>
      </div>

      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-md text-muted-foreground">
          <Zap className="w-8 h-8 mb-3 opacity-30" />
          <p className="text-sm font-medium">No workflows yet</p>
          <p className="text-xs mt-1">Create your first workflow to get started.</p>
          <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)} data-testid="btn-create-workflow-empty">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Workflow
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {workflows.map(wf => (
            <Card key={wf.id} data-testid={`workflow-card-${wf.id}`}>
              <CardContent className="pt-3 pb-3 px-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{wf.name}</p>
                      <Badge
                        variant="outline"
                        className={`text-xs ${wf.enabled
                          ? "text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
                          : "text-muted-foreground"
                        }`}
                      >
                        {wf.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    {wf.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{wf.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {wf.triggerFormId
                        ? <>Trigger: <span className="font-medium">{formName(wf.triggerFormId)}</span></>
                        : <span className="italic">No trigger form selected</span>
                      }
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={wf.enabled}
                      onCheckedChange={v => toggleMutation.mutate({ id: wf.id, enabled: v })}
                      data-testid={`toggle-workflow-${wf.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onEdit(wf.id)}
                      data-testid={`btn-edit-workflow-${wf.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteId(wf.id)}
                      data-testid={`btn-delete-workflow-${wf.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Form Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-medium">Workflow Name <span className="text-destructive">*</span></Label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. New Patient Intake Follow-Up"
                className="text-sm mt-1"
                autoFocus
                data-testid="input-new-workflow-name"
                onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMutation.mutate(); }}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Description (optional)</Label>
              <Textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="Brief description..."
                className="text-sm resize-none mt-1"
                rows={2}
                data-testid="input-new-workflow-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newName.trim()}
              data-testid="btn-confirm-create-workflow"
            >
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Create & Configure
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the workflow and all its steps. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground"
              data-testid="btn-confirm-delete-workflow"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Root export ────────────────────────────────────────────────────────────

export function FormWorkflowBuilderSection() {
  const [editingId, setEditingId] = useState<number | null>(null);

  return editingId !== null
    ? <WorkflowEditor workflowId={editingId} onBack={() => setEditingId(null)} />
    : <WorkflowList onEdit={setEditingId} />;
}
