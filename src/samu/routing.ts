// SAMU 190 — Roteamento viário real (OSRM) + Haversine + ETA + proa
// Spec §2: OSRM via API pública + interpolação + Haversine para pareamento.

export type LatLng = [number, number];

export interface OsrmRouteResult {
  coords: LatLng[];
  distanceKm: number;
  durationMin: number;
  maneuver?: string;
  isRealRoute: boolean;
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

/** Distância geodésica instantânea (Haversine) em km — pareamento de viaturas. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  if (!isFinite(aLat) || !isFinite(aLng) || !isFinite(bLat) || !isFinite(bLng)) return 999;
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return Number((R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))).toFixed(2));
}

/** Ângulo de proa (0-360°) entre dois pontos — gira o puck/chevron no mapa. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const dLng = ((to[1] - from[1]) * Math.PI) / 180;
  const lat1 = (from[0] * Math.PI) / 180;
  const lat2 = (to[0] * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI >= 0
    ? (Math.atan2(y, x) * 180) / Math.PI
    : (Math.atan2(y, x) * 180) / Math.PI + 360;
}

/** ETA em minutos com sirene (~45 km/h média urbana) a partir da distância. */
export function etaMinutesFromKm(km: number): number {
  if (!isFinite(km) || km <= 0) return 1;
  return Math.max(1, Math.round((km / 45) * 60));
}

export function formatEta(min: number): string {
  if (!isFinite(min)) return '--';
  if (min < 1) return '<1 min';
  return `${Math.round(min)} min`;
}

export function formatDistance(km?: number | null): string {
  if (km === undefined || km === null || !isFinite(km)) return 'Em deslocamento';
  if (km < 1) return `${Math.round(km * 1000)} m de você`;
  return `${km.toFixed(1)} km de você`;
}

/**
 * Busca rota viária real no OSRM com geometria GeoJSON.
 * Fallback: linha reta [from, to] com distância Haversine.
 */
export async function fetchRoadRoute(from: LatLng, to: LatLng, signal?: AbortSignal): Promise<OsrmRouteResult> {
  const fallback = (): OsrmRouteResult => {
    const km = haversineKm(from[0], from[1], to[0], to[1]);
    return { coords: [from, to], distanceKm: km, durationMin: etaMinutesFromKm(km), isRealRoute: false };
  };

  try {
    if (!from[0] || !from[1] || !to[0] || !to[1]) return fallback();
    const url =
      `${OSRM_BASE}/${from[1]},${from[0]};${to[1]},${to[0]}` +
      `?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url, { signal });
    if (!res.ok) return fallback();
    const data = await res.json();
    const route = data?.routes?.[0];
    const coordsRaw: number[][] | undefined = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coordsRaw) || coordsRaw.length < 2) return fallback();
    // OSRM retorna [lng, lat] — converter para [lat, lng] do Leaflet
    const coords: LatLng[] = coordsRaw.map(([lng, lat]) => [lat, lng]);
    const distanceKm = Number(((route.distance || 0) / 1000).toFixed(2));
    // Com sirene o tempo real é menor que o do trânsito comum: ponderar 0.7x, mínimo 1 min
    const durationMin = Math.max(1, Math.round(((route.duration || 0) / 60) * 0.7));
    const maneuver: string | undefined = route?.legs?.[0]?.steps?.[1]?.maneuver?.type
      ? humanizeManeuver(
          route.legs[0].steps[1].maneuver.type,
          route.legs[0].steps[1].maneuver.modifier,
          route.legs[0].steps[1]?.name,
        )
      : undefined;
    return { coords, distanceKm, durationMin, maneuver, isRealRoute: true };
  } catch {
    return fallback();
  }
}

function humanizeManeuver(type: string, modifier?: string, roadName?: string): string {
  const road = roadName ? ` na ${roadName}` : '';
  if (type === 'arrive') return `Você chegou ao destino${road}`;
  if (type === 'depart') return `Siga em frente${road}`;
  if (type === 'turn') {
    if (modifier === 'left' || modifier === 'slight left' || modifier === 'sharp left') return `Vire à esquerda${road}`;
    if (modifier === 'right' || modifier === 'slight right' || modifier === 'sharp right') return `Vire à direita${road}`;
    return `Siga${road}`;
  }
  if (type === 'roundabout' || type === 'rotary') return `Na rotatória, siga${road}`;
  if (type === 'merge') return `Entre na via${road}`;
  if (type === 'on ramp' || type === 'off ramp') return `Acesse a via${road}`;
  if (type === 'fork') return `Mantenha-se na via${road}`;
  if (type === 'end of road') return `Ao final da via, siga${road}`;
  return `Siga em frente${road}`;
}

/** Instrução simples de manobra a partir da proa atual vs. rumo ao destino. */
export function nextManeuverInstruction(currentHeading: number, from: LatLng, to: LatLng): string {
  const target = bearingDegrees(from, to);
  let diff = ((target - currentHeading + 540) % 360) - 180;
  if (Math.abs(diff) < 25) return 'Siga em frente';
  return diff > 0 ? 'Vire à direita' : 'Vire à esquerda';
}
