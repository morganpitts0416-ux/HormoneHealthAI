import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPrescriptionSigningEnabled } from "../../server/prescription-signing-policy";

describe("Prescription signing safety", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("blocks prescription signing until explicitly approved", () => {
    vi.stubEnv("PRESCRIPTION_SIGNING_APPROVED", "");
    expect(() => assertPrescriptionSigningEnabled()).toThrow(
      "PRESCRIPTION_SIGNING_DISABLED"
    );
  });
  it("requires bucket and reviewed catalog even after approval", () => {
    vi.stubEnv("PRESCRIPTION_SIGNING_APPROVED", "true");
    vi.stubEnv("PRESCRIPTION_PDF_BUCKET", "");
    vi.stubEnv("PRESCRIPTION_NONCONTROLLED_CATALOG_PATH", "");
    expect(() => assertPrescriptionSigningEnabled()).toThrow("PRESCRIPTION_SIGNING_DISABLED");
  });
});
