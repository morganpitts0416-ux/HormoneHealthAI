/**
 * clinic-plan.ts — Provider seat logic for Solo and ClinIQ Suite plans.
 *
 * Plan rules:
 *   Solo  — max_providers = 1, base_provider_limit = 1, extra_provider_seats = 0
 *   Suite — base_provider_limit = 2 (included), extra seats billed at $79/mo each
 *           max_providers = base_provider_limit + extra_provider_seats
 *
 * Stripe prices (from env):
 *   STRIPE_SUITE_PRICE_ID         — Suite base plan ($249/mo)
 *   STRIPE_PROVIDER_SEAT_PRICE_ID — Extra provider seat ($79/mo, quantity-based)
 *
 * All helpers are null-safe. Internal/free accounts skip billing checks.
 */

import { db } from "./storage";
import * as schema from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const SUITE_BASE_PROVIDER_LIMIT = 2;
export const EXTRA_SEAT_MONTHLY_PRICE = 79;

export interface ClinicPlanState {
  clinicId: number;
  subscriptionPlan: string | null;
  maxProviders: number;
  baseProviderLimit: number;
  extraProviderSeats: number;
  activeProviderCount: number;
  canAddProviderWithoutBilling: boolean;
  nextProviderRequiresPaidSeat: boolean;
  isSoloPlan: boolean;
  isSuitePlan: boolean;
  isFreeAccount: boolean;
}

/** Count only active (non-deleted) providers for a clinic. */
export async function getActiveProviderCount(clinicId: number): Promise<number> {
  const rows = await db
    .select({ id: schema.providers.id })
    .from(schema.providers)
    .where(
      and(
        eq(schema.providers.clinicId, clinicId),
        eq(schema.providers.isActive, true)
      )
    );
  return rows.length;
}

/** Return false if no Suite subscription is linked (Stripe not attached). */
function hasLinkedStripe(ownerStripeSubId: string | null | undefined): boolean {
  return !!ownerStripeSubId;
}

/**
 * For Suite billing: extra_provider_seats = max(0, active_count - base_provider_limit).
 * This is the current quantity that should be on the Stripe extra-seat item.
 */
export function calculateRequiredSeatQuantity(activeProviderCount: number): number {
  return Math.max(0, activeProviderCount - SUITE_BASE_PROVIDER_LIMIT);
}

/**
 * Full plan-state snapshot for a clinic. Pass ownerFreeAccount so internal
 * accounts bypass billing checks without DB queries.
 */
export async function getClinicPlanState(
  clinicId: number,
  ownerFreeAccount: boolean = false,
  ownerStripeSubId?: string | null
): Promise<ClinicPlanState> {
  const [clinic] = await db
    .select()
    .from(schema.clinics)
    .where(eq(schema.clinics.id, clinicId));

  if (!clinic) {
    throw new Error(`Clinic ${clinicId} not found`);
  }

  const activeProviderCount = await getActiveProviderCount(clinicId);
  const maxProviders = clinic.maxProviders ?? 1;
  const baseProviderLimit = clinic.baseProviderLimit ?? 1;
  const extraProviderSeats = clinic.extraProviderSeats ?? 0;
  const plan = clinic.subscriptionPlan ?? "solo";
  const isSoloPlan = plan === "solo" || plan === null;
  const isSuitePlan = plan === "suite";
  const isFreeAccount = ownerFreeAccount;

  const canAdd = activeProviderCount < maxProviders;
  // Next add requires a paid seat if: Suite plan, within max but would exceed base limit,
  // OR if active_count >= max_providers and plan is Suite.
  const nextRequiresPaid =
    !isFreeAccount &&
    isSuitePlan &&
    activeProviderCount >= maxProviders;

  return {
    clinicId,
    subscriptionPlan: plan,
    maxProviders,
    baseProviderLimit,
    extraProviderSeats,
    activeProviderCount,
    canAddProviderWithoutBilling: canAdd || isFreeAccount,
    nextProviderRequiresPaidSeat: nextRequiresPaid,
    isSoloPlan,
    isSuitePlan,
    isFreeAccount,
  };
}
