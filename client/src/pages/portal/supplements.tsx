import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Leaf, LogOut, ChevronLeft, CalendarDays, Clock, Package, Sparkles,
  ChevronDown, ChevronUp, MessageSquare, ShoppingCart, Plus, Minus,
  CheckCircle2, RefreshCw, AlertCircle, X, ShoppingBag, ChevronRight,
} from "lucide-react";
import { usePortalUnreadCount } from "@/hooks/use-portal-unread";
import type { SupplementRecommendation, SupplementOrder, SupplementOrderItem } from "@shared/schema";
import { getSupplementPrice, formatPrice } from "@/lib/supplement-prices";

const MEMBER_DISCOUNT = 0.20;

interface PortalPatient {
  patientId: number;
  email: string;
  firstName: string;
  lastName: string;
  gender: string;
  clinicName: string;
  clinicianName: string;
}

interface PublishedProtocol {
  id: number;
  supplements: SupplementRecommendation[];
  clinicianNotes: string | null;
  labDate: string | null;
  publishedAt: string;
  clinicName: string;
  clinicianName: string;
}

interface CartItem {
  supplement: SupplementRecommendation;
  price: number;
  supplyDays: number;
  quantity: number;
}

const CATEGORY_ICONS: Record<string, string> = {
  vitamin: "◈", mineral: "✦", "hormone-support": "⚡", cardiovascular: "♡",
  thyroid: "⊕", iron: "●", metabolic: "◆", bone: "◻", probiotic: "◌",
  detox: "◈", general: "○",
};

const PRIORITY_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: "Priority",    color: "#2e3a20", bg: "#edf2e6" },
  medium: { label: "Recommended", color: "#5a4a20", bg: "#f5f0e6" },
  low:    { label: "Optional",    color: "#6a7a64", bg: "#f2f0ec" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

// ─── Protocol View Row ────────────────────────────────────────────────────────
function ProtocolRow({ supplement, index }: { supplement: SupplementRecommendation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const icon = CATEGORY_ICONS[supplement.category] || "○";
  const priority = PRIORITY_LABELS[supplement.priority] || PRIORITY_LABELS.low;
  const priceInfo = getSupplementPrice(supplement.name);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #ede8df", backgroundColor: "#ffffff" }}>
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-supplement-${index}`}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: "#f2ede6" }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm" style={{ color: "#1c2414" }}>{supplement.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: priority.bg, color: priority.color }}>
              {priority.label}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{supplement.dose}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          {priceInfo && (
            <div className="text-right">
              <p className="text-xs line-through" style={{ color: "#b0b8a0" }}>{formatPrice(priceInfo.price)}</p>
              <p className="text-sm font-semibold" style={{ color: "#2e3a20" }}>{formatPrice(priceInfo.price * (1 - MEMBER_DISCOUNT))}</p>
            </div>
          )}
          <span style={{ color: "#b0b8a0" }}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t" style={{ borderColor: "#f0ebe2" }}>
          {supplement.patientExplanation && (
            <div className="pt-4">
              <p className="text-xs font-medium uppercase tracking-wider mb-1.5" style={{ color: "#a0a880" }}>Why this supplement</p>
              <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{supplement.patientExplanation}</p>
            </div>
          )}
          {supplement.caution && (
            <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#faf7f2" }}>
              <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "#9a8a70" }}>Note</p>
              <p className="text-xs leading-relaxed italic" style={{ color: "#7a7060" }}>{supplement.caution}</p>
            </div>
          )}
          {supplement.timing && (
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a0a880" }} />
              <p className="text-xs" style={{ color: "#7a8a64" }}>{supplement.timing}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shop View Row ────────────────────────────────────────────────────────────
function ShopRow({ supplement, cartItem, onQtyChange, index }: {
  supplement: SupplementRecommendation;
  cartItem: CartItem | undefined;
  onQtyChange: (supplement: SupplementRecommendation, delta: number) => void;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const icon = CATEGORY_ICONS[supplement.category] || "○";
  const priority = PRIORITY_LABELS[supplement.priority] || PRIORITY_LABELS.low;
  const priceInfo = getSupplementPrice(supplement.name);
  const qty = cartItem?.quantity ?? 0;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #ede8df", backgroundColor: "#ffffff" }}>
      <div className="px-4 py-3.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: "#f2ede6" }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm leading-tight" style={{ color: "#1c2414" }}>{supplement.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: priority.bg, color: priority.color }}>
              {priority.label}
            </span>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{supplement.dose}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {priceInfo ? (
            <div className="text-right">
              <p className="text-xs line-through" style={{ color: "#b0b8a0" }}>{formatPrice(priceInfo.price)}</p>
              <p className="text-sm font-bold" style={{ color: "#2e3a20" }}>{formatPrice(priceInfo.price * (1 - MEMBER_DISCOUNT))}</p>
              <p className="text-xs" style={{ color: "#a0a880" }}>{priceInfo.supplyDays}-day supply</p>
            </div>
          ) : (
            <p className="text-xs" style={{ color: "#b0b8a0" }}>Contact clinic</p>
          )}
          {priceInfo && (
            <div className="flex items-center gap-1">
              {qty === 0 ? (
                <button
                  onClick={() => onQtyChange(supplement, 1)}
                  data-testid={`button-add-supplement-${index}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              ) : (
                <div className="flex items-center gap-1 rounded-lg px-1 py-1" style={{ backgroundColor: "#edf2e6" }}>
                  <button
                    onClick={() => onQtyChange(supplement, -1)}
                    data-testid={`button-decrease-qty-${index}`}
                    className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: "#2e3a20" }}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold" style={{ color: "#1c2414" }}>{qty}</span>
                  <button
                    onClick={() => onQtyChange(supplement, 1)}
                    data-testid={`button-increase-qty-${index}`}
                    className="w-6 h-6 flex items-center justify-center rounded"
                    style={{ color: "#2e3a20" }}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Expand toggle */}
      <button
        className="w-full text-left px-4 pb-2.5 flex items-center gap-1 text-xs"
        style={{ color: "#a0a880" }}
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-shop-supplement-${index}`}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Hide details" : "Why recommended"}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-2.5 border-t" style={{ borderColor: "#f0ebe2" }}>
          {supplement.patientExplanation && (
            <p className="text-sm leading-relaxed" style={{ color: "#3d4a30" }}>{supplement.patientExplanation}</p>
          )}
          {supplement.caution && (
            <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "#faf7f2" }}>
              <p className="text-xs italic" style={{ color: "#7a7060" }}>{supplement.caution}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Order Confirmation Modal ─────────────────────────────────────────────────
function OrderModal({ cart, subtotal, onClose, onSuccess }: {
  cart: CartItem[];
  subtotal: number;
  onClose: () => void;
  onSuccess: (orderId: number) => void;
}) {
  const SHIPPING_FEE = 12;
  const [fulfillment, setFulfillment] = useState<"pickup" | "delivery">("pickup");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const discountAmount = subtotal * MEMBER_DISCOUNT;
  const discountedSubtotal = subtotal - discountAmount;
  const shipping = fulfillment === "delivery" ? SHIPPING_FEE : 0;
  const finalTotal = discountedSubtotal + shipping;

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const items: SupplementOrderItem[] = cart.map(c => ({
        name: c.supplement.name,
        dose: c.supplement.dose,
        price: c.price,
        quantity: c.quantity,
        supplyDays: c.supplyDays,
        lineTotal: parseFloat((c.price * c.quantity).toFixed(2)),
      }));
      const fullNotes = [
        `Fulfillment: ${fulfillment === "pickup" ? "In-clinic pickup (Free)" : `Ship to address on file (+$${SHIPPING_FEE} shipping)`}`,
        `Member discount: 20% off (-${formatPrice(discountAmount)})`,
        notes ? `Note: ${notes}` : "",
      ].filter(Boolean).join(" · ");
      const res = await fetch("/api/portal/supplement-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items, subtotal: finalTotal.toFixed(2), patientNotes: fullNotes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Order failed");
      onSuccess(data.orderId);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff", maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#ede8df" }}>
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" style={{ color: "#2e3a20" }} />
            <h2 className="font-semibold text-sm" style={{ color: "#1c2414" }}>Confirm Supplement Order</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "#a0a880" }} data-testid="button-close-order-modal">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {/* Items */}
          <div className="px-5 pt-4 pb-2 space-y-3">
            {cart.map((item, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight" style={{ color: "#1c2414" }}>{item.supplement.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#7a8a64" }}>{item.supplement.dose} · {item.supplyDays}-day supply × {item.quantity}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold" style={{ color: "#2e3a20" }}>
                    {formatPrice(item.price * (1 - MEMBER_DISCOUNT) * item.quantity)}
                  </p>
                  <p className="text-xs line-through" style={{ color: "#b0b8a0" }}>
                    {formatPrice(item.price * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Fulfillment toggle */}
          <div className="px-5 pb-3 space-y-2">
            <p className="text-xs font-medium" style={{ color: "#7a8a64" }}>How would you like to receive your order?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setFulfillment("pickup")}
                data-testid="button-fulfillment-pickup"
                className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border-2 transition-colors"
                style={{
                  borderColor: fulfillment === "pickup" ? "#2e3a20" : "#ede8df",
                  backgroundColor: fulfillment === "pickup" ? "#edf2e6" : "#ffffff",
                  color: fulfillment === "pickup" ? "#2e3a20" : "#7a8a64",
                }}
              >
                In-Clinic Pickup
              </button>
              <button
                onClick={() => setFulfillment("delivery")}
                data-testid="button-fulfillment-delivery"
                className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold border-2 transition-colors"
                style={{
                  borderColor: fulfillment === "delivery" ? "#2e3a20" : "#ede8df",
                  backgroundColor: fulfillment === "delivery" ? "#edf2e6" : "#ffffff",
                  color: fulfillment === "delivery" ? "#2e3a20" : "#7a8a64",
                }}
              >
                Ship to Address on File
              </button>
            </div>
            {fulfillment === "pickup" && (
              <p className="text-xs" style={{ color: "#7a8a64" }}>
                Your clinic will text you when your order is ready for pickup.
              </p>
            )}
          </div>

          {/* Total breakdown */}
          <div className="mx-5 my-3 rounded-xl px-4 py-3 space-y-1.5" style={{ backgroundColor: "#edf2e6" }}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "#4a5e36" }}>Subtotal</span>
              <span className="text-xs font-medium line-through" style={{ color: "#a0a880" }}>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium" style={{ color: "#3a6e3a" }}>Member Discount (20%)</span>
              <span className="text-xs font-semibold" style={{ color: "#3a6e3a" }}>-{formatPrice(discountAmount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "#4a5e36" }}>
                {fulfillment === "delivery" ? "Shipping" : "In-Clinic Pickup"}
              </span>
              <span className="text-xs font-medium" style={{ color: fulfillment === "delivery" ? "#2e3a20" : "#4a8a54" }}>
                {fulfillment === "delivery" ? `+${formatPrice(SHIPPING_FEE)}` : "Free"}
              </span>
            </div>
            <div className="border-t pt-1.5 flex items-center justify-between" style={{ borderColor: "#c8dbb8" }}>
              <span className="text-sm font-semibold" style={{ color: "#1c2414" }}>Order Total</span>
              <span className="text-base font-bold" style={{ color: "#2e3a20" }}>{formatPrice(finalTotal)}</span>
            </div>
          </div>

          {/* Info box */}
          <div className="mx-5 mb-3 rounded-xl px-4 py-3 space-y-1.5" style={{ backgroundColor: "#faf7f2", border: "1px solid #ede8df" }}>
            <p className="text-xs font-semibold" style={{ color: "#7a6a50" }}>How this works</p>
            <p className="text-xs leading-relaxed" style={{ color: "#7a7060" }}>
              Your order request will be sent to your care team. Your card on file with the clinic will be charged and your supplements will be prepared.
            </p>
          </div>

          {/* Optional notes */}
          <div className="px-5 pb-5 space-y-1.5">
            <label className="text-xs font-medium" style={{ color: "#7a8a64" }}>Add a note (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={fulfillment === "delivery" ? "E.g. please ship to my address on file…" : "E.g. I'll be in Wednesday afternoon…"}
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none"
              style={{ borderColor: "#ddd8cf", backgroundColor: "#fafaf8", color: "#1c2414" }}
              data-testid="input-order-notes"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t space-y-2" style={{ borderColor: "#ede8df" }}>
          {error && (
            <div className="flex items-center gap-2 text-xs rounded-lg px-3 py-2" style={{ backgroundColor: "#fef2f2", color: "#c0392b" }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            data-testid="button-confirm-order"
            className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
          >
            {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending Order…</> : `Send Order — ${formatPrice(finalTotal)}`}
          </button>
          <button onClick={onClose} className="w-full text-center text-sm py-1" style={{ color: "#7a8a64" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Success Modal ──────────────────────────────────────────────────────
function OrderSuccessModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
      <div className="w-full max-w-sm rounded-2xl p-8 text-center space-y-4" style={{ backgroundColor: "#ffffff" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: "#edf2e6" }}>
          <CheckCircle2 className="w-8 h-8" style={{ color: "#2e3a20" }} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold" style={{ color: "#1c2414" }}>Order Sent!</h2>
          <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
            Your care team has been notified and will process your order shortly. Your card on file will be charged for the items.
          </p>
          <p className="text-xs" style={{ color: "#a0a880" }}>Order #{orderId}</p>
        </div>
        <button
          onClick={onClose}
          data-testid="button-order-success-close"
          className="w-full py-3 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Past Orders Section ──────────────────────────────────────────────────────
function PastOrders({ orders }: { orders: SupplementOrder[] }) {
  const [expanded, setExpanded] = useState(false);
  if (orders.length === 0) return null;

  const latest = orders[0];
  const daysAgo = daysSince(latest.createdAt as any as string);
  const items = latest.items as SupplementOrderItem[];
  const minSupplyDays = Math.min(...items.map(i => i.supplyDays ?? 30));
  const reorderIn = minSupplyDays - daysAgo;

  return (
    <div className="space-y-3">
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-past-orders"
      >
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Past Orders</p>
        {expanded ? <ChevronUp className="w-4 h-4" style={{ color: "#a0a880" }} /> : <ChevronRight className="w-4 h-4" style={{ color: "#a0a880" }} />}
      </button>

      {expanded && (
        <div className="space-y-2">
          {orders.map((order, i) => {
            const orderItems = order.items as SupplementOrderItem[];
            const ago = daysSince(order.createdAt as any as string);
            return (
              <div key={i} className="rounded-xl px-4 py-3 space-y-2" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold" style={{ color: "#1c2414" }}>Order #{order.id}</p>
                    <p className="text-xs" style={{ color: "#a0a880" }}>{ago === 0 ? "Today" : `${ago} day${ago !== 1 ? "s" : ""} ago`}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ color: "#2e3a20" }}>{formatPrice(parseFloat(order.subtotal))}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      backgroundColor: order.status === 'pending' ? "#fef9ec" : "#edf2e6",
                      color: order.status === 'pending' ? "#7a6a20" : "#2e3a20",
                    }}>{order.status}</span>
                  </div>
                </div>
                <div className="space-y-0.5">
                  {orderItems.map((item, j) => (
                    <p key={j} className="text-xs" style={{ color: "#7a8a64" }}>
                      {item.name} × {item.quantity}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Reorder Banner ───────────────────────────────────────────────────────────
function ReorderBanner({ orders, onReorder }: { orders: SupplementOrder[]; onReorder: () => void }) {
  if (orders.length === 0) return null;
  const latest = orders[0];
  const items = latest.items as SupplementOrderItem[];
  const daysAgo = daysSince(latest.createdAt as any as string);
  const minSupplyDays = Math.min(...items.map(i => i.supplyDays ?? 30));
  const reorderIn = minSupplyDays - daysAgo;

  if (reorderIn > 7) return null;

  const isLow = reorderIn > 0;
  const label = isLow
    ? `Your last supplement order runs out in about ${reorderIn} day${reorderIn !== 1 ? "s" : ""}. Ready to reorder?`
    : "Your last supplement order may be running low. Time to reorder!";

  return (
    <div className="rounded-xl px-4 py-3.5 flex items-center gap-3" style={{ backgroundColor: "#fef9ec", border: "1px solid #f0dea0" }}>
      <RefreshCw className="w-4 h-4 flex-shrink-0" style={{ color: "#7a6a20" }} />
      <p className="text-sm flex-1 leading-snug" style={{ color: "#5a4a10" }}>{label}</p>
      <button
        onClick={onReorder}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
        data-testid="button-reorder"
      >
        Reorder
      </button>
    </div>
  );
}

// ─── Protocol Block ───────────────────────────────────────────────────────────
function ProtocolBlock({ protocol, isLatest }: { protocol: PublishedProtocol; isLatest: boolean }) {
  const highPriority = protocol.supplements.filter(s => s.priority === "high");
  const medium = protocol.supplements.filter(s => s.priority === "medium");
  const low = protocol.supplements.filter(s => s.priority === "low");
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold" style={{ color: "#1c2414" }}>
              Protocol from {protocol.labDate ? formatDate(protocol.labDate) : formatDate(protocol.publishedAt)}
            </h2>
            {isLatest && (
              <Badge className="text-xs" style={{ backgroundColor: "#edf2e6", color: "#2e3a20", border: "none" }}>
                <Leaf className="w-3 h-3 mr-1" /> Current
              </Badge>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#a0a880" }}>
            Shared {formatDate(protocol.publishedAt)}{protocol.clinicianName ? ` · ${protocol.clinicianName}` : ""}
          </p>
        </div>
        <div className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: "#f0ebe2", color: "#7a6a50" }}>
          {protocol.supplements.length} supplement{protocol.supplements.length !== 1 ? "s" : ""}
        </div>
      </div>
      {protocol.clinicianNotes && (
        <div className="rounded-xl p-4 text-sm leading-relaxed" style={{ backgroundColor: "#edf2e6", color: "#2e3a20" }}>
          <p className="font-medium text-xs uppercase tracking-wider mb-1.5" style={{ color: "#5a7040" }}>Note from your care team</p>
          {protocol.clinicianNotes}
        </div>
      )}
      {highPriority.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Priority</p>
          {highPriority.map((s, i) => <ProtocolRow key={i} supplement={s} index={i} />)}
        </div>
      )}
      {medium.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Recommended</p>
          {medium.map((s, i) => <ProtocolRow key={i} supplement={s} index={highPriority.length + i} />)}
        </div>
      )}
      {low.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Optional</p>
          {low.map((s, i) => <ProtocolRow key={i} supplement={s} index={highPriority.length + medium.length + i} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PortalSupplements() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const unreadCount = usePortalUnreadCount();
  const [mode, setMode] = useState<"protocol" | "shop">("protocol");
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [successOrderId, setSuccessOrderId] = useState<number | null>(null);

  const { data: patient, isLoading: patientLoading, error: patientError } = useQuery<PortalPatient>({
    queryKey: ["/api/portal/me"], retry: false,
  });

  const { data: protocols = [], isLoading: protocolsLoading } = useQuery<PublishedProtocol[]>({
    queryKey: ["/api/portal/protocols"], enabled: !!patient, retry: false,
  });

  const { data: orders = [], refetch: refetchOrders } = useQuery<SupplementOrder[]>({
    queryKey: ["/api/portal/supplement-orders"], enabled: !!patient, retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/portal/logout", {}),
    onSuccess: () => { queryClient.clear(); setLocation("/login?mode=patient"); },
  });

  useEffect(() => {
    if (patientError) setLocation("/login?mode=patient");
  }, [patientError, setLocation]);

  // All supplements from the latest protocol
  const latestProtocol = protocols[0];
  const allSupplements: SupplementRecommendation[] = latestProtocol?.supplements ?? [];

  function handleQtyChange(supplement: SupplementRecommendation, delta: number) {
    const priceInfo = getSupplementPrice(supplement.name);
    if (!priceInfo) return;
    setCart(prev => {
      const next = new Map(prev);
      const existing = next.get(supplement.name);
      const newQty = (existing?.quantity ?? 0) + delta;
      if (newQty <= 0) { next.delete(supplement.name); }
      else {
        next.set(supplement.name, {
          supplement, price: priceInfo.price, supplyDays: priceInfo.supplyDays, quantity: newQty,
        });
      }
      return next;
    });
  }

  function handleReorder() {
    if (!orders[0]) return;
    const items = orders[0].items as SupplementOrderItem[];
    const newCart = new Map<string, CartItem>();
    for (const item of items) {
      const supp = allSupplements.find(s => s.name === item.name);
      if (supp) {
        newCart.set(supp.name, { supplement: supp, price: item.price, supplyDays: item.supplyDays, quantity: item.quantity });
      }
    }
    setCart(newCart);
    setMode("shop");
  }

  const cartItems = Array.from(cart.values());
  const cartCount = cartItems.reduce((a, c) => a + c.quantity, 0);
  const subtotal = cartItems.reduce((a, c) => a + c.price * c.quantity, 0);
  const discountedCartTotal = subtotal * (1 - MEMBER_DISCOUNT);

  const highPriority = allSupplements.filter(s => s.priority === "high");
  const medium = allSupplements.filter(s => s.priority === "medium");
  const low = allSupplements.filter(s => s.priority === "low");

  if (patientLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f9f6f0" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "#2e3a20" }}>
            <Leaf className="w-5 h-5" style={{ color: "#e8ddd0" }} />
          </div>
          <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your protocol…</p>
        </div>
      </div>
    );
  }
  if (!patient) return null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f6f0" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link href="/portal/dashboard">
            <button className="flex items-center gap-1.5 text-sm" style={{ color: "#7a8a64" }} data-testid="button-portal-back">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          </Link>
          <img src="/realign-health-logo.png" alt="ReAlign Health" className="h-8 w-auto flex-shrink-0 absolute left-1/2 -translate-x-1/2" style={{ mixBlendMode: "multiply" }} />
          <Button
            variant="ghost" size="sm"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            data-testid="button-portal-logout-supps"
            className="text-xs gap-1.5" style={{ color: "#7a8a64" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6 pb-40">
        {/* Page title */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" style={{ color: "#2e3a20" }} />
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#1c2414" }}>Supplement Protocols</h1>
          </div>
          <p className="text-sm" style={{ color: "#7a8a64" }}>
            Review your personalized protocol and order supplements directly from your care team.
          </p>
          {/* Member discount notice */}
          <div className="flex items-center gap-2 mt-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: "#edf2e6", border: "1px solid #c8dbb8" }}>
            <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#3a6e3a" }} />
            <p className="text-xs font-medium" style={{ color: "#2e4a2e" }}>
              As a member, you receive <span className="font-bold">20% off</span> all Metagenics supplement orders.
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        {protocols.length > 0 && (
          <div className="flex rounded-xl p-1 gap-1" style={{ backgroundColor: "#f0ebe2" }}>
            <button
              onClick={() => setMode("protocol")}
              data-testid="button-mode-protocol"
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: mode === "protocol" ? "#ffffff" : "transparent",
                color: mode === "protocol" ? "#1c2414" : "#7a8a64",
                boxShadow: mode === "protocol" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              Protocol
            </button>
            <button
              onClick={() => setMode("shop")}
              data-testid="button-mode-shop"
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              style={{
                backgroundColor: mode === "shop" ? "#ffffff" : "transparent",
                color: mode === "shop" ? "#1c2414" : "#7a8a64",
                boxShadow: mode === "shop" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Order Supplements
              {cartCount > 0 && (
                <span className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1" style={{ backgroundColor: "#2e3a20" }}>
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Reorder banner (shop mode) */}
        {mode === "shop" && (
          <ReorderBanner orders={orders} onReorder={handleReorder} />
        )}

        {/* Content */}
        {protocolsLoading ? (
          <div className="rounded-xl p-10 text-center" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <p className="text-sm" style={{ color: "#7a8a64" }}>Loading your protocols…</p>
          </div>
        ) : protocols.length === 0 ? (
          <div className="rounded-xl p-10 text-center space-y-3" style={{ backgroundColor: "#ffffff", border: "1px solid #ede8df" }}>
            <Sparkles className="w-8 h-8 mx-auto" style={{ color: "#c4b9a5" }} />
            <p className="text-sm font-medium" style={{ color: "#1c2414" }}>No protocols published yet</p>
            <p className="text-sm leading-relaxed" style={{ color: "#7a8a64" }}>
              Your care team will publish your personalized supplement protocol here after reviewing your lab results.
            </p>
          </div>
        ) : mode === "protocol" ? (
          <div className="space-y-12">
            {protocols.map((protocol, i) => (
              <div key={protocol.id}>
                <ProtocolBlock protocol={protocol} isLatest={i === 0} />
                {i < protocols.length - 1 && <div className="mt-12 border-t" style={{ borderColor: "#e8ddd0" }} />}
              </div>
            ))}
          </div>
        ) : (
          // ── Shop mode ──
          <div className="space-y-6">
            {/* Intro */}
            <div className="rounded-xl px-4 py-3.5" style={{ backgroundColor: "#edf2e6", border: "1px solid #d4e0c0" }}>
              <p className="text-xs leading-relaxed" style={{ color: "#3d4a30" }}>
                <strong>How it works:</strong> Select the supplements you'd like to order and tap "Place Order." Your care team will be notified and will charge your card on file. You'll receive a message once processed.
              </p>
            </div>

            {allSupplements.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "#7a8a64" }}>No supplements in your current protocol.</p>
            ) : (
              <div className="space-y-6">
                {highPriority.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Priority</p>
                    {highPriority.map((s, i) => (
                      <ShopRow key={i} supplement={s} index={i} cartItem={cart.get(s.name)} onQtyChange={handleQtyChange} />
                    ))}
                  </div>
                )}
                {medium.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Recommended</p>
                    {medium.map((s, i) => (
                      <ShopRow key={i} supplement={s} index={highPriority.length + i} cartItem={cart.get(s.name)} onQtyChange={handleQtyChange} />
                    ))}
                  </div>
                )}
                {low.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#a0a880" }}>Optional</p>
                    {low.map((s, i) => (
                      <ShopRow key={i} supplement={s} index={highPriority.length + medium.length + i} cartItem={cart.get(s.name)} onQtyChange={handleQtyChange} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Past orders */}
            <PastOrders orders={orders} />
          </div>
        )}

        <div className="pb-6 text-center">
          <p className="text-xs" style={{ color: "#b0b8a0" }}>
            These recommendations are personalized to your lab results.
            <br />Always consult your care team before making changes.
          </p>
        </div>
      </main>

      {/* Floating cart bar */}
      {mode === "shop" && cartCount > 0 && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setShowOrderModal(true)}
              data-testid="button-open-cart"
              className="w-full rounded-xl py-4 px-5 flex items-center justify-between shadow-lg"
              style={{ backgroundColor: "#2e3a20", color: "#ffffff" }}
            >
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#4a5e32", color: "#ffffff" }}>
                  {cartCount}
                </span>
                <span className="text-sm font-semibold">Review Order</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold">{formatPrice(discountedCartTotal)}</span>
                <p className="text-xs opacity-75 line-through leading-none">{formatPrice(subtotal)}</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 border-t z-40" style={{ backgroundColor: "#f9f6f0", borderColor: "#e8ddd0" }}>
        <div className="max-w-3xl mx-auto px-4 flex">
          <Link href="/portal/dashboard" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-home">
              <CalendarDays className="w-4 h-4" style={{ color: "#a0a880" }} />
              <span className="text-xs" style={{ color: "#a0a880" }}>Overview</span>
            </button>
          </Link>
          <Link href="/portal/supplements" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-supplements">
              <Package className="w-4 h-4" style={{ color: "#2e3a20" }} />
              <span className="text-xs font-semibold" style={{ color: "#2e3a20" }}>Protocol</span>
            </button>
          </Link>
          <Link href="/portal/messages" className="flex-1">
            <button className="w-full py-3.5 flex flex-col items-center gap-1" data-testid="nav-portal-messages">
              <span className="relative">
                <MessageSquare className="w-4 h-4" style={{ color: "#a0a880" }} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold leading-none text-white" style={{ backgroundColor: "#c0392b" }} data-testid="badge-messages-unread">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="text-xs" style={{ color: "#a0a880" }}>Messages</span>
            </button>
          </Link>
        </div>
      </nav>

      {/* Modals */}
      {showOrderModal && (
        <OrderModal
          cart={cartItems}
          subtotal={subtotal}
          onClose={() => setShowOrderModal(false)}
          onSuccess={(id) => {
            setShowOrderModal(false);
            setSuccessOrderId(id);
            setCart(new Map());
            refetchOrders();
          }}
        />
      )}
      {successOrderId !== null && (
        <OrderSuccessModal orderId={successOrderId} onClose={() => setSuccessOrderId(null)} />
      )}
    </div>
  );
}
