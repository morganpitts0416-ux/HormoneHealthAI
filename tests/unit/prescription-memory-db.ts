import { getTableColumns, getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { vi } from "vitest";
const dialect = new PgDialect();

// Deliberately small Drizzle test double. All data is synthetic, all predicates
// are evaluated, and production database modules are never imported in tests.
export function memoryPrescriptionDb() {
  let tables: Record<string, any[]> = {};
  let queue = Promise.resolve();
  const calls: { table: string; lock?: string }[] = [];
  let failAudit = false;
  function query(mode: string, projection?: any) {
    let table: any, condition: any, values: any, lock: string | undefined;
    const builder: any = {
      from(t: any) { table = t; return builder; },
      where(c: any) { condition = c; return builder; },
      limit() { return builder; }, orderBy() { return builder; },
      for(type: string) { lock = type; return builder; },
      set(v: any) { values = v; return builder; },
      values(v: any) { values = v; return builder; },
      returning(p?: any) { projection = p; return builder; },
      then(resolve: any, reject: any) {
        try {
          const name = getTableName(table);
          calls.push({ table: name, lock });
          const columns: any = getTableColumns(table);
          const property = (colName: string) => Object.keys(columns).find(key => columns[key].name === colName)!;
          const { sql, params } = condition ? dialect.sqlToQuery(condition) : { sql: "", params: [] };
          const checks = [...sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)];
          const matches = (row: any) => checks.every((check: any) => row[property(check[1])] === params[Number(check[2]) - 1]);
          let result: any[];
          if (mode === "select") result = (tables[name] ?? []).filter(matches);
          else if (mode === "update") {
            result = (tables[name] ?? []).filter(matches);
            result.forEach(row => Object.assign(row, values));
          } else {
            if (failAudit && name === "prescription_audit_events") throw new Error("Synthetic audit failure");
            result = (Array.isArray(values) ? values : [values]).map(value => ({
              id: (tables[name]?.length ?? 0) + 100, ...value,
            }));
            (tables[name] ??= []).push(...result);
          }
          if (projection) result = result.map(row => Object.fromEntries(
            Object.entries(projection).map(([key, col]: [string, any]) => [key, row[property(col.name)]])
          ));
          return Promise.resolve(result).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    if (mode !== "select") builder.from(projection);
    return builder;
  }
  const db: any = {
    select: (projection: any) => query("select", projection),
    insert: (table: any) => query("insert", table),
    update: (table: any) => query("update", table),
    execute: vi.fn(async () => []),
    transaction: async (work: any) => {
      let unlock!: () => void;
      const before = queue; queue = new Promise<void>(resolve => { unlock = resolve; });
      await before;
      const snapshot = structuredClone(tables);
      try { return await work(db); }
      catch (error) { tables = snapshot; throw error; }
      finally { unlock(); }
    },
  };
  return {
    db, calls, get tables() { return tables; },
    reset(data: Record<string, any[]>) { tables = structuredClone(data); calls.length = 0; failAudit = false; },
    failAudit(value: boolean) { failAudit = value; },
  };
}
