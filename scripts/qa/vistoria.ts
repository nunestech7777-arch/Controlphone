// Vistoria completa para os testes que vendem aparelho seminovo (todas as respostas SIM)
import { INSPECTION_ITEMS, InspectionDraft } from '../../src/lib/deviceInspection';

export const vistoriaCompleta = (notes = ''): InspectionDraft => ({
  answers: Object.fromEntries(INSPECTION_ITEMS.map(({ key }) => [key, true])),
  notes
});
