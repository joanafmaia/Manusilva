/**
 * Deslocação (Km) — cálculo automático ida e volta (sede → cliente).
 * Geocoding: Nominatim (OSM) · Rota: OSRM público.
 */

import { COMPANY } from './mock_data.js';
import { ensureClientAddressForDeslocacao } from './clients-catalog.js';
import { reportIncludesDeslocacao } from './deslocacao-field.js';

const HQ_ADDRESS =
  'Rua São Mamede, Lote Nº1-Fração D, 4760-725 Ribeirão VNF, Portugal';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 14_000;
const NOMINATIM_DELAY_MS = 1_100;

let lastNominatimAt = 0;

export function serviceHasDeslocacaoField(service) {
  return reportIncludesDeslocacao(service);
}

/** Morada pesquisável — evita vírgulas duplas e gralhas vazias */
export function buildClientMapSearchQuery(morada, codigoPostal) {
  const street = String(morada || '').trim();
  const cp = String(codigoPostal || '').trim();
  if (!street) return '';
  const parts = [street, cp, 'Portugal'].filter(Boolean);
  return parts.join(', ').replace(/,\s*,+/g, ', ').replace(/,\s*$/g, '').trim();
}

async function waitNominatimSlot() {
  const elapsed = Date.now() - lastNominatimAt;
  if (elapsed < NOMINATIM_DELAY_MS) {
    await new Promise((r) => setTimeout(r, NOMINATIM_DELAY_MS - elapsed));
  }
  lastNominatimAt = Date.now();
}

/**
 * @param {string} query
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
async function geocodeAddress(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  await waitNominatimSlot();

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'pt');

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'pt-PT,pt',
      'User-Agent': `ManusilvaPWA/1.0 (${COMPANY.email || 'contact'})`,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) return null;

  const rows = await res.json();
  const hit = rows?.[0];
  if (!hit) return null;

  const lat = Number.parseFloat(hit.lat);
  const lon = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

/**
 * @param {{ lat: number, lon: number }} from
 * @param {{ lat: number, lon: number }} to
 * @returns {Promise<number | null>} distância só ida (km)
 */
async function drivingDistanceKmOneWay(from, to) {
  const path = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${OSRM_ROUTE_URL}/${path}?overview=false`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const meters = data?.routes?.[0]?.distance;
  if (data?.code !== 'Ok' || !Number.isFinite(meters) || meters <= 0) return null;

  return meters / 1000;
}

/**
 * Ida e volta (×2), arredondada a 1 casa decimal.
 * @param {string} morada
 * @param {string} codigoPostal
 * @returns {Promise<number | null>}
 */
export async function calculateDeslocacaoRoundTripKm(morada, codigoPostal) {
  const pesquisaMorada = buildClientMapSearchQuery(morada, codigoPostal);
  if (!pesquisaMorada) return null;

  console.log('A calcular rota para:', pesquisaMorada);

  try {
    const hqPoint = await geocodeAddress(HQ_ADDRESS);
    const clientPoint = await geocodeAddress(pesquisaMorada);
    if (!hqPoint || !clientPoint) return null;

    const oneWayKm = await drivingDistanceKmOneWay(hqPoint, clientPoint);
    if (oneWayKm == null || oneWayKm <= 0) return null;

    const roundTrip = oneWayKm * 2;
    return Math.round(roundTrip * 10) / 10;
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

  const fieldWrap = input.closest('.form-input-unit-field');
  fieldWrap?.classList.toggle('has-value', text.trim() !== '');

  requestAnimationFrame(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  return true;
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
      console.warn('[Deslocação] Trabalho sem cliente atribuído pelos RH:', job?.id);
      return;
    }

    const address = await ensureClientAddressForDeslocacao(job.clientId);
    if (!address?.morada) {
      console.warn('[Deslocação] Morada do cliente ainda indisponível — cálculo ignorado.', {
        jobId: job.id,
        clientId: job.clientId,
      });
      return;
    }

    console.log('[Deslocação] Dados do cliente prontos:', {
      jobId: job.id,
      clientId: job.clientId,
      morada: address.morada,
      codigo_postal: address.codigo_postal || '(vazio)',
    });

    const km = await calculateDeslocacaoRoundTripKm(address.morada, address.codigo_postal);
    if (km == null || km <= 0) {
      console.warn('[Deslocação] OSRM não devolveu distância válida.');
      return;
    }

    if (setDeslocacaoFormValue(overlay, km)) {
      console.log('[Deslocação] Km aplicados ao formulário:', km);
      onValueSet?.();
    }
  } catch (err) {
    console.warn('[Deslocação] Auto-preenchimento ignorado:', err);
  } finally {
    wrap?.classList.remove('is-calculating');
  }
}
