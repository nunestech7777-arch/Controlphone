// ============================================================================
// CONTROLPHONE — DIMENSIONAMENTO PROPORCIONAL DE LOGOTIPO EM PDF
// Calcula largura e altura preservando a proporção original da imagem
// (equivalente a object-fit: contain), sem distorções, esticamento ou cortes.
// ============================================================================

import { jsPDF } from 'jspdf';

export interface DrawLogoOptions {
  /** Posição horizontal em mm (padrão: 14) */
  x?: number;
  /** Posição vertical inicial em mm (padrão: 10) */
  y?: number;
  /** Largura máxima permitida em mm (padrão: 48mm ~ 180px) */
  maxWidth?: number;
  /** Altura máxima permitida em mm (padrão: 24mm ~ 90px) */
  maxHeight?: number;
  /** Espaçamento em mm entre a logo e o texto seguinte (padrão: 6mm) */
  spacingAfter?: number;
  /** Coordenada Y padrão caso não haja logo cadastrada ou ocorra erro */
  defaultY?: number;
}

export interface DrawLogoResult {
  rendered: boolean;
  nextY: number;
  width: number;
  height: number;
}

/**
 * Desenha o logotipo da loja preservando estritamente sua proporção original.
 * Suporta formatos horizontais, verticais, quadrados e retangulares.
 * Retorna a coordenada `nextY` para o posicionamento fluido dos elementos abaixo.
 */
export function drawProportionalLogo(
  doc: jsPDF,
  logoUrl?: string,
  options?: DrawLogoOptions
): DrawLogoResult {
  const x = options?.x ?? 14;
  const y = options?.y ?? 10;
  const maxWidth = options?.maxWidth ?? 48;
  const maxHeight = options?.maxHeight ?? 24;
  const spacingAfter = options?.spacingAfter ?? 6;
  const defaultY = options?.defaultY ?? 18;

  if (!logoUrl || typeof logoUrl !== 'string' || !logoUrl.startsWith('data:image')) {
    return { rendered: false, nextY: defaultY, width: 0, height: 0 };
  }

  try {
    const props = doc.getImageProperties(logoUrl);
    const origW = props?.width || 0;
    const origH = props?.height || 0;

    if (origW <= 0 || origH <= 0) {
      return { rendered: false, nextY: defaultY, width: 0, height: 0 };
    }

    // Calcula escala mantendo proporção original (object-fit: contain)
    const scale = Math.min(maxWidth / origW, maxHeight / origH);
    const renderW = Math.round(origW * scale * 100) / 100;
    const renderH = Math.round(origH * scale * 100) / 100;

    doc.addImage(
      logoUrl,
      props.fileType || 'PNG',
      x,
      y,
      renderW,
      renderH
    );

    return {
      rendered: true,
      nextY: y + renderH + spacingAfter,
      width: renderW,
      height: renderH
    };
  } catch (err) {
    console.warn('Erro ao carregar logo proporcional no PDF:', err);
    return { rendered: false, nextY: defaultY, width: 0, height: 0 };
  }
}
