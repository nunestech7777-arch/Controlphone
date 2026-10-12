// Sonda de acesso ao banco com as contas da loja teste (não imprime chaves)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
export const login = async (email, password) => {
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(email + ': ' + error.message);
  const { data: me } = await c.from('profiles').select('id, role, tenant_id, full_name').eq('id', data.user.id).single();
  return { c, me };
};
