import { getAvailableCircuits, getDefaultCircuit } from '../circuit/circuitDiscovery.js';
import type { CircuitFile } from '../../types';

export function setupCircuitSelector(onCircuitChange: (circuitFile: CircuitFile) => void, initialCircuit?: CircuitFile): void {
  const circuitSelect = document.getElementById('circuit-select') as HTMLSelectElement;
  if (!circuitSelect) return;

  circuitSelect.innerHTML = '';
  const circuits = getAvailableCircuits();
  circuits.forEach((circuit) => {
    const option = document.createElement('option');
    option.value = circuit.filename;
    option.textContent = circuit.displayName;
    circuitSelect.appendChild(option);
  });

  const defaultCircuit = initialCircuit || getDefaultCircuit();
  circuitSelect.value = defaultCircuit.filename;

  circuitSelect.addEventListener('change', (e) => {
    const selectedFilename = (e.target as HTMLSelectElement).value;
    const circuits = getAvailableCircuits();
    const selectedCircuit = circuits.find((c) => c.filename === selectedFilename);

    if (selectedCircuit) {
      onCircuitChange(selectedCircuit);
    }
  });
}
