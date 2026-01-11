export const API_CONFIG = {
  NODE_SERVER: {
    baseUrl: import.meta.env.VITE_NODE_API_URL || 'http://localhost:3001',
    wsUrl: import.meta.env.VITE_NODE_WS_URL || 'ws://localhost:3001',
    endpoints: {
      fetch: '/api/fetch',
      check: '/api/check',
      load: '/api/load',
    },
  },
  PYTHON_SERVER: {
    baseUrl: import.meta.env.VITE_PYTHON_API_URL || 'http://localhost:3002',
    endpoints: {
      years: '/api/years',
      races: '/api/races',
      sessions: '/api/sessions',
    },
  },
} as const;

export const CIRCUIT_MAPPING: Record<number, string> = {
  1: 'bahrain.stl',
  2: 'saudi.stl',
  3: 'australia.stl',
  4: 'japon.stl',
  5: 'chinesse.stl',
  6: 'miami.stl',
  7: 'romagna.stl',
  8: 'monaco.stl',
  9: 'canadian.stl',
  10: 'spanish.stl',
  11: 'austrian.stl',
  12: 'british.stl',
  13: 'hungarian.stl',
  14: 'belgique.stl',
  15: 'dutch.stl',
  16: 'italian.stl',
  17: 'azerbaijan.stl',
  18: 'singapour.stl',
  19: 'usa.stl',
  20: 'mexique.stl',
  21: 'brazilian.stl',
  22: 'usa-lv.stl',
  23: 'quatar.stl',
  24: 'abu-dhabi.stl',
};

export function getNodeApiUrl(endpoint: keyof typeof API_CONFIG.NODE_SERVER.endpoints): string {
  return `${API_CONFIG.NODE_SERVER.baseUrl}${API_CONFIG.NODE_SERVER.endpoints[endpoint]}`;
}

export function getPythonApiUrl(endpoint: keyof typeof API_CONFIG.PYTHON_SERVER.endpoints): string {
  return `${API_CONFIG.PYTHON_SERVER.baseUrl}${API_CONFIG.PYTHON_SERVER.endpoints[endpoint]}`;
}

export function getCircuitForRound(round: number): string | null {
  return CIRCUIT_MAPPING[round] || null;
}
