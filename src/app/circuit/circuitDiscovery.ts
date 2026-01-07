import type { CircuitFile } from '../../types';

export const CIRCUIT_FILES: CircuitFile[] = [
  { filename: 'generated/abu-dhabi.stl', format: 'stl', displayName: 'Abu Dhabi GP', rotation: -Math.PI / 2 },
  { filename: 'generated/australia.stl', format: 'stl', displayName: 'Australian GP' },
  { filename: 'generated/austrian.stl', format: 'stl', displayName: 'Austrian GP', rotation: 0 },
  { filename: 'generated/azerbaijan.stl', format: 'stl', displayName: 'Azerbaijan GP', rotation: 0 },
  { filename: 'generated/bahrain.stl', format: 'stl', displayName: 'Bahrain GP', rotation: Math.PI / 2 },
  { filename: 'generated/belgique.stl', format: 'stl', displayName: 'Belgian GP (Spa-Francorchamps)', rotation: Math.PI / 2 },
  { filename: 'generated/brazilian.stl', format: 'stl', displayName: 'Brazilian GP', rotation: -Math.PI / 2 },
  { filename: 'generated/british.stl', format: 'stl', displayName: 'British GP', rotation: 0 },
  { filename: 'generated/canadian.stl', format: 'stl', displayName: 'Canadian GP', rotation: Math.PI / 2 },
  { filename: 'generated/chinesse.stl', format: 'stl', displayName: 'Chinese GP', rotation: -Math.PI / 2 },
  { filename: 'generated/dutch.stl', format: 'stl', displayName: 'Dutch GP (Zandvoort)', rotation: -Math.PI / 2 },
  { filename: 'generated/hungarian.stl', format: 'stl', displayName: 'Hungarian GP', rotation: 0 },
  { filename: 'generated/italian.stl', format: 'stl', displayName: 'Italian GP (Monza)', rotation: 0 },
  { filename: 'generated/japon.stl', format: 'stl', displayName: 'Japanese GP', rotation: 0 },
  { filename: 'generated/mexique.stl', format: 'stl', displayName: 'Mexican GP', rotation: 0 },
  { filename: 'generated/miami.stl', format: 'stl', displayName: 'Miami GP', rotation: 0 },
  { filename: 'generated/monaco.stl', format: 'stl', displayName: 'Monaco GP', rotation: 0 },
  { filename: 'generated/quatar.stl', format: 'stl', displayName: 'Qatar GP', rotation: 0 },
  { filename: 'generated/romagna.stl', format: 'stl', displayName: 'Emilia Romagna GP', rotation: 0 },
  { filename: 'generated/saudi.stl', format: 'stl', displayName: 'Saudi Arabian GP', rotation: 0 },
  { filename: 'generated/singapour.stl', format: 'stl', displayName: 'Singapore GP', rotation: 0 },
  { filename: 'generated/spanish.stl', format: 'stl', displayName: 'Spanish GP', rotation: 0 },
  { filename: 'generated/usa-lv.stl', format: 'stl', displayName: 'United States GP (Las Vegas)', rotation: 0 },
  { filename: 'generated/usa.stl', format: 'stl', displayName: 'United States GP (Austin)', rotation: 0 },
];

export function getAvailableCircuits(): CircuitFile[] {
  return CIRCUIT_FILES;
}

export function getDefaultCircuit(): CircuitFile {
  return CIRCUIT_FILES[0];
}
