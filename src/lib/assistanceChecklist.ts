// ============================================================================
// CONTROLPHONE — CHECKLIST DE ENTRADA DA ASSISTÊNCIA
// Estado do aparelho no momento em que o cliente o entrega à loja.
// ============================================================================

export type ChecklistState = 'ok' | 'fail' | 'untested';

export const CHECKLIST_ITEMS: { id: string; label: string }[] = [
  { id: 'power_on', label: 'Liga normalmente' },
  { id: 'screen', label: 'Tela funcionando' },
  { id: 'touch', label: 'Touch funcionando' },
  { id: 'face_id', label: 'Face ID' },
  { id: 'touch_id', label: 'Touch ID' },
  { id: 'front_camera', label: 'Câmera frontal' },
  { id: 'rear_camera', label: 'Câmera traseira' },
  { id: 'flash', label: 'Flash' },
  { id: 'top_speaker', label: 'Alto-falante superior' },
  { id: 'bottom_speaker', label: 'Alto-falante inferior' },
  { id: 'microphone', label: 'Microfone' },
  { id: 'vibration', label: 'Vibração' },
  { id: 'side_buttons', label: 'Botões laterais' },
  { id: 'power_button', label: 'Botão Power' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'bluetooth', label: 'Bluetooth' },
  { id: 'mobile_network', label: 'Rede móvel' },
  { id: 'charging', label: 'Carregamento' },
  { id: 'wireless_charging', label: 'Carregamento por indução' },
  { id: 'battery', label: 'Bateria' },
  { id: 'back_cover', label: 'Tampa traseira íntegra' },
  { id: 'screen_no_cracks', label: 'Tela sem trincas' },
  { id: 'chassis', label: 'Chassi sem amassados' }
];

export const CHECKLIST_STATE_LABELS: Record<ChecklistState, string> = {
  ok: 'OK',
  fail: 'Com problema',
  untested: 'Não testado'
};

export type IntakeChecklist = Record<string, ChecklistState>;
