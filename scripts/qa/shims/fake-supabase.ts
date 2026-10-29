// Supabase falso, em memória, com só o que a função "warranty-signature" usa:
// from().select/insert/update + eq/neq/or + maybeSingle, storage e auth.getUser.
type Row = Record<string, any>;

export const fake = {
  tables: {} as Record<string, Row[]>,
  files: new Map<string, Uint8Array>(),
  users: new Map<string, string>(), // jwt -> user id
};

function orPredicate(expr: string): (r: Row) => boolean {
  // formato usado: status.eq.pending,and(status.eq.signing,updated_at.lt.ISO)
  const m = expr.match(/^status\.eq\.(\w+),and\(status\.eq\.(\w+),updated_at\.lt\.(.+)\)$/);
  if (!m) throw new Error('or() não suportado: ' + expr);
  return r => r.status === m[1] || (r.status === m[2] && r.updated_at < m[3]);
}

class Query implements PromiseLike<any> {
  private filters: ((r: Row) => boolean)[] = [];
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row = {};
  private returning = false;
  constructor(private table: string) { fake.tables[table] ||= []; }
  select() { if (this.mode !== 'select') this.returning = true; return this; }
  insert(row: Row) { this.mode = 'insert'; this.payload = row; return this; }
  update(patch: Row) { this.mode = 'update'; this.payload = patch; return this; }
  eq(col: string, v: unknown) { this.filters.push(r => r[col] === v); return this; }
  neq(col: string, v: unknown) { this.filters.push(r => r[col] !== v); return this; }
  or(expr: string) { this.filters.push(orPredicate(expr)); return this; }
  private run(): { data: any; error: any } {
    const rows = fake.tables[this.table];
    if (this.mode === 'insert') {
      const row = { id: crypto.randomUUID(), status: 'pending', updated_at: new Date().toISOString(), ...this.payload };
      if (this.table === 'warranty_signatures' && rows.some(r =>
        r.token_hash === row.token_hash || (r.tenant_id === row.tenant_id && r.sale_id === row.sale_id && r.document_id === row.document_id))) {
        return { data: null, error: { message: 'duplicate key' } };
      }
      rows.push(row);
      return { data: [row], error: null };
    }
    const hits = rows.filter(r => this.filters.every(f => f(r)));
    if (this.mode === 'update') {
      for (const r of hits) {
        if (r.status === 'signed') return { data: null, error: { message: 'Comprovante de garantia confirmado pelo cliente não pode ser alterado.' } };
        Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
      }
    }
    return { data: hits.map(r => ({ ...r })), error: null };
  }
  async maybeSingle() { const { data, error } = this.run(); return { data: data?.[0] ?? null, error }; }
  then<A, B>(ok?: ((v: any) => A | PromiseLike<A>) | null, ko?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, ko);
  }
}

const storage = (bucket: string) => ({
  async upload(path: string, data: Uint8Array) {
    const key = `${bucket}/${path}`;
    if (fake.files.has(key)) return { error: { message: 'exists' } };
    fake.files.set(key, new Uint8Array(data));
    return { error: null };
  },
  async download(path: string) {
    const f = fake.files.get(`${bucket}/${path}`);
    return f ? { data: new Blob([f]), error: null } : { data: null, error: { message: 'not found' } };
  },
  async remove(paths: string[]) { paths.forEach(p => fake.files.delete(`${bucket}/${p}`)); return { error: null }; },
  async createSignedUrl(path: string) { return { data: { signedUrl: `https://fake/${bucket}/${path}?token=x` }, error: null }; }
});

export function createClient() {
  return {
    from: (t: string) => new Query(t),
    storage: { from: storage },
    auth: {
      async getUser(jwt: string) {
        const id = fake.users.get(jwt);
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'invalid' } };
      }
    }
  };
}
