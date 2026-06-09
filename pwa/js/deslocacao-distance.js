/**
 * Deslocação (Km) — cálculo automático ida e volta (sede → cliente).
 * Geocoding: Nominatim (OSM) · Rota: OSRM público.
 */

import { ensureClientAddressForDeslocacao } from './clients-catalog.js';
import { reportIncludesDeslocacao } from './deslocacao-field.js';

const HQ_ADDRESS =
  'Rua São Mamede, Lote Nº1-Fração D, 4760-725 Ribeirão VNF, Portugal';
const HQ_LOCALIDADE = 'Ribeirão VNF';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 14_000;
const NOMINATIM_DELAY_MS = 1_100;

let lastNominatimAt = 0;
let cachedHqPoint = null;

export function serviceHasDeslocacaoField(service) {
  return reportIncludesDeslocacao(service);
}

/** Rua principal — texto antes da primeira vírgula (ignora nº, andar, lote, etc.) */
function extractMainStreet(morada) {
  const raw = String(morada || '').trim();
  if (!raw) return '';
  return raw.split(',')[0].trim();
}

/** Localidade de reserva — último segmento da morada que não seja CP nem número */
function extractLocalidadeFromMorada(morada) {
  const parts = String(morada || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (let i = parts.length - 1; i >= 1; i--) {
    const part = parts[i];
    if (/^\d{4}(-\d{3})?$/.test(part)) continue;
    if (/^\d+[ºª]?\s*(esquerdo|direito|dto|esq)?$/i.test(part)) continue;
    if (/^\d+$/.test(part)) continue;
    if (part.length > 2) return part;
  }
  return '';
}

/**
 * Morada limpa para Nominatim — rua + localidade por extenso + Portugal.
 */
export function buildClientMapSearchQuery(morada, localidade = '') {
  const candidates = buildNominatimSearchCandidates(morada, localidade, '');
  return candidates[0] || '';
}

/**
 * Várias pesquisas por ordem de precisão (se a rua não existir no OSM, cai para CP/localidade).
 */
export function buildNominatimSearchCandidates(morada, localidade = '', codigoPostal = '') {
  const street = extractMainStreet(morada);
  const loc = String(localidade || '').trim() || extractLocalidadeFromMorada(morada);
  const cpRaw = String(codigoPostal || '').trim();
  const cpFromMorada = String(morada || '').match(/\b(\d{4}-\d{3})\b/)?.[1] || '';
  const cpFull = cpRaw.match(/\d{4}-\d{3}/)?.[0] || cpFromMorada;
  const cp4 = cpRaw.match(/\d{4}/)?.[0] || cpFull.slice(0, 4) || cpFromMorada.slice(0, 4);

  const seen = new Set();
  const out = [];
  const add = (q) => {
    const s = String(q || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };

  if (street && loc) add(`${street}, ${loc}, Portugal`);
  if (street && cpFull) add(`${street}, ${cpFull}, Portugal`);
  if (street && cp4 && loc) add(`${street}, ${cp4} ${loc}, Portugal`);
  if (loc && cpFull) add(`${cpFull} ${loc}, Portugal`);
  if (loc && cp4) add(`${loc}, ${cp4}, Portugal`);
  if (loc) add(`${loc}, Portugal`);
  if (street) add(`${street}, Portugal`);

  return out;
}

async function waitNominatimSlot() {
  const elapsed = Date.now() - lastNominatimAt;
  if (elapsed < NOMINATIM_DELAY_MS) {
    await new Promise((r) => setTimeout(r, NOMINATIM_DELAY_MS - elapsed));
  }
  lastNominatimAt = Date.now();
}

/**
 * Traduz texto (morada + localidade) em coordenadas GPS via Nominatim.
 * @param {string} pesquisaMorada
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
async function nominatimSearchOnce(q, { logMiss = true } = {}) {
  const query = String(q || '').trim();
  if (!query) return null;

  await waitNominatimSlot();

  const url =
    `${NOMINATIM_SEARCH_URL}?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=pt`;

  console.log('[Deslocação] Nominatim — a traduzir morada:', query);

  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'pt-PT,pt',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn('[Deslocação] Nominatim Failed to fetch:', err);
    return null;
  }

  if (!res.ok) {
    console.warn('[Deslocação] Nominatim HTTP', res.status);
    return null;
  }

  const rows = await res.json();
  const hit = rows?.[0];
  if (!hit) {
    if (logMiss) console.warn('[Deslocação] Nominatim sem resultados para:', query);
    return null;
  }

  const lat = Number.parseFloat(hit.lat);
  const lon = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  console.log('[Deslocação] Coordenadas obtidas:', { lat, lon, display_name: hit.display_name });
  return { lat, lon };
}

export async function geocodeAddressToCoords(pesquisaMorada) {
  return nominatimSearchOnce(pesquisaMorada);
}

async function geocodeClientAddress(morada, localidade = '', codigoPostal = '') {
  const candidates = buildNominatimSearchCandidates(morada, localidade, codigoPostal);
  if (!candidates.length) return null;

  for (let i = 0; i < candidates.length; i++) {
    const point = await nominatimSearchOnce(candidates[i], {
      logMiss: i === candidates.length - 1,
    });
    if (point) {
      if (i > 0) {
        console.log('[Deslocação] Nominatim — fallback aceite:', candidates[i]);
      }
      return point;
    }
  }
  return null;
}

async function getHqPoint() {
  if (cachedHqPoint) return cachedHqPoint;
  const hqQuery = buildClientMapSearchQuery(HQ_ADDRESS, HQ_LOCALIDADE);
  cachedHqPoint = await geocodeAddressToCoords(hqQuery);
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
 * @returns {Promise<number | null>}
 */
export async function calculateDeslocacaoRoundTripKm(morada, localidade = '', codigoPostal = '') {
  const candidates = buildNominatimSearchCandidates(morada, localidade, codigoPostal);
  if (!candidates.length) return null;

  console.log('A calcular rota para:', candidates[0], candidates.length > 1 ? `(+${candidates.length - 1} fallbacks)` : '');

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
