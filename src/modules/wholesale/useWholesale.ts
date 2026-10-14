// ============================================================================
// CONTROLPHONE — ATACADO: ESTADO DO MÓDULO
// Os dados só são buscados quando o módulo é aberto (e permitido). Nada é
// carregado, escutado ou guardado enquanto o módulo está desligado.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured } from '../../lib/supabase';
import { createLocalRepo, createRemoteRepo, describeError } from './data';
import { emptySnapshot } from './calc';
import { WholesaleAccess, WholesaleRepo, WholesaleSnapshot } from './types';

interface Params {
  tenantId: string;
  access: WholesaleAccess;
  userId: string;
  userName: string;
  /** Sem Supabase configurado o módulo usa o armazenamento do navegador */
  demo: boolean;
}

export function useWholesale({ tenantId, access, userId, userName, demo }: Params) {
  const repo: WholesaleRepo = useMemo(
    () => (demo || !isSupabaseConfigured
      ? createLocalRepo(tenantId, userId, userName)
      : createRemoteRepo(tenantId)),
    [tenantId, userId, userName, demo]
  );
  const [data, setData] = useState<WholesaleSnapshot>(emptySnapshot);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const snapshot = await repo.load(access);
      if (!alive.current) return;
      setData(snapshot);
      setStatus('ready');
      setError('');
    } catch (e) {
      if (!alive.current) return;
      setError(describeError(e, 'Não foi possível carregar o Atacado.'));
      setStatus('error');
    }
  }, [repo, access]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => { alive.current = false; };
  }, [reload]);

  /** Executa uma gravação e recarrega. Devolve a mensagem de erro, ou null se deu certo. */
  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    try {
      const value = await action();
      await reload();
      return { ok: true, value };
    } catch (e) {
      return { ok: false, error: describeError(e, 'Não foi possível concluir a operação.') };
    }
  }, [reload]);

  return { repo, data, status, error, reload, run };
}

export type WholesaleController = ReturnType<typeof useWholesale>;
