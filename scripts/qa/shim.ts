const mem = new Map<string, string>();
export const quota = { limit: Infinity, failures: 0 };
const ls = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (v.length > quota.limit) { quota.failures++; const e: any = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    mem.set(k, v);
  },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear()
};
Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
// atob/btoa: o gerador de PDF (jsPDF) usa os do window quando ele existe
Object.defineProperty(globalThis, 'window', { value: { alert: () => {}, addEventListener: () => {}, removeEventListener: () => {}, localStorage: ls, atob: globalThis.atob, btoa: globalThis.btoa }, configurable: true });
