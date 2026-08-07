import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, CheckCircle } from "lucide-react";

interface FulfillOrderPopoverProps {
  orderId: number;
  isPending?: boolean;
  onFulfill: (orderId: number, fulfillmentNote?: string) => void;
  /** Visual style variant — "dashboard" is smaller, "profile" matches patient-profiles */
  variant?: "dashboard" | "profile-ghost" | "profile-ghost-sm";
  label?: string;
  "data-testid"?: string;
}

/**
 * Wraps the "Order Ready" / "Mark fulfilled" button in a small popover that
 * lets the clinician attach an optional fulfillment note (pickup / delivery
 * instructions) before confirming the status change.
 */
export function FulfillOrderPopover({
  orderId,
  isPending,
  onFulfill,
  variant = "dashboard",
  label,
  "data-testid": testId,
}: FulfillOrderPopoverProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  function handleConfirm() {
    onFulfill(orderId, note.trim() || undefined);
    setOpen(false);
    setNote("");
  }

  function handleQuickConfirm(e: React.MouseEvent) {
    // If popover is already open, ignore — user clicked the trigger again
    if (open) return;
    // Short-circuit: open the popover (don't fulfill immediately)
    // The button click always opens the popover so clinicians can add a note.
    // This is handled by the Popover itself.
  }

  const buttonContent =
    variant === "dashboard" ? (
      <>
        <CheckCircle2 className="w-3 h-3" />
        {label ?? "Order Ready"}
      </>
    ) : variant === "profile-ghost-sm" ? (
      <>
        <CheckCircle className="w-3 h-3" />
        {label ?? "Ready"}
      </>
    ) : (
      <>
        <CheckCircle className="w-3 h-3" />
        {label ?? "Mark fulfilled"}
      </>
    );

  const trigger =
    variant === "dashboard" ? (
      <Button
        size="sm"
        data-testid={testId}
        className="h-7 px-2 text-xs gap-1"
        style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
        disabled={isPending}
        onClick={handleQuickConfirm}
      >
        {buttonContent}
      </Button>
    ) : variant === "profile-ghost-sm" ? (
      <Button
        size="sm"
        variant="ghost"
        data-testid={testId}
        className="text-xs h-6 px-2 gap-1"
        disabled={isPending}
        onClick={handleQuickConfirm}
      >
        {buttonContent}
      </Button>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        data-testid={testId}
        className="text-xs h-7 px-2 gap-1"
        disabled={isPending}
        onClick={handleQuickConfirm}
      >
        {buttonContent}
      </Button>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-3 space-y-3"
        side="top"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "#1c2414" }}>Mark order as ready</p>
          <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>
            Optionally add pickup or delivery instructions for the patient.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`fulfill-note-${orderId}`} className="text-xs font-medium">
            Fulfillment note <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id={`fulfill-note-${orderId}`}
            placeholder="e.g. Ready at front desk · Ships tomorrow · Suite B"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-xs resize-none min-h-[72px]"
            data-testid={`textarea-fulfill-note-${orderId}`}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-7"
            onClick={() => { setOpen(false); setNote(""); }}
            data-testid={`button-fulfill-cancel-${orderId}`}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs h-7 gap-1"
            style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
            onClick={handleConfirm}
            disabled={isPending}
            data-testid={`button-fulfill-confirm-${orderId}`}
          >
            <CheckCircle2 className="w-3 h-3" />
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
