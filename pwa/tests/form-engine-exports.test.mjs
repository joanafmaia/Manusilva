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
  path.join(__dirname, '../server-lib/supabase-env.js'),
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

  it('renderiza checklist da manutenção corretiva', async () => {
    const { renderReportFields, analyzeReportFormTabs } = await import('../js/form-engine.js');
    const { MANUTENCAO_CORRETIVA_MAQUINAS } = await import('../js/mock_data.js');
    assert.equal(analyzeReportFormTabs(MANUTENCAO_CORRETIVA_MAQUINAS).checklist, true);
    const html = renderReportFields(MANUTENCAO_CORRETIVA_MAQUINAS, {}, {}, { tab: 'checklist' });
    assert.match(html, /data-verification-field="lista_de_verificacoes"/);
    assert.match(html, /Chassis/);
    assert.match(html, /corretiva-verifications-shell/);
  });

  it('não duplica Observações/Estado na checklist de empilhadores', async () => {
    const formEngine = await import('../js/form-engine.js');
    const { MANUTENCAO_PREVENTIVA_EMPILHADORES } = await import('../js/mock_data.js');
    await formEngine.preloadFormFieldModules(MANUTENCAO_PREVENTIVA_EMPILHADORES);
    const html = formEngine.renderReportFields(
      MANUTENCAO_PREVENTIVA_EMPILHADORES,
      {
        maquinas: [
          {
            marca: 'Toyota',
            estado_maquina: 'Operacional',
            observacoes: 'nota',
            componentes_externos: {},
            componentes_internos: {},
          },
        ],
      },
      { activeMaquinaIndex: 0 },
      { tab: 'checklist' },
    );
    assert.match(html, /empilhadores-maquina-tail-fields/);
    assert.doesNotMatch(html, /A carregar checklist/);
    assert.equal(
      (html.match(/Estado da Máquina/g) || []).length,
      0,
      'não deve haver secção Estado da Máquina duplicada nos grupos',
    );
    const tailChunk = html.split('empilhadores-maquina-tail-fields')[1] || '';
    assert.match(tailChunk, /observacoes/i);
    assert.match(tailChunk, /estado_maquina/i);
  });

  it('omite label do campo quando a secção já tem o mesmo título', async () => {
    const { renderReportFields, preloadFormFieldModules } = await import('../js/form-engine.js');
    const {
      MOVIMENTO_MATERIAL_CLIENTE,
      REPARACAO_CARREGADOR,
      MANUTENCAO_PREVENTIVA_EMPILHADORES,
    } = await import('../js/mock_data.js');

    const movimentoHtml = renderReportFields(MOVIMENTO_MATERIAL_CLIENTE, {}, {}, { tab: 'geral' });
    assert.match(movimentoHtml, /form-section-subtitle[^>]*>Observações</);
    assert.equal(
      (movimentoHtml.match(/<label class="form-label">Observações<\/label>/g) || []).length,
      0,
    );

    const carregadorHtml = renderReportFields(REPARACAO_CARREGADOR, {}, {}, { tab: 'geral' });
    assert.match(carregadorHtml, /form-section-subtitle[^>]*>Consumíveis</);
    assert.equal(
      (carregadorHtml.match(/<label class="form-label">Consumíveis<\/label>/g) || []).length,
      0,
    );

    await preloadFormFieldModules(MANUTENCAO_PREVENTIVA_EMPILHADORES);
    const empHtml = renderReportFields(
      MANUTENCAO_PREVENTIVA_EMPILHADORES,
      { maquinas: [{ marca: 'Toyota', consumiveis: [] }] },
      { activeMaquinaIndex: 0 },
      { tab: 'checklist' },
    );
    assert.match(empHtml, /Consumíveis Utilizados/);
    assert.equal(
      (empHtml.match(/<label class="form-label">Consumíveis Utilizados<\/label>/g) || []).length,
      0,
    );
  });
});

describe('Fase 2 — supabase sem fallback hardcoded', () => {
  it('enviar-email usa supabase-auth partilhado', () => {
    assert.match(enviarEmailSrc, /require\('\.\.\/server-lib\/supabase-auth'\)/);
    assert.doesNotMatch(enviarEmailSrc, /zhfbezrevosmbmcbyskw/);
    assert.doesNotMatch(enviarEmailSrc, /eyJhbGci/);
    assert.doesNotMatch(enviarEmailSrc, /function getBearerToken/);
  });

  it('supabase-env exige variáveis de ambiente', () => {
    assert.match(supabaseEnvSrc, /throw new Error\([\s\S]*SUPABASE_URL/);
    assert.match(supabaseEnvSrc, /throw new Error\([\s\S]*SUPABASE_ANON_KEY/);
    assert.doesNotMatch(supabaseEnvSrc, /zhfbezrevosmbmcbyskw/);
    assert.doesNotMatch(supabaseEnvSrc, /eyJhbGci/);
  });
});
