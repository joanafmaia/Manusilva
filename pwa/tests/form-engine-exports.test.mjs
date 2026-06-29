import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enviarEmailSrc = fs.readFileSync(
  path.join(__dirname, '../api/enviar-email.js'),
  'utf8',
);
const supabaseEnvSrc = fs.readFileSync(
  path.join(__dirname, '../api/lib/supabase-env.js'),
  'utf8',
);

/** Exportações usadas por forms.js e painéis de revisão — regressão Fase 3d. */
const REQUIRED_FORM_ENGINE_EXPORTS = [
  'renderReportFields',
  'renderReportFormTabsNav',
  'bindReportFormTabs',
  'collectReportValues',
  'bindFormFieldInteractions',
  'renderJobClientHeader',
  'getServiceFormTitle',
  'buildFormPrefill',
  'mergeFormValues',
  'isOfficialTemplate',
  'renderDeslocacaoIntroBlock',
  'analyzeReportFormTabs',
  'countFilledFields',
];

describe('form-engine exports', () => {
  it('expõe símbolos críticos para forms.js', async () => {
    const mod = await import('../js/form-engine.js');
    for (const name of REQUIRED_FORM_ENGINE_EXPORTS) {
      assert.equal(typeof mod[name], 'function', `export em falta: ${name}`);
    }
  });
});

describe('Fase 2 — supabase sem fallback hardcoded', () => {
  it('enviar-email usa supabase-auth partilhado', () => {
    assert.match(enviarEmailSrc, /require\('\.\/lib\/supabase-auth'\)/);
    assert.doesNotMatch(enviarEmailSrc, /zhfbezrevosmbmcbyskw/);
    assert.doesNotMatch(enviarEmailSrc, /eyJhbGci/);
    assert.doesNotMatch(enviarEmailSrc, /function getBearerToken/);
  });

  it('supabase-env exige variáveis de ambiente', () => {
    assert.match(supabaseEnvSrc, /throw new Error\('SUPABASE_URL/);
    assert.match(supabaseEnvSrc, /throw new Error\('SUPABASE_ANON_KEY/);
    assert.doesNotMatch(supabaseEnvSrc, /zhfbezrevosmbmcbyskw/);
    assert.doesNotMatch(supabaseEnvSrc, /eyJhbGci/);
  });
});
