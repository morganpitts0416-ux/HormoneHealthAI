import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const storage = fs.readFileSync(path.resolve(process.cwd(), "server/storage.ts"), "utf8");
const authz = fs.readFileSync(path.resolve(process.cwd(), "server/access-foundation.ts"), "utf8");

describe("patient resource cohort source contracts", () => {
  it("keeps the exact ten-route boundary and mounted-template matching", () => {
    expect(authz).toContain("if (seen.size !== 10)");
    expect(authz).toContain("req.route?.path");
    expect(authz).toContain("10abc");
    expect(authz).toContain("The mounted template is necessary");
  });

  it("constrains documents by document, patient, and clinic", () => {
    const method = storage.slice(storage.indexOf("async getPatientDocument"), storage.indexOf("async getPatientLabDocuments"));
    expect(method).toContain("patientDocuments.id");
    expect(method).toContain("patientDocuments.clinicId");
    expect(method).toContain("patientDocuments.patientId");
  });

  it("uses tenant-aware INSERT SELECT for clinician messages", () => {
    const method = storage.slice(storage.indexOf("async createPortalMessageInClinic"), storage.indexOf("async markPortalMessagesRead"));
    expect(method).toContain("INSERT INTO portal_messages");
    expect(method).toContain("FROM patients");
    expect(method).toContain("patients.clinic_id");
    expect(method).toContain("RETURNING *");
  });

  it("keeps active-order promotion and expansions tenant/active constrained", () => {
    const methods = storage.slice(storage.indexOf("getActiveClinicalOrders"), storage.indexOf("setOrderAssignees"));
    expect(methods).toContain("p.clinic_id");
    expect(methods).toContain("pr.clinic_id");
    expect(methods).toContain("pr.is_active = true");
    expect(methods).toContain("cm.acceptance_status = 'active'");
    expect(methods).toContain("clinicianStaff.isActive");
  });

  it("retains null-clinic encounters as inventory-only", () => {
    expect(authz).toContain("countLegacyNullClinicEncounters");
    expect(storage).toContain("isNull(schema.clinicalEncounters.clinicId)");
  });
});