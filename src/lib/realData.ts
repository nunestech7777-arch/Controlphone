// ============================================================================
// CONTROLPHONE — DADOS DA LOJA NO BANCO (MODO REAL)
// Cadastros (clientes, fornecedores, aparelhos, acessórios, brindes e histórico
// de compras) têm tabela própria. Os módulos operacionais (vendas, upgrades,
// garantias, trocas, crédito, assistência, despesas, metas, movimentações e
// histórico de atividades) são documentos na tabela tenant_records.
//
// Fluxo de cada sincronização:
//   1. cadastros antigos (anteriores à ligação com o banco) ganham identificador novo;
//   2. o que está na fila de envio sobe para o servidor;
//   3. cadastros: a lista do servidor passa a ser a lista da tela;
//      documentos: chega só o que mudou desde a última busca (lista completa na
//      primeira vez e sempre que a contagem local não bater com a do banco).
// ============================================================================

import { supabase } from './supabase';
import { store, DocKind, SyncKind, TableKind, isDocKind } from './store';
import { RECORDS_TABLE, SYNC_TABLES } from './realSync';
import { AuditLog, SupportSession, UserRole } from '../types';

type Row = { id: string; tenant_id: string };

// O servidor devolve no máximo 1000 linhas por consulta: tudo é lido em páginas
const PAGE = 1000;
// A busca do que mudou volta um pouco no tempo, para não perder linha gravada no mesmo instante da busca anterior
const OVERLAP_MS = 2 * 60 * 1000;

// O banco devolve null nos campos vazios; o sistema trabalha com campo ausente
function clean(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.keys(row).forEach(key => {
    if (row[key] !== null && key !== 'updated_at') out[key] = row[key];
  });
  return out as Row;
}

// O que cada perfil lê (espelha as regras de acesso do banco).
// Fornecedores e histórico de compras expõem custos: só o administrador.
const readableTables = (role: UserRole): TableKind[] =>
  role === 'admin' || role === 'super_admin'
    ? ['customers', 'suppliers', 'devices', 'accessories', 'gifts', 'supplierPurchases']
    : ['customers', 'devices', 'accessories', 'gifts'];

// Vendedor não lê despesas nem histórico de atividades; técnico lê só o que é da bancada.
const readableDocs = (role: UserRole): DocKind[] => {
  if (role === 'admin' || role === 'super_admin') {
    return ['documentTexts', 'customerCredits', 'warranties', 'tradeIns', 'sales', 'returnRequests', 'serviceOrders',
      'internalRepairs', 'expenses', 'goals', 'deviceMovements', 'auditLogs'];
  }
  if (role === 'seller') {
    return ['documentTexts', 'customerCredits', 'warranties', 'tradeIns', 'sales', 'returnRequests', 'serviceOrders',
      'internalRepairs', 'goals', 'deviceMovements'];
  }
  return ['warranties', 'serviceOrders', 'internalRepairs', 'deviceMovements'];
};

/** Lista completa de um cadastro, página a página. Devolve null se o servidor não respondeu. */
async function fetchTable(kind: TableKind, tenantId: string): Promise<Row[] | null> {
  const rows: Row[] = [];
  let after: string | undefined;
  for (;;) {
    let query = supabase.from(SYNC_TABLES[kind].table).select('*').eq('tenant_id', tenantId)
      .order('id', { ascending: true }).limit(PAGE);
    if (after) query = query.gt('id', after);
    const { data, error } = await query;
    if (error) {
      console.error(`Falha ao carregar ${kind}:`, error.message);
      return null;
    }
    (data || []).forEach(row => rows.push(clean(row as Record<string, unknown>)));
    if (!data || data.length < PAGE) return rows;
    after = String((data[data.length - 1] as { id: string }).id);
  }
}

/**
 * Documentos de um tipo gravados a partir de `since` (todos, quando não informado), do mais antigo
 * para o mais novo. `last` é a data da última linha lida: vira o ponto de partida da próxima busca.
 */
async function fetchDocs(kind: DocKind, tenantId: string, since?: string): Promise<{ rows: Row[]; last?: string } | null> {
  const byId = new Map<string, Row>();
  let from = since;
  let last: string | undefined;
  for (;;) {
    let query = supabase.from(RECORDS_TABLE).select('id, data, updated_at').eq('tenant_id', tenantId).eq('kind', kind)
      .order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE);
    if (from) query = query.gte('updated_at', from);
    const { data, error } = await query;
    if (error) {
      console.error(`Falha ao carregar ${kind}:`, error.message);
      return null;
    }
    const page = (data || []) as { id: string; data: Record<string, unknown>; updated_at: string }[];
    page.forEach(row => byId.set(row.id, { ...row.data, id: row.id, tenant_id: tenantId } as Row));
    if (page.length > 0) last = page[page.length - 1].updated_at;
    if (page.length < PAGE) break;
    if (last === from) {
      // mais de uma página gravada no mesmo instante: não há como avançar sem repetir
      console.error(`Falha ao carregar ${kind}: página sem avanço.`);
      return null;
    }
    from = last; // a página seguinte recomeça na última data lida (linhas repetidas são sobrepostas)
  }
  return { rows: [...byId.values()], last };
}

async function countDocs(kind: DocKind, tenantId: string): Promise<number | null> {
  const { count, error } = await supabase.from(RECORDS_TABLE)
    .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('kind', kind);
  return error ? null : count;
}

let running: Promise<boolean> | null = null;
let again: { tenantId: string; role: UserRole; only?: Set<SyncKind> } | null = null;
let lastSyncAt = 0;
// Cópia local já conferida com o banco nesta sessão ("sessão:loja")
let checkedSession = '';

async function runSync(tenantId: string, role: UserRole, only?: SyncKind[]): Promise<boolean> {
  store.syncRole = role;
  store.syncUserId = (await supabase.auth.getSession()).data.session?.user.id || null;
  store.adoptLegacyRecords(tenantId, role);
  const pushed = await store.pushUnsynced();

  // Primeira sincronização depois de abrir o sistema: busca tudo e confere a cópia local com o banco
  const session = `${store.sessionSeq}:${tenantId}:${role}`;
  const firstOfSession = checkedSession !== session;
  const wanted = (kind: SyncKind) => firstOfSession || !only || only.includes(kind);
  const tables = readableTables(role).filter(wanted);
  const docs = readableDocs(role).filter(wanted);

  const full = new Set<DocKind>(docs.filter(kind => !store.getSyncCursor(tenantId, kind)));
  if (firstOfSession) {
    const counts = await Promise.all(docs.map(kind => (full.has(kind) ? null : countDocs(kind, tenantId))));
    docs.forEach((kind, i) => {
      if (counts[i] !== null && counts[i] !== store.countConfirmed(tenantId, kind)) full.add(kind);
    });
  }
  const since = (kind: DocKind) => {
    const cursor = store.getSyncCursor(tenantId, kind);
    return full.has(kind) || !cursor ? undefined : new Date(Date.parse(cursor) - OVERLAP_MS).toISOString();
  };

  const startedAt = Date.now();
  const [tableRows, docRows] = await Promise.all([
    Promise.all(tables.map(kind => fetchTable(kind, tenantId))),
    Promise.all(docs.map(kind => fetchDocs(kind, tenantId, since(kind)))),
    store.refillNumbers(tenantId)
  ]);
  if (tableRows.some(r => r === null) || docRows.some(r => r === null)) return false;

  const remote: Partial<Record<SyncKind, Row[]>> = {};
  const cursors: Partial<Record<DocKind, string>> = {};
  tables.forEach((kind, i) => { remote[kind] = tableRows[i] as Row[]; });
  docs.forEach((kind, i) => {
    const result = docRows[i] as { rows: Row[]; last?: string };
    remote[kind] = result.rows;
    if (result.last) cursors[kind] = result.last;
  });
  store.applyRemoteRecords(tenantId, remote, { partial: docs.filter(kind => !full.has(kind)), cursors, startedAt });
  checkedSession = session;
  lastSyncAt = Date.now();
  return pushed;
}

/**
 * Sincroniza os dados da loja. `only` limita a busca aos tipos que mudaram (aviso de tempo real).
 * Devolve false quando algo não pôde ser enviado ou lido.
 */
export function syncTenantRecords(tenantId: string, role: UserRole, only?: SyncKind[]): Promise<boolean> {
  if (!store.isRealMode || !tenantId) return Promise.resolve(true);
  if (running) {
    // já há uma sincronização em andamento: o pedido roda logo em seguida, para não perder o que chegou no meio
    const merged = !again
      ? (only ? new Set(only) : undefined)
      : (again.only && only ? new Set([...again.only, ...only]) : undefined);
    again = { tenantId, role, only: merged };
    return running;
  }

  running = runSync(tenantId, role, only)
    .catch(err => {
      console.error('Falha ao sincronizar os dados da loja:', err);
      return false;
    })
    .finally(() => {
      running = null;
      if (again) {
        const next = again;
        again = null;
        void syncTenantRecords(next.tenantId, next.role, next.only ? [...next.only] : undefined);
      }
    });
  return running;
}

/** Ao voltar para a aba do sistema, busca o que mudou nos outros aparelhos (no máximo a cada 20 s). */
export function syncOnFocus(tenantId: string, role: UserRole) {
  if (Date.now() - lastSyncAt < 20_000) return;
  void syncTenantRecords(tenantId, role);
}

/**
 * Tempo real: quando outro aparelho da loja altera estoque, clientes, vendas ou assistência, este
 * busca só o que mudou. Devolve a função que encerra a escuta.
 */
export function watchTenantRecords(tenantId: string, role: UserRole): () => void {
  if (!store.isRealMode || !tenantId) return () => undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const changed = new Set<SyncKind>();
  const refresh = (kind: SyncKind) => {
    changed.add(kind);
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const only = [...changed];
      changed.clear();
      void syncTenantRecords(tenantId, role, only);
    }, 1500);
  };
  const channel = supabase.channel(`loja-${tenantId}`);
  (['devices', 'accessories', 'gifts', 'customers'] as const).forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `tenant_id=eq.${tenantId}` }, () => refresh(table));
  });
  // Exclusão de aparelho: o banco não filtra exclusões por loja (o aviso traz só o id), então
  // qualquer exclusão em devices só dispara a releitura do estoque desta loja
  channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'devices' }, () => refresh('devices'));
  // o servidor só avisa dos tipos de documento que este perfil pode ler
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: RECORDS_TABLE, filter: `tenant_id=eq.${tenantId}` },
    (payload: { new?: Record<string, unknown> }) => {
      const kind = String(payload.new?.kind || '') as SyncKind;
      if (isDocKind(kind)) refresh(kind);
    }
  );
  channel.subscribe();
  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// PAINEL DA PLATAFORMA (Super Admin fora do modo suporte)
// Sessões de suporte, ações sem loja e ações do Super Admin dentro das lojas.
// ---------------------------------------------------------------------------

/** Lê uma tabela inteira em páginas, pela ordem do id. Devolve null se o servidor não respondeu. */
async function fetchPages<T>(
  what: string,
  page: (after?: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
  map: (row: Record<string, unknown>) => T
): Promise<T[] | null> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    const { data, error } = await page(after);
    if (error) {
      console.error(`Falha ao carregar ${what}:`, error.message);
      return null;
    }
    (data || []).forEach(row => rows.push(map(row as Record<string, unknown>)));
    if (!data || data.length < PAGE) return rows;
    after = String((data[data.length - 1] as { id: string }).id);
  }
}

let platformRunning: Promise<boolean> | null = null;
let lastPlatformSyncAt = 0;

/** Sincroniza o painel da plataforma. Devolve false quando algo não pôde ser enviado ou lido. */
export function syncPlatformRecords(): Promise<boolean> {
  if (!store.isRealMode) return Promise.resolve(true);
  if (platformRunning) return platformRunning;

  platformRunning = (async () => {
    store.syncRole = 'super_admin';
    store.syncUserId = (await supabase.auth.getSession()).data.session?.user.id || null;
    const pushed = await store.pushUnsynced();

    const [sessions, platformLogs, tenantLogs] = await Promise.all([
      fetchPages('as sessões de suporte', after => {
        const query = supabase.from('support_sessions').select('*').order('id', { ascending: true }).limit(PAGE);
        return after ? query.gt('id', after) : query;
      }, row => clean(row) as unknown as SupportSession),
      fetchPages('o histórico da plataforma', after => {
        const query = supabase.from('audit_logs').select('*').is('tenant_id', null).order('id', { ascending: true }).limit(PAGE);
        return after ? query.gt('id', after) : query;
      }, row => clean(row) as unknown as AuditLog),
      fetchPages('o histórico do suporte nas lojas', after => {
        const query = supabase.from(RECORDS_TABLE).select('id, tenant_id, data').eq('kind', 'auditLogs')
          .eq('data->>user_role', 'super_admin').order('id', { ascending: true }).limit(PAGE);
        return after ? query.gt('id', after) : query;
      }, row => ({ ...(row.data as object), id: row.id, tenant_id: row.tenant_id }) as AuditLog)
    ]);
    if (!sessions || !platformLogs || !tenantLogs) return false;
    store.applyPlatformRecords({ sessions, platformLogs, tenantLogs });
    lastPlatformSyncAt = Date.now();
    return pushed;
  })()
    .catch(err => {
      console.error('Falha ao sincronizar o painel da plataforma:', err);
      return false;
    })
    .finally(() => {
      platformRunning = null;
    });
  return platformRunning;
}

/** Ao voltar para a aba do sistema, atualiza o painel da plataforma (no máximo a cada 20 s). */
export function syncPlatformOnFocus() {
  if (Date.now() - lastPlatformSyncAt < 20_000) return;
  void syncPlatformRecords();
}
