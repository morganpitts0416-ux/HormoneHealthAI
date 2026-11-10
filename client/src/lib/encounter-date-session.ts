import { apiRequest, queryClient } from "./queryClient";

/** Per-editor baseline. Never refresh it from a later GET while edits are open:
 * doing so would let a stale tab silently overwrite another clinician's date.
 */
export class EncounterDateSession {
  private baseline: string | Date | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(initial?: string | Date) { this.baseline = initial; }
  remember(encounter: { visitDate: string | Date }) { this.baseline = encounter.visitDate; }
  get expectedVisitDate() { return this.baseline; }
  async beforeAction<T>(id: number, metadata: Record<string, unknown>, action: (expectedDate: string | Date | undefined) => Promise<T>): Promise<T> {
    const encounter = await this.save(id, metadata);
    return action(encounter.visitDate);
  }

  save(id: number, metadata: Record<string, unknown>) {
    const work = this.queue.then(async () => {
      const res = await apiRequest("PUT", `/api/encounters/${id}`, {
        ...metadata, expectedVisitDate: this.baseline,
      });
      const encounter = await res.json();
      this.remember(encounter);
      // Prefix invalidation covers both standard and "all" vital queries.
      queryClient.invalidateQueries({ queryKey: ["/api/patients", encounter.patientId, "vitals"] });
      return encounter;
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
}
