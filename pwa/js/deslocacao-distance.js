/**
 * Deslocação (Km) — cálculo automático ida e volta (sede → cliente).
 * Geocoding: Mapbox · Rota: OSRM público.
 */

import { ensureClientAddressForDeslocacao } from './clients-catalog.js';
import { reportIncludesDeslocacao } from './deslocacao-field.js';
import { MAPBOX_ACCESS_TOKEN } from './mapbox-config.js';

const HQ_ADDRESS =
  'Rua São Mamede, Lote Nº1-Fração D, 4760-725 Ribeirão VNF, Portugal';

const MAPBOX_GEOCODING_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 14_000;

let cachedHqPoint = null;

export function serviceHasDeslocacaoField(service) {
  return reportIncludesDeslocacao(service);
}

/**
 * Morada completa do Supabase — Mapbox resolve números, andares e CP.
 * Enriquece com localidade/CP/Portugal só se faltarem no texto original.
 */
export function buildMapboxSearchQuery(morada, localidade = '', codigoPostal = '') {
  const base = String(morada || '').trim();
  if (!base) return '';

  const parts = [base];
  const loc = String(localidade || '').trim();
  const cp = String(codigoPostal || '').trim();

  if (loc && !base.toLowerCase().includes(loc.toLowerCase())) parts.push(loc);
  if (cp && !base.includes(cp)) parts.push(cp);
  if (!/portugal/i.test(base)) parts.push('Portugal');

  return parts.join(', ');
}

/** @deprecated Alias — usar buildMapboxSearchQuery */
export function buildClientMapSearchQuery(morada, localidade = '', codigoPostal = '') {
  return buildMapboxSearchQuery(morada, localidade, codigoPostal);
}

/**
 * Geocoding Mapbox — morada → coordenadas GPS.
 * @param {string} searchText
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
async function mapboxGeocodeToCoords(searchText) {
  const q = String(searchText || '').trim();
  if (!q) return null;
  if (!MAPBOX_ACCESS_TOKEN) {
    console.warn('[Deslocação] MAPBOX_ACCESS_TOKEN em falta — ver mapbox-config.js');
    return null;
  }

  const url =
    `${MAPBOX_GEOCODING_URL}/${encodeURIComponent(q)}.json` +
    `?access_token=${MAPBOX_ACCESS_TOKEN}&country=pt&limit=1`;

  console.log('[Deslocação] Mapbox — a geocodificar:', q);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[Deslocação] Mapbox Failed to fetch:', err);
    return null;
  }

  if (!res.ok) {
    console.warn('[Deslocação] Mapbox HTTP', res.status);
    return null;
  }

  const data = await res.json();
  const feature = data?.features?.[0];
  if (!feature?.center || feature.center.length < 2) {
    console.warn('[Deslocação] Mapbox sem resultados para:', q);
    return null;
  }

  const lon = Number(feature.center[0]);
  const lat = Number(feature.center[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  console.log('[Deslocação] Coordenadas obtidas:', {
    lat,
    lon,
    place_name: feature.place_name,
  });
  return { lat, lon };
}

export async function geocodeAddressToCoords(searchText) {
  return mapboxGeocodeToCoords(searchText);
}

async function geocodeClientAddress(morada, localidade = '', codigoPostal = '') {
  const query = buildMapboxSearchQuery(morada, localidade, codigoPostal);
  if (!query) return null;
  return mapboxGeocodeToCoords(query);
}

async function getHqPoint() {
  if (cachedHqPoint) return cachedHqPoint;
  cachedHqPoint = await mapboxGeocodeToCoords(HQ_ADDRESS);
  return cachedHqPoint;
}

/**
 * @param {{ lat: number, lon: number }} from
 * @param {{ lat: number, lon: number }} to
 * @returns {Promise<number | null>} distância só ida (km)
 */
async function drivingDistanceKmOneWay(from, to) {
  const path = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_ROUTE_URL}/${path}?overview=false`;

  console.log('[Deslocação] OSRM — a calcular rota:', url);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[Deslocação] OSRM Failed to fetch:', err);
    return null;
  }

  if (!res.ok) {
    console.warn('[Deslocação] OSRM HTTP', res.status);
    return null;
  }

  const data = await res.json();
  const meters = data?.routes?.[0]?.distance;
  if (data?.code !== 'Ok' || !Number.isFinite(meters) || meters <= 0) {
    console.warn('[Deslocação] OSRM resposta inválida:', data?.code);
    return null;
  }

  return meters / 1000;
}

/**
 * Ida e volta (×2), arredondada a 1 casa decimal.
 * @param {string} morada
 * @param {string} localidade
 * @param {string} codigoPostal
 * @returns {Promise<number | null>}
 */
export async function calculateDeslocacaoRoundTripKm(morada, localidade = '', codigoPostal = '') {
  const pesquisaMorada = buildMapboxSearchQuery(morada, localidade, codigoPostal);
  if (!pesquisaMorada) return null;

  console.log('A calcular rota para:', pesquisaMorada);

  try {
    const clientPoint = await geocodeClientAddress(morada, localidade, codigoPostal);
    if (!clientPoint) return null;

    const hqPoint = await getHqPoint();
    if (!hqPoint) return null;

    const oneWayKm = await drivingDistanceKmOneWay(hqPoint, clientPoint);
    if (oneWayKm == null || oneWayKm <= 0) return null;

    const roundTrip = oneWayKm * 2;
    const km = Math.round(roundTrip * 10) / 10;
    console.log('[Deslocação] Ida e volta (Km):', km, '(só ida:', Math.round(oneWayKm * 10) / 10, ')');
    return km;
  } catch (err) {
    console.warn('[Deslocação] Cálculo automático falhou:', err);
    return null;
  }
}

function savedDeslocacaoHasValue(savedValues) {
  const raw = savedValues?.deslocacao;
  if (raw === undefined || raw === null || raw === '') return false;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n > 0;
}

/**
 * Atualiza o input e força o redesenho visual no tablet.
 * @param {HTMLElement} overlay
 * @param {number|string} km
 * @returns {boolean}
 */
export function setDeslocacaoFormValue(overlay, km) {
  const input = overlay?.querySelector('[data-field-id="deslocacao"]');
  if (!input) return false;

  const text = String(km);
  input.value = text;
  input.setAttribute('value', text);
  input.defaultValue = text;

  const fieldWrap = input.closest('.form-input-unit-field');
  fieldWrap?.classList.toggle('has-value', text.trim() !== '');

  requestAnimationFrame(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  return true;
}

/** Fallback silencioso — sem internet ou geocoder indisponível */
function applyDeslocacaoFallbackZero(overlay) {
  try {
    setDeslocacaoFormValue(overlay, 0);
  } catch {
    /* não bloquear o formulário */
  }
}

/**
 * Preenche o input «Deslocação» após abrir o relatório (não bloqueia o técnico).
 * @param {HTMLElement} overlay
 * @param {{ job: object, service: object, savedValues?: object, onValueSet?: () => void }} ctx
 */
export async function applyAutoDeslocacaoToForm(overlay, ctx) {
  const { job, service, savedValues = {}, onValueSet } = ctx;
  if (!serviceHasDeslocacaoField(service)) return;

  const input = overlay.querySelector('[data-field-id="deslocacao"]');
  if (!input) return;

  if (savedDeslocacaoHasValue(savedValues)) return;

  const existing = String(input.value ?? '').trim();
  if (existing) {
    const n = Number(existing.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return;
  }

  const wrap = overlay.querySelector('.form-intro-deslocacao');
  wrap?.classList.add('is-calculating');

  try {
    if (!job?.clientId) {
      applyDeslocacaoFallbackZero(overlay);
      return;
    }

    const address = await ensureClientAddressForDeslocacao(job.clientId);
    if (!address?.morada) {
      applyDeslocacaoFallbackZero(overlay);
      return;
    }

    console.log('[Deslocação] Dados do cliente prontos:', {
      jobId: job.id,
      clientId: job.clientId,
      morada: address.morada,
      localidade: address.localidade || '(vazio)',
      codigo_postal: address.codigo_postal || '(vazio)',
    });

    const km = await calculateDeslocacaoRoundTripKm(
      address.morada,
      address.localidade,
      address.codigo_postal,
    );
    if (km == null || km <= 0) {
      applyDeslocacaoFallbackZero(overlay);
      return;
    }

    if (setDeslocacaoFormValue(overlay, km)) {
      console.log('[Deslocação] Km aplicados ao formulário:', km);
      onValueSet?.();
    }
  } catch {
    applyDeslocacaoFallbackZero(overlay);
  } finally {
    wrap?.classList.remove('is-calculating');
  }
}
