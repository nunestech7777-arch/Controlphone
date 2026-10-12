# Controlphone

Sistema SaaS multi-tenant para gestão de lojas de celular e assistência técnica: vendas, estoque com rastreabilidade por IMEI, upgrades, ordens de serviço e financeiro.

React 19 + TypeScript + Vite + Tailwind, com Supabase como backend.

## Rodando localmente

Requer Node 24.

```bash
npm ci
cp .env.example .env   # preencha com as chaves do seu projeto Supabase
npm run dev
```

## Variáveis de ambiente

| Variável | Onde encontrar |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → chave `anon` / `public` |

São lidas em tempo de build. Sem elas o app sobe, mas sem conexão com o Supabase.

Use somente a chave `anon`. A chave `service_role` nunca deve ir para o frontend nem para a Vercel; ela é usada apenas pela função `admin`, dentro do Supabase.

## Deploy na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe este repositório. As configurações de build já estão em `vercel.json`.
2. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Clique em **Deploy**.
4. No Supabase, em **Authentication → URL Configuration**, coloque o domínio da Vercel em **Site URL** e em **Redirect URLs**.

Cada push na branch `main` gera um novo deploy. Ao alterar uma variável de ambiente, é preciso fazer um novo deploy para ela valer.

## Banco de dados

As migrations ficam em `supabase/migrations` e a função `admin` em `supabase/functions/admin`. Elas são publicadas no Supabase, não na Vercel.
