// ============================================================================
// CONTROLPHONE — CADASTRO EM LOTE DE APARELHOS (regras compartilhadas)
// Vários aparelhos do mesmo modelo de uma vez, cada um com IMEI, cor, bateria,
// custo e preço próprios. Sem grade estética. Valores sempre em reais (BRL).
// ============================================================================

import { normalizeImei, isValidImei, IMEI_HINT } from './store';

export const MAX_BATCH = 100;

export interface BatchUnit {
  /** Identificadores gerados uma vez por linha: o reenvio usa os mesmos e o banco não duplica */
  id: string;
  purchaseId: string;
  imei: string;
  color: string;
  battery: string;
  cost: string;
  price: string;
}

/** "1.865,00", "1865,00", "1865.00" ou "1865" → 1865 (valor em reais, nunca convertido) */
export const parseBRL = (v: string): number => {
  const t = (v || '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!t) return NaN;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : NaN;
};

/** Separa uma lista colada de IMEIs por quebra de linha, vírgula, ponto e vírgula ou tabulação. */
export const parseImeiList = (text: string): string[] =>
  text.split(/[\n\r,;\t]+/).map(s => s.trim()).filter(Boolean);

export const unitHasData = (u: BatchUnit, defaults: { cost: string; price: string }) =>
  Boolean(u.imei.trim() || u.color.trim() || u.battery.trim() ||
    (u.cost.trim() && u.cost !== defaults.cost) || (u.price.trim() && u.price !== defaults.price));

/**
 * Erros de cada linha (índice → mensagem). `existingImei` diz se o IMEI já existe na loja.
 * `strict` exige os campos obrigatórios (na hora de salvar); sem ele só aponta o que está errado.
 */
export function unitErrors(units: BatchUnit[], existingImei: (imei: string) => boolean, strict: boolean): Record<number, string> {
  const errors: Record<number, string> = {};
  const seen = new Map<string, number>();
  units.forEach((u, i) => {
    const imei = normalizeImei(u.imei);
    const problems: string[] = [];
    if (!u.imei.trim()) {
      if (strict) problems.push('Informe o IMEI');
    } else if (!isValidImei(u.imei) || imei.length !== u.imei.replace(/[\s.-]/g, '').length) {
      problems.push(`IMEI inválido (${IMEI_HINT.replace('O IMEI deve ter ', '').replace('.', '')})`);
    } else if (seen.has(imei)) {
      problems.push(`IMEI repetido (linha ${seen.get(imei)! + 1})`);
    } else if (existingImei(imei)) {
      problems.push('IMEI já cadastrado nesta loja');
    }
    if (imei && !seen.has(imei)) seen.set(imei, i);
    if (strict && !u.color.trim()) problems.push('Informe a cor');
    if (u.color.trim().length > 50) problems.push('Cor longa demais');
    if (u.battery.trim()) {
      const b = Number(u.battery);
      if (!Number.isInteger(b) || b < 1 || b > 100) problems.push('Bateria entre 1% e 100%');
    }
    const cost = parseBRL(u.cost), price = parseBRL(u.price);
    if (u.cost.trim() || strict) if (!(cost >= 0)) problems.push('Custo inválido');
    if (u.price.trim() || strict) if (!(price > 0)) problems.push('Preço inválido');
    if (problems.length) errors[i] = problems.join(' · ');
  });
  return errors;
}
