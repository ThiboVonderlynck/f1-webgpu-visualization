import { getNodeApiUrl, getPythonApiUrl, API_CONFIG } from '../../config/index.js';

export { API_CONFIG };

export interface Race {
  round: number;
  name: string;
  country?: string;
  date?: string;
}

export interface Session {
  id: string;
  name: string;
  code: string;
}

export interface FetchResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface CheckResponse {
  exists: boolean;
}

export interface LoadResponse {
  success: boolean;
  totalFrames?: number;
  error?: string;
}

async function fetchFromPython(endpoint: string, params?: string): Promise<any> {
  const url = params ? `${getPythonApiUrl(endpoint)}?${params}` : getPythonApiUrl(endpoint);
  const data = await (await fetch(url)).json();
  if (!data.success) throw new Error(data.error || `Failed to fetch ${endpoint}`);
  return data;
}

export async function fetchYears(): Promise<number[]> {
  return (await fetchFromPython('years')).years;
}

export async function fetchRaces(year: number): Promise<Race[]> {
  return (await fetchFromPython('races', `year=${year}`)).races;
}

export async function fetchSessions(year: number, round: number): Promise<Session[]> {
  return (await fetchFromPython('sessions', `year=${year}&round=${round}`)).sessions;
}

export async function checkTelemetryExists(year: number, round: number, sessionType: string): Promise<boolean> {
  const data: CheckResponse = await (await fetch(`${getNodeApiUrl('check')}/${year}/${round}/${sessionType}`)).json();
  return data.exists;
}

export async function fetchTelemetryData(year: number, round: number, sessionType: string): Promise<FetchResponse> {
  return (
    await fetch(getNodeApiUrl('fetch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, round, sessionType }),
    })
  ).json();
}

export async function loadTelemetryFile(year: number, round: number, sessionType: string): Promise<LoadResponse> {
  return (
    await fetch(getNodeApiUrl('load'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, round, sessionType }),
    })
  ).json();
}
