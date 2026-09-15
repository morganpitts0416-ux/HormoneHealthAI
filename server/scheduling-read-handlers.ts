import type { Request, RequestHandler, Response } from "express";
import type * as schema from "@shared/schema";

export interface SchedulingReadStorage {
  getAppointmentTypes(clinicId: number, includeInactive?: boolean): Promise<schema.AppointmentType[]>;
  getProviderByIdInClinic(id: number, clinicId: number): Promise<schema.Provider | null>;
  getAppointmentTypeById(id: number, clinicId: number): Promise<schema.AppointmentType | null>;
  getProviderAvailability(clinicId: number, providerId?: number | null): Promise<schema.ProviderAvailability[]>;
  getCalendarBlocks(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.CalendarBlock[]>;
  getAppointmentsByClinicAndRange(clinicId: number, start: Date, end: Date, providerId?: number | null): Promise<schema.Appointment[]>;
}

export interface SchedulingReadHandlerDependencies {
  storage: SchedulingReadStorage;
  getClinicId: (req: Request) => number | null;
}

/**
 * Factory for the authenticated appointment-type read. The caller owns
 * authentication and ordinary-clinic middleware; this factory only preserves
 * the existing handler's clinic-scoped response behavior.
 */
export function createAppointmentTypesReadHandler({
  storage,
  getClinicId,
}: SchedulingReadHandlerDependencies): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const clinicId = getClinicId(req);
      if (!clinicId) return res.json([]);
      const includeInactive = req.query.includeInactive === "true";
      const types = await storage.getAppointmentTypes(clinicId, includeInactive);
      res.json(types);
    } catch (err) {
      console.error("[Scheduling] appointment-types GET error:", err);
      res.status(500).json({ message: "Failed to load appointment types" });
    }
  };
}

/**
 * Factory for the authenticated slot read. Provider and appointment-type IDs
 * are selectors inside the server-derived clinic, never tenant selectors.
 */
export function createAvailabilitySlotsReadHandler({
  storage,
  getClinicId,
}: SchedulingReadHandlerDependencies): RequestHandler {
  return async (req: Request, res: Response) => {
    try {
      const clinicId = getClinicId(req);
      if (!clinicId) return res.json([]);
      const providerId = Number(req.query.providerId);
      const typeId = req.query.typeId ? Number(req.query.typeId) : null;
      const dateStr = String(req.query.date || "");
      if (!providerId || !dateStr) return res.status(400).json({ message: "providerId and date required" });

      // Resolve both browser-supplied IDs against the server clinic before
      // touching any schedule tables. A mismatch keeps the array response
      // format and prevents cross-clinic schedule reads.
      const [provider, selectedType] = await Promise.all([
        storage.getProviderByIdInClinic(providerId, clinicId),
        typeId ? storage.getAppointmentTypeById(typeId, clinicId) : Promise.resolve(null),
      ]);
      if (!provider || (typeId && !selectedType)) return res.json([]);

      const date = new Date(dateStr + "T00:00:00");
      if (isNaN(date.getTime())) return res.status(400).json({ message: "Invalid date" });
      const dayOfWeek = date.getDay();

      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);

      const [availability, blocks, dayAppts] = await Promise.all([
        storage.getProviderAvailability(clinicId, providerId),
        storage.getCalendarBlocks(clinicId, dayStart, dayEnd, providerId),
        storage.getAppointmentsByClinicAndRange(clinicId, dayStart, dayEnd, providerId),
      ]);

      const duration = selectedType?.durationMinutes ?? 30;
      const slots: { start: string; end: string }[] = [];
      const todaysWindows = availability.filter(a => a.dayOfWeek === dayOfWeek);

      for (const win of todaysWindows) {
        const [sH, sM] = String(win.startTime).split(":").map(Number);
        const [eH, eM] = String(win.endTime).split(":").map(Number);
        const winStart = new Date(date); winStart.setHours(sH, sM, 0, 0);
        const winEnd = new Date(date); winEnd.setHours(eH, eM, 0, 0);
        let cursor = new Date(winStart);
        while (cursor.getTime() + duration * 60000 <= winEnd.getTime()) {
          const slotEnd = new Date(cursor.getTime() + duration * 60000);
          const conflicts = dayAppts.some(a => {
            const aStart = new Date(a.appointmentStart);
            const aEnd = a.appointmentEnd
              ? new Date(a.appointmentEnd)
              : new Date(aStart.getTime() + (a.durationMinutes ?? 30) * 60000);
            return aStart < slotEnd && aEnd > cursor && a.status !== "cancelled" && a.status !== "no_show";
          });
          const blocked = blocks.some(b => new Date(b.startAt) < slotEnd && new Date(b.endAt) > cursor);
          if (!conflicts && !blocked) {
            slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
          }
          cursor = new Date(cursor.getTime() + duration * 60000);
        }
      }
      res.json(slots);
    } catch (err) {
      console.error("[Scheduling] slots error:", err);
      res.status(500).json({ message: "Failed to compute slots" });
    }
  };
}