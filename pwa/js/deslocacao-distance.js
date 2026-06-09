/**
 * Deslocação (Km) — cálculo automático ida e volta (sede → cliente) × visitas.
 * Geocoding: Mapbox · Rota: OSRM público.
 */

import { ensureClientAddressForDeslocacao } from './clients-catalog.js';
import {
  DESLOCACAO_BASE_FIELD_ID,
  reportIncludesDeslocacao,
  VISITAS_FIELD_ID,
} from './deslocacao-field.js';
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
 * Ida e volta (×2), arredondada a 1 casa decimal — uma visita.
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

function parsePositiveNumber(raw, fallback = 0) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getVisitasInput(overlay) {
  return overlay?.querySelector(`[data-field-id="${VISITAS_FIELD_ID}"]`);
}

function getDeslocacaoBaseInput(overlay) {
  return overlay?.querySelector(`[data-field-id="${DESLOCACAO_BASE_FIELD_ID}"]`);
}

export function getVisitasCount(overlay) {
  const input = getVisitasInput(overlay);
  const n = parsePositiveNumber(input?.value, 1);
  return Math.max(1, Math.round(n));
}

export function getDeslocacaoBaseKm(overlay, savedValues = {}) {
  const hidden = getDeslocacaoBaseInput(overlay);
  const fromHidden = parsePositiveNumber(hidden?.value, 0);
  if (fromHidden > 0) return fromHidden;

  const fromSaved = parsePositiveNumber(savedValues?.[DESLOCACAO_BASE_FIELD_ID], 0);
  if (fromSaved > 0) return fromSaved;

  const total = parsePositiveNumber(
    overlay?.querySelector('[data-field-id="deslocacao"]')?.value ??
      savedValues?.deslocacao,
    0,
  );
  const visitas = parsePositiveNumber(
    savedValues?.[VISITAS_FIELD_ID] ?? savedValues?.visitas,
    getVisitasCount(overlay),
  );
  if (total > 0 && visitas > 0) return Math.round((total / visitas) * 10) / 10;
  return 0;
}

export function setDeslocacaoBaseKm(overlay, baseKm) {
  const hidden = getDeslocacaoBaseInput(overlay);
  if (!hidden) return;
  const text = String(baseKm);
  hidden.value = text;
  hidden.setAttribute('value', text);
}

/** Total Km = base ida/volta × número de visitas */
export function applyDeslocacaoTotalFromVisitas(overlay, { silent = false } = {}) {
  const base = getDeslocacaoBaseKm(overlay);
  if (base <= 0) return false;

  const visitas = getVisitasCount(overlay);
  const total = Math.round(base * visitas * 10) / 10;
  return setDeslocacaoFormValue(overlay, total, { silent });
}

function savedDeslocacaoHasValue(savedValues) {
  const raw = savedValues?.deslocacao;
  if (raw === undefined || raw === null || raw === '') return false;
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) && n > 0;
}

/**
 * @param {HTMLElement} overlay
 * @param {number|string} km
 * @param {{ silent?: boolean }} [opts]
 */
export function setDeslocacaoFormValue(overlay, km, { silent = false } = {}) {
  const input = overlay?.querySelector('[data-field-id="deslocacao"]');
  if (!input) return false;

  const text = String(km);
  input.value = text;
  input.setAttribute('value', text);
  input.defaultValue = text;

  const fieldWrap = input.closest('.form-input-unit-field');
  fieldWrap?.classList.toggle('has-value', text.trim() !== '' && text !== '0');

  if (!silent) {
    requestAnimationFrame(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  return true;
}

function applyDeslocacaoFallbackZero(overlay) {
  try {
    setDeslocacaoBaseKm(overlay, 0);
    setDeslocacaoFormValue(overlay, 0);
  } catch {
    /* não bloquear o formulário */
  }
}

/** Sincroniza base Km quando o técnico edita o total manualmente */
function syncBaseFromManualDeslocacao(overlay) {
  const total = parsePositiveNumber(
    overlay.querySelector('[data-field-id="deslocacao"]')?.value,
    0,
  );
  const visitas = getVisitasCount(overlay);
  if (total > 0 && visitas > 0) {
    setDeslocacaoBaseKm(overlay, Math.round((total / visitas) * 10) / 10);
  }
}

/**
 * Recalcula Deslocação quando mudam as visitas (ou após auto-preenchimento).
 * @param {HTMLElement} overlay
 * @param {{ onDirty?: () => void }} [opts]
 */
export function bindDeslocacaoVisitasRecalc(overlay, opts = {}) {
  const visitasInput = getVisitasInput(overlay);
  const deslocacaoInput = overlay.querySelector('[data-field-id="deslocacao"]');
  if (!visitasInput || !deslocacaoInput) return;

  const onVisitasChange = () => {
    let visitas = getVisitasCount(overlay);
    if (visitas < 1) {
      visitas = 1;
      visitasInput.value = '1';
    }
    applyDeslocacaoTotalFromVisitas(overlay);
    opts.onDirty?.();
  };

  visitasInput.addEventListener('input', onVisitasChange);
  visitasInput.addEventListener('change', onVisitasChange);

  deslocacaoInput.addEventListener('change', () => {
    syncBaseFromManualDeslocacao(overlay);
    opts.onDirty?.();
  });
}

function ensureDefaultVisitas(overlay, savedValues = {}) {
  const input = getVisitasInput(overlay);
  if (!input) return;
  const saved = savedValues[VISITAS_FIELD_ID] ?? savedValues.visitas;
  if (saved !== undefined && saved !== null && saved !== '') {
    input.value = String(Math.max(1, Math.round(parsePositiveNumber(saved, 1))));
    return;
  }
  if (!String(input.value ?? '').trim()) {
    input.value = '1';
  }
}

/**
 * Preenche Deslocação após abrir o relatório.
 */
export async function applyAutoDeslocacaoToForm(overlay, ctx) {
  const { job, service, savedValues = {}, onValueSet } = ctx;
  if (!serviceHasDeslocacaoField(service)) return;

  const deslocacaoInput = overlay.querySelector('[data-field-id="deslocacao"]');
  if (!deslocacaoInput) return;

  ensureDefaultVisitas(overlay, savedValues);

  const existingBase = getDeslocacaoBaseKm(overlay, savedValues);
  if (existingBase > 0) {
    setDeslocacaoBaseKm(overlay, existingBase);
    applyDeslocacaoTotalFromVisitas(overlay);
    return;
  }

  if (savedDeslocacaoHasValue(savedValues)) {
    const visitas = Math.max(
      1,
      Math.round(parsePositiveNumber(savedValues[VISITAS_FIELD_ID] ?? savedValues.visitas, 1)),
    );
    const total = parsePositiveNumber(savedValues.deslocacao, 0);
    if (total > 0) {
      setDeslocacaoBaseKm(overlay, Math.round((total / visitas) * 10) / 10);
      applyDeslocacaoTotalFromVisitas(overlay);
    }
    return;
  }

  const existing = String(deslocacaoInput.value ?? '').trim();
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

    const baseKm = await calculateDeslocacaoRoundTripKm(
      address.morada,
      address.localidade,
      address.codigo_postal,
    );
    if (baseKm == null || baseKm <= 0) {
      applyDeslocacaoFallbackZero(overlay);
      return;
    }

    setDeslocacaoBaseKm(overlay, baseKm);
    if (applyDeslocacaoTotalFromVisitas(overlay)) {
      const visitas = getVisitasCount(overlay);
      console.log('[Deslocação] Km aplicados:', baseKm, '×', visitas, '=', baseKm * visitas);
      onValueSet?.();
    }
  } catch {
    applyDeslocacaoFallbackZero(overlay);
  } finally {
    wrap?.classList.remove('is-calculating');
  }
}
