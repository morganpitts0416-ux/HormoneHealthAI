import { describe, expect, it } from "vitest";
import {
  inventoryServerRoutes,
  parseExpressRoutes,
  renderMarkdownReport,
} from "../../scripts/team-access-route-inventory";

describe("team access route inventory parser", () => {
  it("parses multiline routes and records explicit authorization evidence", () => {
    const entries = parseExpressRoutes(
      `
        // app.get("/comment-is-not-a-route", requireAuth)
        router.get(
          "/patients/:id",
          requireAuth,
          async (req, res) => {
            const clinicId = getEffectiveClinicId(req);
            const session = req.session as any;
            if (session.staffId) return res.json({ ok: true });
            return res.json({ clinicId, defaultClinicId: req.user.defaultClinicId });
          },
        );
      `,
      "synthetic.ts",
      { mountPrefix: "/api" },
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: "GET",
      path: "/api/patients/:id",
      localPath: "/patients/:id",
      classification: "active_clinic_required",
      evidence: {
        requireAuth: true,
        getEffectiveClinicId: true,
        defaultClinicId: true,
        staffSessionFields: ["staffId"],
      },
    });
  });

  it("keeps uncertain and dynamic routes conservative", () => {
    const entries = parseExpressRoutes(`
      app.get("/mystery", async (req, res) => res.send("ok"));
      app.post(dynamicPath, customMiddleware, async (req, res) => res.end());
    `);
    expect(entries.map((entry) => entry.classification)).toEqual([
      "indeterminate_review",
      "indeterminate_review",
    ]);
    expect(entries[1].path).toBe("<dynamic>");
  });

  it("recognizes webhook and patient portal routes before generic auth classes", () => {
    const entries = parseExpressRoutes(`
      app.post("/api/integrations/spruce/webhook", (req, res) => res.sendStatus(204));
      app.get("/api/patient-portal/orders", requireAuth, (req, res) => res.json([]));
    `);
    expect(entries[0].classification).toBe("integration_webhook_system");
    expect(entries[1].classification).toBe("base_authentication_only");
  });

  it("lets explicit auth and clinic evidence override contradictory path labels", () => {
    const entries = parseExpressRoutes(`
      app.get("/api/portal/protected", requireAuth, (req, res) => {
        const clinicId = getEffectiveClinicId(req);
        return res.json({ clinicId });
      });
      app.post("/api/integrations/spruce/simulate", requireAuth, (req, res) => {
        const clinicId = getEffectiveClinicId(req);
        return res.json({ clinicId });
      });
      app.post("/api/generate-dietary-guidance", requireAuth, (req, res) => {
        const clinicId = getEffectiveClinicId(req);
        return res.json({ clinicId });
      });
    `);
    expect(entries.map((entry) => entry.classification)).toEqual([
      "active_clinic_required",
      "active_clinic_required",
      "active_clinic_required",
    ]);
    for (const entry of entries) {
      expect(["public", "patient_portal", "integration_webhook_system"]).not.toContain(
        entry.classification,
      );
    }
  });

  it("keeps identity/session routes base-auth-only", () => {
    const entries = parseExpressRoutes(`
      app.post("/api/auth/logout", (req, res) => res.json({ ok: true }));
      app.get("/api/auth/me", async (req, res) => {
        const activeClinicId = getEffectiveClinicId(req);
        return res.json({ activeClinicId });
      });
      app.get("/api/me/memberships", requireAuth, async (req, res) => {
        const clinicId = getEffectiveClinicId(req);
        return res.json({ clinicId });
      });
      app.post("/api/me/active-clinic", requireAuth, async (req, res) => {
        const activeClinicId = req.body.activeClinicId;
        return res.json({ activeClinicId });
      });
    `);
    expect(entries.map((entry) => entry.classification)).toEqual([
      "base_authentication_only",
      "base_authentication_only",
      "base_authentication_only",
      "base_authentication_only",
    ]);
  });

  it("distinguishes owner and clinic-administrator guards from authentication", () => {
    const entries = parseExpressRoutes(`
      app.patch("/api/clinic/settings", requireClinicianOnly, async (req, res) => {
        if (clinic.ownerUserId !== req.user.id) return res.sendStatus(403);
        return res.json({});
      });
      app.delete("/api/team/member/:id", requireAuth, async (req, res) => {
        const adminRole = await getSessionAdminRole(req);
        if (adminRole !== "admin") return res.sendStatus(403);
        return res.json({});
      });
      app.get("/api/profile", requireAuth, async (req, res) => res.json({}));
      app.get("/api/staff-context", requireAuth, async (req, res) => {
        return res.json({ staffId: (req.session as any).staffId });
      });
    `);
    expect(entries.map((entry) => entry.classification)).toEqual([
      "owner_required",
      "clinic_administrator_permitted",
      "base_authentication_only",
      "base_authentication_only",
    ]);
    expect(entries[3].evidence.staffSessionFields).toEqual(["staffId"]);
  });

  it("finds the complete server route set without importing or executing server code", () => {
    const entries = inventoryServerRoutes();
    expect(entries.length).toBeGreaterThan(400);
    expect(entries.some((entry) => entry.path.includes("/download"))).toBe(true);
    expect(entries.some((entry) => entry.path.includes("/jobs"))).toBe(true);
    expect(entries.some((entry) => entry.path.includes("/spruce"))).toBe(true);
    expect(entries.some((entry) => entry.path.includes("/clinical-orders"))).toBe(true);
    expect(entries.some((entry) => entry.path.includes("/form-workflows"))).toBe(true);
    expect(entries.some((entry) => entry.path.includes("/workflow-runs"))).toBe(true);
    expect(entries.some((entry) => entry.path.includes("/admin/"))).toBe(true);

    const identityPaths = new Set([
      "/api/auth/logout",
      "/api/auth/me",
      "/api/me/memberships",
      "/api/me/active-clinic",
    ]);
    for (const entry of entries) {
      const hasAuth = entry.evidence.requireAuth || entry.evidence.requireClinicianOnly;
      const hasClinic =
        entry.evidence.getEffectiveClinicId ||
        entry.evidence.activeClinicId ||
        entry.evidence.defaultClinicId;
      if (identityPaths.has(entry.path)) {
        expect(entry.classification).toBe("base_authentication_only");
      }
      if (hasAuth || hasClinic) {
        expect(["public", "patient_portal", "integration_webhook_system"]).not.toContain(
          entry.classification,
        );
      }
    }
  });

  it("renders a deterministic report without source snippets or request data", () => {
    const entries = parseExpressRoutes(
      `app.get("/api/health", (req, res) => res.json({ ok: true }));`,
      "server/synthetic.ts",
    );
    const report = renderMarkdownReport(entries);
    expect(report).toContain("| GET | /api/health | public |");
    expect(report).toContain("no patient, staff, clinician, account, or request values");
    expect(report).not.toContain("res.json({ ok: true })");
  });
});