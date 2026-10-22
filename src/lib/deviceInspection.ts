// ============================================================================
// CONTROLPHONE — VISTORIA DO APARELHO SEMINOVO NA VENDA
// Preenchida pelo vendedor antes de concluir a venda de um aparelho SEMINOVO.
// Aparelho LACRADO não tem vistoria. As respostas vão para o item da venda e
// para a garantia (ligadas ao IMEI) e marcam o X no Termo de Garantia.
// ============================================================================

import { DeviceInspection, InspectionKey } from '../types';

/** Perguntas da vistoria, na ordem do Termo de Garantia (sem perguntas sobre trincas). */
export const INSPECTION_ITEMS: { key: InspectionKey; label: string }[] = [
  { key: 'front_camera', label: 'A câmera frontal está em perfeito funcionamento.' },
  { key: 'rear_camera', label: 'A câmera traseira está em perfeito funcionamento.' },
  { key: 'screen', label: 'A tela e o display estão em perfeito funcionamento.' },
  { key: 'top_speaker', label: 'O alto-falante superior está em perfeito funcionamento.' },
  { key: 'bottom_speaker', label: 'O alto-falante inferior está em perfeito funcionamento.' },
  { key: 'microphone', label: 'O microfone está em perfeito funcionamento.' },
  { key: 'audio_output', label: 'O fone de ouvido e a saída de áudio estão em perfeito funcionamento.' }
];

/** Respostas em preenchimento: começam sem marcação (nem SIM nem NÃO). */
export type InspectionDraft = { answers: Partial<Record<InspectionKey, boolean>>; notes: string };

export const emptyInspection = (): InspectionDraft => ({ answers: {}, notes: '' });

export const isInspectionComplete = (draft?: { answers?: Partial<Record<InspectionKey, boolean>> }) =>
  Boolean(draft?.answers) && INSPECTION_ITEMS.every(({ key }) => typeof draft!.answers![key] === 'boolean');

/** Quantas perguntas ainda estão sem resposta. */
export const missingAnswers = (draft?: { answers?: Partial<Record<InspectionKey, boolean>> }) =>
  INSPECTION_ITEMS.filter(({ key }) => typeof draft?.answers?.[key] !== 'boolean').length;

export const inspectionNoCount = (inspection?: DeviceInspection) =>
  inspection ? INSPECTION_ITEMS.filter(({ key }) => inspection.answers[key] === false).length : 0;
