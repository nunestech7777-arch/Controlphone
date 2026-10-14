// Banco de teste: um Postgres embutido (PGlite) com TODAS as migrations aplicadas, sem tocar no
// Supabase de verdade. Imita o mínimo do Supabase que as migrations usam: os papéis anon /
// authenticated / service_role, auth.uid() e o esquema storage.
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';

// rodar.sh executa a partir da raiz do projeto
const MIG = path.resolve('supabase/migrations');

export async function boot(upTo = 99): Promise<any> {
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid primary key, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  const files = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (parseInt(f) > upTo) continue;
    try { await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8')); }
    catch (e) { console.log('ERRO na migration', f, '→', e.message); throw e; }
  }
  return db;
}

/** Executa como um usuário logado (papel authenticated + auth.uid()). */
export async function as(db: any, userId: string | null, fn: () => Promise<any>): Promise<any> {
  await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`); }
}
