// Imita o mínimo do Deno que as funções edge usam: variáveis de ambiente e Deno.serve
// (o handler fica guardado para o teste chamar com Request de verdade).
type Handler = (req: Request) => Promise<Response>;
export const served: { handler: Handler | null } = { handler: null };
(globalThis as any).Deno = {
  env: { get: () => '' },
  serve: (h: Handler) => { served.handler = h; }
};
