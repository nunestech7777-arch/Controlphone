// Apaga do banco os documentos (tabela tenant_records) que um teste criou. Precisa estar logado como
// administrador. Só entram os documentos gravados depois de `startedAt` que citam alguma das marcas
// do teste (id do cliente, dos aparelhos ou da OS de teste, ou a etiqueta QA do teste).
// O histórico de atividades fica: o banco não deixa ninguém apagar.
import { supabase } from '../../src/lib/supabase';

export async function apagarDocumentosDoTeste(tenantId: string, startedAt: string, marks: string[]) {
  const found: { kind: string; id: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('tenant_records').select('kind, id, data')
      .eq('tenant_id', tenantId).neq('kind', 'auditLogs').gte('updated_at', startedAt)
      .order('updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    (data || []).forEach(row => {
      const text = row.id + JSON.stringify(row.data);
      if (marks.some(mark => mark && text.includes(mark))) found.push({ kind: row.kind, id: row.id });
    });
    if (!data || data.length < 1000) break;
  }
  let deleted = 0;
  for (const kind of [...new Set(found.map(f => f.kind))]) {
    const ids = found.filter(f => f.kind === kind).map(f => f.id);
    const res = await supabase.from('tenant_records').delete().eq('tenant_id', tenantId).eq('kind', kind).in('id', ids).select('id');
    if (res.error) throw new Error(res.error.message);
    deleted += res.data?.length || 0;
  }
  return { found: found.length, deleted };
}

export const avisoHistorico = (tenantId: string, startedAt: string) =>
  `O histórico de atividades não pode ser apagado pelo aplicativo. Para apagar o que este teste gerou, rode no SQL Editor:\n` +
  `  DELETE FROM tenant_records WHERE tenant_id = '${tenantId}' AND kind = 'auditLogs' AND updated_at >= '${startedAt}';`;
