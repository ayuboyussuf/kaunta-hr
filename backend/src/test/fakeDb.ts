/**
 * A small in-memory stand-in for the Supabase client.
 *
 * The rules engine decides what an employee gets paid, so it has to be provable
 * without a live database — a test you can only run against production data is
 * a test nobody runs. This implements just the slice of the query builder the
 * engine actually uses: select with eq/lte/gte/gt/lt/in filters, order, limit,
 * maybeSingle, single, and insert().select().single().
 *
 * It is deliberately strict: an operator the engine starts using that this does
 * not implement throws, rather than silently returning everything and turning a
 * broken filter into a passing test.
 */
type Row = Record<string, unknown>;
type Op = "eq" | "lte" | "gte" | "gt" | "lt" | "in" | "neq";

interface Filter {
  op: Op;
  col: string;
  val: unknown;
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  switch (f.op) {
    case "eq":
      return v === f.val;
    case "neq":
      return v !== f.val;
    case "lte":
      return (v as never) <= (f.val as never);
    case "gte":
      return (v as never) >= (f.val as never);
    case "lt":
      return (v as never) < (f.val as never);
    case "gt":
      return (v as never) > (f.val as never);
    case "in":
      return Array.isArray(f.val) && (f.val as unknown[]).includes(v);
    default:
      throw new Error(`fakeDb: unsupported operator ${(f as Filter).op}`);
  }
}

export interface FakeDb {
  /** The tables, live — assert against these after the code under test runs. */
  tables: Record<string, Row[]>;
  /** Every insert, in order, as { table, row }. */
  inserts: { table: string; row: Row }[];
  from(table: string): Builder;
}

class Builder implements PromiseLike<{ data: Row[] | null; error: null }> {
  private filters: Filter[] = [];
  private limitN: number | null = null;
  private sortCol: string | null = null;
  private sortAsc = true;
  private pending: Row | null = null;
  private wantCount = false;

  constructor(
    private db: FakeDb,
    private table: string
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.wantCount = Boolean(opts?.count);
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ op: "neq", col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ op: "lte", col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ op: "gte", col, val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ op: "lt", col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ op: "gt", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ op: "in", col, val });
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.sortCol = col;
    this.sortAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  insert(row: Row) {
    const withId = { id: `gen-${this.db.inserts.length + 1}`, ...row };
    (this.db.tables[this.table] ??= []).push(withId);
    this.db.inserts.push({ table: this.table, row: withId });
    this.pending = withId;
    return this;
  }

  /**
   * Real upsert semantics matter here: the assist re-runs, and a second brief
   * must replace the first rather than stack a duplicate the owner then sees
   * twice.
   */
  upsert(row: Row, opts?: { onConflict?: string }) {
    const key = opts?.onConflict;
    const table = (this.db.tables[this.table] ??= []);
    const existing = key ? table.find((r) => r[key] === row[key]) : undefined;
    if (existing) {
      Object.assign(existing, row);
      this.pending = existing;
      return this;
    }
    return this.insert(row);
  }

  update(patch: Row) {
    for (const r of this.rows()) Object.assign(r, patch);
    this.pending = null;
    return this;
  }

  private rows(): Row[] {
    if (this.pending) return [this.pending];
    let out = (this.db.tables[this.table] ?? []).filter((r) =>
      this.filters.every((f) => matches(r, f))
    );
    if (this.sortCol) {
      const c = this.sortCol;
      out = [...out].sort((a, b) => {
        const av = a[c] as never;
        const bv = b[c] as never;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (this.sortAsc ? 1 : -1);
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  async maybeSingle() {
    const rows = this.rows();
    if (rows.length > 1) {
      return { data: null, error: { message: "more than one row returned" } };
    }
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    const rows = this.rows();
    if (rows.length !== 1) {
      return { data: null, error: { message: `expected 1 row, got ${rows.length}` } };
    }
    return { data: rows[0], error: null };
  }

  then<A, B = never>(
    onOk?: ((v: { data: Row[] | null; error: null; count?: number }) => A | PromiseLike<A>) | null,
    onErr?: ((e: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    const rows = this.rows();
    return Promise.resolve({
      data: rows,
      error: null,
      ...(this.wantCount ? { count: rows.length } : {}),
    }).then(onOk, onErr);
  }
}

export function fakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables: { ...tables },
    inserts: [],
    from(table: string) {
      return new Builder(db, table);
    },
  };
  return db;
}

/**
 * Capture outbound SMS instead of sending it. Returns the collected bodies.
 *
 * The provider credential is stubbed too: without it the SMS layer fails before
 * it ever reaches fetch, and then retries with backoff — which would make the
 * suite slow and would test the retry loop instead of the engine.
 */
let smsSink: string[] | null = null;

export function captureSms(): string[] {
  // One sink, however many suites ask for it. Patching fetch a second time
  // would silently orphan the first suite's array, and its assertions would
  // pass or fail depending on import order.
  if (smsSink) return smsSink;

  process.env.AT_API_KEY ||= "test-key-not-used";
  const sent: string[] = [];
  smsSink = sent;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    sent.push(String(init?.body ?? url));
    return {
      ok: true,
      status: 200,
      json: async () => ({ SMSMessageData: { Recipients: [{ status: "Success" }] } }),
      text: async () => "{}",
    } as never;
  }) as typeof fetch;
  return sent;
}
