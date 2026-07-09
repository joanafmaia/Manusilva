/**
 * Manusilva PWA — Mock Database (9 relatórios oficiais)
 */

import { INSPECAO_DL50_CATEGORIES, INSPECAO_DL50_LEGAL_OPTIONS } from './inspecao-dl50-categories.js';
import {
  VERIFICACOES_EXTERNAS_ITEMS,
  VERIFICACOES_INTERNAS_ITEMS,
} from './preventiva-empilhadores-items.js';
import { createMaterialTableField, createGrandesConsumiveisField } from './material-table-field.js';
import {
  LABEL_MARCA,
  LABEL_MODELO,
  LABEL_TIPO,
  LABEL_NUMERO_SERIE,
  LABEL_N_INTERNO,
  LABEL_HORAS,
  LABEL_HORAS_GASTAS,
  LABEL_ANO_FABRICO,
  LABEL_MARCA_MODELO,
  LABEL_MODELO_TIPO,
  LABEL_ETIQUETA,
  LABEL_ESTADO_MAQUINA,
} from './field-labels.js';

/** Secção de óleos/filtros — após verificações no relatório Empilhadores */
export const EMPILHADORES_MATERIAL_SECTION = 'Substituição de Material na Manutenção';

/** Identificação bateria — nº série + modelo/tipo (sem marca, modelo ou nº interno separados) */
export const BATERIA_IDENTITY_FIELD_DEFS = [
  { type: 'text', id: 'numero_de_serie', label: LABEL_NUMERO_SERIE, section: 'Informações da Bateria' },
  {
    type: 'text',
    id: 'tipo',
    label: LABEL_MODELO_TIPO,
    section: 'Informações da Bateria',
    placeholder: 'ex: Hawker 4 PzS 500',
  },
];

export const SCHEMA_VERSION = 25;

export const COMPANY = {
  name: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  tagline: 'Empilhadores · Manutenção · Baterias',
  logo: 'MS',
  nif: '',
  address: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  postalCode: '4760-725 Ribeirão VNF',
  phone: '+351 229 811 990',
  email: 'manusilva.lda@gmail.com',
  website: 'www.manusilva.pt',
};

/** Template oficial */
export const FOLHA_INTERVENCAO_AVARIAS = {
  id: 'folha_intervencao_avarias',
  title: 'Folha de Intervenção de Avarias',
  label: 'Folha de Intervenção de Avarias',
  icon: 'wrench',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'text', id: 'marca', label: LABEL_MARCA, section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: LABEL_MODELO, section: 'Informações da Máquina' },
    { type: 'text', id: 'numero_de_serie', label: LABEL_NUMERO_SERIE, section: 'Informações da Máquina' },
    { type: 'text', id: 'n_interno', label: LABEL_N_INTERNO, section: 'Informações da Máquina' },
    { type: 'number', id: 'horas', label: LABEL_HORAS, section: 'Informações da Máquina', min: 0, step: 1 },
    { type: 'textarea', id: 'detecao_de_avaria', label: 'Deteção de Avaria' },
    { type: 'textarea', id: 'resolucao_da_avaria', label: 'Resolução da Avaria' },
    createMaterialTableField({ id: 'material_utilizado' }),
    {
      type: 'number',
      id: 'visitas_realizadas',
      label: 'N.º de Visitas',
      section: 'Datas de Intervenção',
      min: 1,
      max: 2,
      step: 1,
      placeholder: '1',
    },
    { type: 'date', id: 'data_1', label: 'Data 1', section: 'Datas de Intervenção' },
    { type: 'date', id: 'data_2', label: 'Data 2', section: 'Datas de Intervenção' },
    { type: 'number', id: 'horas_gastas', label: LABEL_HORAS_GASTAS, section: 'Datas de Intervenção', min: 0, step: 0.5 },
    {
      type: 'choice',
      id: 'pedido_orcamento',
      label: 'Pedido de Orçamento',
      section: 'Pedido de Orçamento',
      options: ['Não', 'Sim'],
      uiVariant: 'yesNo',
    },
    {
      type: 'textarea',
      id: 'detalhe_pedido_orcamento',
      label: 'O que é necessário',
      section: 'Pedido de Orçamento',
      dependency: 'pedido_orcamento:Sim',
      rows: 4,
      placeholder: 'Descreva peças, trabalhos ou observações para o orçamento…',
    },
    {
      type: 'status_pills',
      id: 'estado_maquina',
      label: 'Estado Em Que Ficou a Máquina',
      options: ['Apta a Trabalhar', 'Aguardar Intervenção'],
    },
  ],
};

/** Template oficial — Clientes Grandes */
export const MANUTENCAO_BATERIAS_GRANDES = {
  id: 'manutencao_baterias_grandes',
  title: 'Formulário Manutenção Baterias Clientes Grandes',
  label: 'Formulário Manutenção Baterias Clientes Grandes',
  icon: 'factory',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    {
      type: 'grandes_identificacao_baterias',
      id: 'identificacao_baterias',
      label: 'Identificação Bateria',
      section: 'Identificação Bateria',
    },
    createGrandesConsumiveisField(),
    { type: 'textarea', id: 'observacoes', label: 'Observações' },
    {
      type: 'number',
      id: 'horas',
      label: LABEL_HORAS,
      section: 'Resumo da Intervenção',
      min: 0,
      step: 0.5,
      placeholder: '0',
    },
    {
      type: 'status_pills',
      id: 'estado_maquina',
      label: 'Estado Geral',
      section: 'Resumo da Intervenção',
      options: ['Operacional', 'Necessita Atenção', 'Inoperacional'],
    },
  ],
};

/** Template oficial — Manutenção Corretiva de Máquinas */
export const MANUTENCAO_CORRETIVA_MAQUINAS = {
  id: 'manutencao_corretiva_maquinas',
  title: 'Folha Manutenção Corretiva de Máquinas',
  label: 'Folha Manutenção Corretiva de Máquinas',
  icon: 'cog',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    { type: 'text', id: 'marca', label: LABEL_MARCA, section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: LABEL_MODELO, section: 'Informações da Máquina' },
    { type: 'text', id: 'numero_de_serie', label: LABEL_NUMERO_SERIE, section: 'Informações da Máquina' },
    { type: 'text', id: 'n_interno', label: LABEL_N_INTERNO, section: 'Informações da Máquina' },
    {
      type: 'verification_toggles',
      id: 'lista_de_verificacoes',
      label: 'Verificações Efetuadas',
      pdfTitle: 'Verificações Efetuadas',
      section: 'Verificações',
      items: [
        'Chassis',
        'Motor',
        'Direção',
        'Rodas',
        'Sinaléticas',
        'Mastro',
        'Bateria',
        'Sistema de travões',
        'Sistemas de segurança',
        'Lubrificação/Limpeza',
      ],
    },
    { type: 'textarea', id: 'observacoes', label: 'Observações' },
    {
      type: 'number',
      id: 'horas',
      label: LABEL_HORAS,
      section: 'Resumo da Intervenção',
      min: 0,
      step: 0.5,
      placeholder: '0',
    },
    {
      type: 'status_pills',
      id: 'estado_maquina',
      label: LABEL_ESTADO_MAQUINA,
      section: 'Resumo da Intervenção',
      options: ['Operacional', 'Inoperacional por Segurança', 'Aguardar Peças'],
    },
  ],
};

/** Template oficial — Manutenção Preventiva Bateria */
export const MANUTENCAO_PREVENTIVA_BATERIA = {
  id: 'manutencao_preventiva_bateria',
  title: 'Relatório de Manutenção Preventiva de Bateria',
  label: 'Relatório de Manutenção Preventiva de Bateria',
  icon: 'battery',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    ...BATERIA_IDENTITY_FIELD_DEFS,
    {
      type: 'status_pills',
      id: 'densidade',
      label: 'Densidade',
      section: 'Análise da Bateria',
      options: ['Normal', 'Irregular'],
    },
    {
      type: 'status_pills',
      id: 'tensao',
      label: 'Tensão',
      section: 'Análise da Bateria',
      options: ['Normal', 'Irregular'],
    },
    {
      type: 'number',
      id: 'tensao_media_elementos',
      label: 'Tensão Média de Elementos',
      section: 'Análise da Bateria',
      min: 0,
      step: 0.01,
      unit: 'V',
      placeholder: 'Ex: 2,10',
    },
    {
      type: 'status_pills',
      id: 'nivel_eletrolito',
      label: 'Nível de Eletrólito',
      section: 'Análise da Bateria',
      options: ['Normal', 'Baixo', 'Alto'],
    },
    { type: 'number', id: 'elementos_curto_circuito', label: 'Nº Elementos Em Curto Circuito', section: 'Análise da Bateria', min: 0, step: 1 },
    {
      type: 'multi_checkbox',
      id: 'estado_cofre',
      label: 'Estado do Cofre',
      section: 'Estado do Cofre',
      options: ['Inundada Por Eletrólito', 'Drenagem Do Cofre', 'Sulfatado', 'Furado'],
    },
    {
      type: 'toggle_component',
      id: 'ficha',
      label: 'Ficha',
      section: 'Componentes',
      options: ['Operacional', 'Danificada'],
    },
    {
      type: 'toggle_component',
      id: 'condutividade',
      label: 'Condutividade',
      section: 'Componentes',
      options: ['Operacional', 'Danificado'],
    },
    {
      type: 'toggle_component',
      id: 'parafusos',
      label: 'Parafusos',
      section: 'Componentes',
      options: ['Operacional', 'Danificados'],
    },
    {
      type: 'number',
      id: 'qtd_parafusos_danificados',
      label: 'Quantidade de parafusos danificados',
      section: 'Componentes',
      min: 0,
      step: 1,
      dependency: 'parafusos:Danificados',
    },
    {
      type: 'toggle_component',
      id: 'enchimento',
      label: 'Verificação do Enchimento',
      section: 'Componentes',
      options: ['Operacional', 'Danificado'],
    },
    {
      type: 'toggle_component',
      id: 'terminal_olhal',
      label: 'Terminal olhal',
      section: 'Componentes',
      options: ['Operacional', 'Danificados'],
    },
    createMaterialTableField({ id: 'consumiveis' }),
    {
      type: 'number',
      id: 'visitas_realizadas',
      label: 'N.º de Visitas',
      section: 'Número de Visitas e Tempo',
      min: 1,
      step: 1,
      placeholder: '1',
    },
    { type: 'number', id: 'horas', label: LABEL_HORAS, section: 'Número de Visitas e Tempo', min: 0, step: 0.5 },
    { type: 'textarea', id: 'observacao', label: 'Observações', section: 'Estado Final' },
    {
      type: 'status_pills',
      id: 'estado_final',
      label: 'Estado',
      section: 'Estado Final',
      options: ['Operacional', 'Necessita Elementos Novos', 'Inoperacional'],
    },
  ],
};

/** Tipos de máquina — Inspeção DL 50/2005 */
export const INSPECAO_DL50_TIPO_OPTIONS = [
  'Empilhador',
  'Stacker',
  'Porta Palete Elétrico',
  'Plataforma Elevatória',
  'Rebocador',
];

/** Tipos de equipamento — Recolha / Entrega no cliente */
export const MOVIMENTO_EQUIPAMENTO_TIPO_OPTIONS = [
  ...INSPECAO_DL50_TIPO_OPTIONS,
  'Carregador',
  'Bateria',
  'Outro',
];

/** Template oficial — Inspeção Decreto-Lei 50/2005 */
export const INSPECAO_DL50_2005 = {
  id: 'inspecao_dl50_2005',
  title: 'Inspeção da Máquina Decreto-Lei 50/2005',
  label: 'Inspeção da Máquina Decreto-Lei 50/2005',
  icon: 'clipboard',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    { type: 'text', id: 'marca', label: LABEL_MARCA, section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: LABEL_MODELO, section: 'Informações da Máquina' },
    {
      type: 'dropdown',
      id: 'tipo',
      label: LABEL_TIPO,
      section: 'Informações da Máquina',
      options: INSPECAO_DL50_TIPO_OPTIONS,
    },
    { type: 'text', id: 'numero_de_serie', label: LABEL_NUMERO_SERIE, section: 'Informações da Máquina' },
    { type: 'text', id: 'n_interno', label: LABEL_N_INTERNO, section: 'Informações da Máquina' },
    {
      type: 'number',
      id: 'horas',
      label: LABEL_HORAS,
      section: 'Informações da Máquina',
      min: 0,
      step: 1,
      placeholder: '0',
    },
    {
      type: 'number',
      id: 'data_fabrico',
      label: LABEL_ANO_FABRICO,
      section: 'Informações da Máquina',
      min: 1950,
      max: 2100,
      step: 1,
      placeholder: 'ex.: 2018',
    },
    {
      type: 'status_pills',
      id: 'periodicidade_inspecao',
      label: 'Periodicidade Inspeção',
      section: 'Periodicidade de Inspeção',
      options: ['Anual', 'Outra'],
    },
    {
      type: 'matrix_4options',
      id: 'pontos_inspecao',
      label: 'Pontos de Inspeção',
      options: ['B', 'N', 'D', 'N.A.'],
      categories: INSPECAO_DL50_CATEGORIES,
    },
    {
      type: 'textarea',
      id: 'observacoes',
      label: 'Observações',
      rows: 5,
      placeholder: 'Descreva as reparações recomendadas ou outras notas relevantes…',
    },
    {
      type: 'choice',
      id: 'pedido_orcamento',
      label: 'Pedido de Orçamento',
      section: 'Pedido de Orçamento',
      options: ['Não', 'Sim'],
      uiVariant: 'yesNo',
    },
    {
      type: 'textarea',
      id: 'detalhe_pedido_orcamento',
      label: 'O que é necessário',
      section: 'Pedido de Orçamento',
      dependency: 'pedido_orcamento:Sim',
      rows: 4,
      placeholder: 'Descreva peças, trabalhos ou observações para o orçamento…',
    },
    {
      type: 'legal_verdict',
      id: 'declaracao_seguranca',
      label: 'Declaração de Segurança',
      options: INSPECAO_DL50_LEGAL_OPTIONS,
    },
  ],
};

/** Campos por máquina — checklist, material e estado (preventiva empilhadores). */
export const EMPILHADORES_PER_MACHINE_FIELD_DEFS = [
  {
    type: 'verification_toggles',
    id: 'componentes_externos',
    label: 'Componentes Externos',
    pdfTitle: 'Verificações Externas',
    section: 'Verificações Externas',
    collapsible: true,
    defaultOpen: true,
    items: VERIFICACOES_EXTERNAS_ITEMS,
  },
  {
    type: 'verification_toggles',
    id: 'componentes_internos',
    label: 'Componentes Internos',
    pdfTitle: 'Verificações Internas',
    section: 'Verificações Internas',
    collapsible: true,
    defaultOpen: false,
    items: VERIFICACOES_INTERNAS_ITEMS,
  },
  {
    type: 'number',
    id: 'litros_oleo_diferencial',
    label: 'Litros Óleo Diferencial',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 0.1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'litros_oleo_torque',
    label: 'Litros Óleo Torque',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 0.1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'litros_oleo_hidraulico',
    label: 'Litros Óleo Hidráulico',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 0.1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'litros_oleo_travoes',
    label: 'Litros Óleo Travões',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 0.1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'litros_oleo_motor',
    label: 'Litros Óleo Motor',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 0.1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'qtd_filtro_oleo_motor',
    label: 'Quantidade Filtro Óleo Motor',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'qtd_filtro_ar',
    label: 'Quantidade Filtro Ar',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'qtd_filtro_combustivel',
    label: 'Quantidade Filtro Combustível',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'qtd_kit_gaseificador',
    label: 'Quantidade Kit Gaseificador',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 1,
    uiVariant: 'material',
  },
  {
    type: 'number',
    id: 'qtd_limpeza_lubrificante',
    label: 'Quantidade Limpeza e Lubrificante',
    section: EMPILHADORES_MATERIAL_SECTION,
    min: 0,
    step: 1,
    uiVariant: 'material',
  },
  { type: 'textarea', id: 'observacoes', label: 'Observações' },
  {
    type: 'status_pills',
    id: 'estado_maquina',
    label: 'Estado',
    section: 'Estado da Máquina',
    options: ['Operacional', 'Inoperacional por Segurança', 'Aguardar Peças'],
  },
];

/** Template oficial — Manutenção Preventiva Empilhadores */
export const MANUTENCAO_PREVENTIVA_EMPILHADORES = {
  id: 'manutencao_preventiva_empilhadores',
  title: 'Relatório de Manutenção Preventiva de Empilhadores',
  label: 'Relatório de Manutenção Preventiva de Empilhadores',
  icon: 'shield',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    { type: 'text', id: 'marca', label: LABEL_MARCA, section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: LABEL_MODELO, section: 'Informações da Máquina' },
    { type: 'text', id: 'numero_de_serie', label: LABEL_NUMERO_SERIE, section: 'Informações da Máquina' },
    { type: 'text', id: 'n_interno', label: LABEL_N_INTERNO, section: 'Informações da Máquina' },
    {
      type: 'number',
      id: 'horas',
      label: LABEL_HORAS,
      section: 'Informações da Máquina',
      min: 0,
      step: 1,
      placeholder: '0',
    },
  ],
};

/** Template oficial — Reparação Carregador */
export const REPARACAO_CARREGADOR = {
  id: 'reparacao_carregador',
  title: 'Relatório Reparação Carregador',
  label: 'Relatório Reparação Carregador',
  icon: 'bolt',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_rececao', label: 'Data de Receção', section: 'Identificação Cliente' },
    { type: 'text', id: 'etiqueta', label: LABEL_ETIQUETA, section: 'Identificação Cliente' },
    { type: 'text', id: 'marca_modelo', label: LABEL_MARCA_MODELO, section: 'Identificação Do Carregador' },
    { type: 'text', id: 'numero_de_serie', label: LABEL_NUMERO_SERIE, section: 'Identificação Do Carregador' },
    {
      type: 'dynamic_table',
      id: 'registo_intervencao',
      label: 'Registo de Intervenção',
      section: 'Registo de Intervenção',
      columns: ['Data Intervenção', 'Serviço Efectuado/ Equipamento', LABEL_HORAS, 'Técnico'],
      columnTypes: { data_intervencao: 'date', horas: 'number' },
      newRowDefaults: {
        data_intervencao: '$jobDate',
        servico_efectuado_equipamento: '',
        horas: '',
        tecnico: '$technician',
      },
      addButtonLabel: 'Adicionar Intervenção',
      tableVariant: 'intervention',
    },
    {
      type: 'dynamic_table',
      id: 'resultado_teste',
      label: 'Resultado do Teste',
      section: 'Resultado do Teste',
      columns: ['Valor da amperagem debitado', 'Equipamento'],
      tableVariant: 'carregador_test',
      addButtonLabel: 'Adicionar linha',
      newRowDefaults: {
        valor_da_amperagem_debitado: '',
        equipamento: '',
      },
    },
    createMaterialTableField({
      id: 'consumiveis_material',
      section: 'Consumíveis',
      label: 'Consumíveis',
      columns: [
        { id: 'artigo', label: 'Material Colocado' },
        { id: 'qtd', label: 'Quantidade' },
      ],
    }),
    { type: 'date', id: 'concluido_testado_em', label: 'Concluído e Testado Em', section: 'Fecho' },
    { type: 'text', id: 'responsavel', label: 'Responsável', section: 'Fecho' },
  ],
};

/** Template oficial — Reparação Avarias Bateria */
export const REPARACAO_AVARIAS_BATERIA = {
  id: 'reparacao_avarias_bateria',
  title: 'Relatório Reparação Avarias Bateria',
  label: 'Relatório Reparação Avarias Bateria',
  icon: 'battery',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    ...BATERIA_IDENTITY_FIELD_DEFS,
    createMaterialTableField({ id: 'consumiveis' }),
    {
      type: 'number',
      id: 'visitas_realizadas',
      label: 'N.º de Visitas',
      section: 'Número de Visitas e Tempo',
      min: 1,
      step: 1,
      placeholder: '1',
    },
    { type: 'number', id: 'horas', label: LABEL_HORAS, section: 'Número de Visitas e Tempo', min: 0, step: 0.5 },
    {
      type: 'choice',
      id: 'pedido_orcamento',
      label: 'Pedido de Orçamento',
      section: 'Pedido de Orçamento',
      options: ['Não', 'Sim'],
      uiVariant: 'yesNo',
    },
    {
      type: 'textarea',
      id: 'detalhe_pedido_orcamento',
      label: 'O que é necessário',
      section: 'Pedido de Orçamento',
      dependency: 'pedido_orcamento:Sim',
      rows: 4,
      placeholder: 'Descreva peças, trabalhos ou observações para o orçamento…',
    },
    { type: 'textarea', id: 'observacao', label: 'Observação', section: 'Estado final', rows: 4 },
    {
      type: 'status_pills',
      id: 'estado_final',
      label: 'Estado',
      section: 'Estado final',
      options: ['Reparação Concluída', 'Necessita Elementos Novos', 'Inoperacional'],
    },
  ],
};

/** Template oficial — Recolha / Entrega de material ou equipamento no cliente */
export const MOVIMENTO_MATERIAL_CLIENTE = {
  id: 'movimento_material_cliente',
  title: 'Registo de Recolha / Entrega no Cliente',
  label: 'Recolha / Entrega no Cliente',
  icon: 'truck',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    {
      type: 'status_pills',
      id: 'tipo_movimento',
      label: 'Tipo de movimento',
      section: 'Movimento',
      options: ['Recolha', 'Entrega'],
    },
    { type: 'date', id: 'data_movimento', label: 'Data', section: 'Movimento' },
    {
      type: 'dropdown',
      id: 'tipo',
      label: LABEL_TIPO,
      section: 'Equipamento',
      options: MOVIMENTO_EQUIPAMENTO_TIPO_OPTIONS,
    },
    {
      type: 'text',
      id: 'tipo_outro',
      label: 'Especificar tipo',
      section: 'Equipamento',
      dependency: 'tipo:Outro',
      placeholder: 'Descreva o equipamento movimentado',
    },
    {
      type: 'text',
      id: 'n_interno',
      label: LABEL_N_INTERNO,
      section: 'Equipamento',
    },
    {
      type: 'textarea',
      id: 'observacoes',
      label: 'Observações',
      section: 'Observações',
      rows: 4,
      placeholder: 'Estado do material, acessórios, instruções do cliente…',
    },
  ],
};

/** 9 templates oficiais — suite completa ManuSilva */
export const reportTemplates = [
  FOLHA_INTERVENCAO_AVARIAS,
  MANUTENCAO_BATERIAS_GRANDES,
  MANUTENCAO_CORRETIVA_MAQUINAS,
  MANUTENCAO_PREVENTIVA_BATERIA,
  INSPECAO_DL50_2005,
  MANUTENCAO_PREVENTIVA_EMPILHADORES,
  REPARACAO_CARREGADOR,
  REPARACAO_AVARIAS_BATERIA,
  MOVIMENTO_MATERIAL_CLIENTE,
];

export const PDF_DOCUMENT_TITLES = {
  folha_intervencao_avarias: 'FOLHA DE INTERVENÇÃO DE AVARIAS',
  reparacao_avarias_bateria: 'RELATÓRIO REPARAÇÃO AVARIAS BATERIA',
  reparacao_carregador: 'RELATÓRIO REPARAÇÃO CARREGADOR',
  manutencao_preventiva_empilhadores: 'RELATÓRIO DE MANUTENÇÃO PREVENTIVA DE EMPILHADORES',
  inspecao_dl50_2005: 'INSPEÇÃO DA MÁQUINA DECRETO-LEI 50/2005',
  manutencao_preventiva_bateria: 'RELATÓRIO DE MANUTENÇÃO PREVENTIVA DE BATERIA',
  manutencao_baterias_grandes: 'FORMULÁRIO MANUTENÇÃO BATERIAS CLIENTES GRANDES',
  manutencao_corretiva_maquinas: 'FOLHA MANUTENÇÃO CORRETIVA DE MÁQUINAS',
  movimento_material_cliente: 'REGISTO DE RECOLHA / ENTREGA NO CLIENTE',
};

/**
 * Identificador Supabase Auth — a Filipa entra só com o nome «Filipa» + palavra-passe.
 * Domínio fictício partilhado com outros utilizadores sem e-mail real.
 */
export const FILIPA_AUTH_EMAIL = 'filipa@sistema.com';

/** Login partilhado do PC da oficina — o responsável escolhe-se na folha de obra. */
export const ARMAZEM_AUTH_EMAIL = 'armazem@sistema.com';

/** E-mail legado (contas criadas antes da migração para @sistema.com). */
export const FILIPA_LEGACY_AUTH_EMAIL = 'filipa@rh.manusilva.internal';

/** Tabela `utilizadores` — roles base: `Tecnico` | `RH` */
export const UTILIZADORES = [
  { nome: 'Hugo', nif: '236465767', telemovel: '917715182', email: 'filipasilvahugo2013@gmail.com', role: 'Tecnico', technicianId: 'tech-1' },
  { nome: 'Filipe', nif: '231912250', telemovel: '910858928', email: 'filipeg409@gmail.com', role: 'Tecnico', technicianId: 'tech-2' },
  { nome: 'Adelton', nif: '323438199', telemovel: '937123479', email: 'adeltonair@gmail.com', role: 'Tecnico', technicianId: 'tech-3' },
  {
    nome: 'Armazém',
    nif: null,
    telemovel: null,
    email: ARMAZEM_AUTH_EMAIL,
    role: 'Armazem',
    semEmailPessoal: true,
  },
  { nome: 'Joana', nif: '240563077', telemovel: '910587126', email: 'joanamaia97@gmail.com', role: 'RH' },
  {
    nome: 'Filipa',
    nif: null,
    telemovel: '910249947',
    email: FILIPA_AUTH_EMAIL,
    role: 'RH',
    semEmailPessoal: true,
  },
];

export const ROLE_UI_TO_DB = { technician: 'Tecnico', warehouse: 'Armazem', admin: 'RH' };
export const ROLE_DB_TO_UI = { Tecnico: 'technician', Armazem: 'warehouse', RH: 'admin' };

const TECHNICIAN_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4'];

export const TECHNICIANS = UTILIZADORES.filter((u) => u.role === 'Tecnico').map((u, i) => ({
  id: u.technicianId,
  name: u.nome,
  nif: u.nif,
  email: u.email,
  phone: u.telemovel,
  color: TECHNICIAN_COLORS[i % TECHNICIAN_COLORS.length],
}));

/**
 * Metadados locais (empilhadores) para trabalhos/relatórios demo — não substitui o Supabase.
 */
export const DEMO_CLIENT_FORKLIFTS = {
  'cli-1': {
    Nome: 'Empresa Órgãos Hidráulicos Lda',
    NIF: '501234567',
    forklifts: [
      {
        serial: 'FL-2021-0045',
        model: 'Toyota 8FBMT25',
        history: [
          { date: '2025-01-10', service: 'Manutenção preventiva bateria', type: 'manutencao_preventiva_bateria' },
          { date: '2024-11-05', service: 'Inspeção Decreto-Lei 50/2005', type: 'inspecao_dl50_2005' },
        ],
      },
      {
        serial: 'FL-2019-0112',
        model: 'Linde E25',
        history: [
          { date: '2024-12-18', service: 'Reparação carregador', type: 'reparacao_carregador' },
        ],
      },
    ],
  },
  'cli-2': {
    Nome: 'Logística do Norte S.A.',
    NIF: '502987654',
    forklifts: [
      {
        serial: 'FL-2020-0078',
        model: 'Hyster H2.5FT',
        history: [
          { date: '2025-02-14', service: 'Folha de Intervenção de Avarias', type: 'folha_intervencao_avarias' },
          { date: '2024-10-01', service: 'Manutenção corretiva de máquinas', type: 'manutencao_corretiva_maquinas' },
        ],
      },
    ],
  },
  'cli-3': {
    Nome: 'Distribuição Atlântico Lda',
    NIF: '503456789',
    forklifts: [
      {
        serial: 'FL-2022-0033',
        model: 'Jungheinrich EFG 320',
        history: [
          { date: '2025-03-01', service: 'Manutenção preventiva empilhadores', type: 'manutencao_preventiva_empilhadores' },
        ],
      },
      {
        serial: 'FL-2018-0099',
        model: 'Still RX20-16',
        history: [
          { date: '2024-09-15', service: 'Reparação avarias bateria', type: 'reparacao_avarias_bateria' },
        ],
      },
      {
        serial: 'FL-2023-0017',
        model: 'Crown SC 5245-40',
        history: [
          { date: '2025-04-01', service: 'Manutenção baterias clientes grandes', type: 'manutencao_baterias_grandes' },
        ],
      },
    ],
  },
};

/** Vista compatível para jobs, PDF e dashboards */
export function mapClientToLegacy(record) {
  const morada = record.Morada ?? record.morada ?? '';
  const cp = record['Código postal'] ?? record.codigo_postal ?? record.codigoPostal ?? '';
  const loc = record.Localidade ?? record.localidade ?? '';
  const address = [morada, cp, loc].filter(Boolean).join(', ');
  const nome = record.Nome ?? record.name ?? record.nome_empresa ?? '';
  const nif = record.NIF ?? record.nif ?? '';
  const email = record['E-mail'] ?? record.email ?? '';
  const telemovel = record.Telemovel ?? record.telemovel ?? record.phone ?? '';
  return {
    id: record.id,
    Nome: nome,
    NIF: nif,
    'E-mail': email,
    Telemovel: telemovel,
    Morada: morada,
    'Código postal': cp,
    Localidade: loc,
    'País/Região': record['País/Região'] ?? record.pais ?? 'Portugal',
    name: nome,
    nif,
    email,
    phone: telemovel,
    telemovel,
    address,
    morada,
    codigoPostal: cp,
    localidade: loc,
    pais: record['País/Região'] ?? record.pais ?? 'Portugal',
    condicao_pagamento: record.condicao_pagamento ?? record.condicaoPagamento ?? '',
    plus_code: record.plusCode ?? record.plus_code ?? '',
    plusCode: record.plusCode ?? record.plus_code ?? '',
    zona_rota: record.zonaRota ?? record.zona_rota ?? '',
    zonaRota: record.zonaRota ?? record.zona_rota ?? '',
    ehTeste: record.ehTeste === true || record.eh_teste === true,
    eh_teste: record.ehTeste === true || record.eh_teste === true,
    forklifts: record.forklifts || [],
  };
}

export const CLIENTS = [];

/** Tipos de serviço disponíveis (8 relatórios oficiais) */
export const SERVICE_TYPES = [...reportTemplates];

export const JOB_STATUSES = {
  scheduled: { label: 'Agendado', badgeVariant: 'scheduled' },
  in_progress: { label: 'Agendado', badgeVariant: 'scheduled' },
  pending_parts: { label: 'Agendado', badgeVariant: 'scheduled' },
  rejected: { label: 'Rejeitado', badgeVariant: 'rejected' },
  completed: { label: 'Concluído', badgeVariant: 'approved' },
};

function getWeekDates(baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(dt.toISOString().split('T')[0]);
  }
  return dates;
}

const weekDates = getWeekDates();

export const INITIAL_JOBS = [
  { id: 'job-1', technicianId: 'tech-1', clientId: 'cli-1', forkliftSerial: 'FL-2021-0045', serviceType: 'reparacao_avarias_bateria', date: weekDates[0], time: '09:00', status: 'scheduled', rejectionNote: null },
  { id: 'job-2', technicianId: 'tech-1', clientId: 'cli-2', forkliftSerial: 'FL-2020-0078', serviceType: 'folha_intervencao_avarias', date: weekDates[0], time: '14:30', status: 'in_progress', rejectionNote: null },
  { id: 'job-3', technicianId: 'tech-1', clientId: 'cli-3', forkliftSerial: 'FL-2022-0033', serviceType: 'manutencao_preventiva_empilhadores', date: weekDates[1], time: '10:00', status: 'pending_parts', rejectionNote: null },
  { id: 'job-4', technicianId: 'tech-1', clientId: 'cli-1', forkliftSerial: 'FL-2019-0112', serviceType: 'reparacao_carregador', date: weekDates[2], time: '08:30', status: 'rejected', rejectionNote: 'Falta indicar a amperagem debitada no teste e anexar foto da placa do carregador.' },
  { id: 'job-5', technicianId: 'tech-1', clientId: 'cli-3', forkliftSerial: 'FL-2023-0017', serviceType: 'inspecao_dl50_2005', date: weekDates[3], time: '11:00', status: 'completed', rejectionNote: null },
  { id: 'job-6', technicianId: 'tech-2', clientId: 'cli-2', forkliftSerial: 'FL-2020-0078', serviceType: 'manutencao_corretiva_maquinas', date: weekDates[0], time: '09:30', status: 'scheduled', rejectionNote: null },
  { id: 'job-7', technicianId: 'tech-2', clientId: 'cli-3', forkliftSerial: 'FL-2018-0099', serviceType: 'manutencao_preventiva_bateria', date: weekDates[1], time: '15:00', status: 'in_progress', rejectionNote: null },
  { id: 'job-8', technicianId: 'tech-3', clientId: 'cli-3', forkliftSerial: 'FL-2023-0017', serviceType: 'manutencao_baterias_grandes', date: weekDates[2], time: '13:00', status: 'scheduled', rejectionNote: null },
  { id: 'job-9', technicianId: 'tech-3', clientId: 'cli-3', forkliftSerial: 'FL-2023-0017', serviceType: 'folha_intervencao_avarias', date: weekDates[4], time: '10:30', status: 'scheduled', rejectionNote: null },
  { id: 'job-10', technicianId: 'tech-3', clientId: 'cli-3', forkliftSerial: 'FL-2022-0033', serviceType: 'manutencao_preventiva_empilhadores', date: weekDates[0], time: '16:00', status: 'completed', rejectionNote: null },
];

export const INITIAL_REPORTS = [
  {
    id: 'rep-1',
    jobId: 'job-2',
    technicianId: 'tech-1',
    clientId: 'cli-2',
    forkliftSerial: 'FL-2020-0078',
    serviceType: 'folha_intervencao_avarias',
    status: 'pending_review',
    submittedAt: new Date().toISOString(),
    data: {
      values: {
        data_1: weekDates[0],
        data_2: weekDates[0],
        deslocacao: 38,
        marca: 'Hyster',
        modelo: 'H2.5FT',
        numero_de_serie: 'FL-2020-0078',
        detecao_de_avaria: 'Falha no contactor principal do circuito de elevação. Máquina parada.',
        resolucao_da_avaria: 'Substituição do contactor e testes de funcionamento do elevador.',
        material_utilizado: [
          { artigo: 'Contactor 48V', qtd: '1' },
          { artigo: 'Bornes e cabo de comando 2m', qtd: '1' },
        ],
        horas_gastas: 3.5,
        estado_maquina: 'Aguardar Intervenção',
      },
      signatures: { technician: true, client: true },
      photos: [{ id: 'ph-1', label: 'Contactor danificado' }, { id: 'ph-2', label: 'Display de erros' }],
    },
    rejectionNote: null,
  },
  {
    id: 'rep-2',
    jobId: 'job-4',
    technicianId: 'tech-1',
    clientId: 'cli-1',
    forkliftSerial: 'FL-2019-0112',
    serviceType: 'reparacao_carregador',
    status: 'rejected',
    submittedAt: new Date(Date.now() - 86400000).toISOString(),
    data: {
      values: {
        data_rececao: weekDates[2],
        concluido_testado_em: weekDates[2],
        cliente: 'Empresa Órgãos Hidráulicos Lda',
        etiqueta: 'CHG-2019-0112',
        responsavel: 'Armazém',
        marca_modelo: 'Linde 48V / 80A',
        numero_de_serie: 'FL-2019-0112',
        registo_intervencao: [
          {
            data_intervencao: weekDates[2],
            servico_efectuado_equipamento: 'Diagnóstico placa e cabos de carga',
            horas: '2',
            tecnico: 'Hugo',
          },
        ],
        resultado_teste: [{ valor_da_amperagem_debitado: '75 A', equipamento: 'Carregador Linde 48V' }],
        consumiveis_material: [{ artigo: 'Cabo de carga', qtd: '1' }],
      },
      signatures: { technician: true, client: true },
      photos: [],
    },
    rejectionNote: 'Falta indicar a corrente de saída medida e anexar foto da placa do carregador.',
  },
  {
    id: 'rep-3',
    jobId: 'job-7',
    technicianId: 'tech-2',
    clientId: 'cli-3',
    forkliftSerial: 'FL-2018-0099',
    serviceType: 'manutencao_preventiva_bateria',
    status: 'approved',
    submittedAt: new Date(Date.now() - 172800000).toISOString(),
    data: {
      values: {
        data_de_conclusao: weekDates[1],
        estado_maquina: 'Operacional',
      },
      signatures: { technician: true, client: true },
      photos: [{ id: 'ph-b1', label: 'Estado das células' }],
    },
    rejectionNote: null,
  },
];

export function seedDatabase() {
  const STORAGE_KEY = 'manusilva_db';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const db = JSON.parse(stored);
      if (db.schemaVersion === SCHEMA_VERSION) return;
      if (db.schemaVersion === 15) {
        db.jobs = [];
        db.reports = [];
        db.schemaVersion = SCHEMA_VERSION;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        return;
      }
      if (db.schemaVersion === 16) {
        db.reports = [];
        db.schemaVersion = SCHEMA_VERSION;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        return;
      }
    } catch {
      /* reseed */
    }
  }

  const db = {
    schemaVersion: SCHEMA_VERSION,
    jobs: [],
    reports: [],
    clients: [],
    technicians: TECHNICIANS,
    utilizadores: UTILIZADORES,
    offlineQueue: [],
    settings: { offline: false },
    seededAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/** Força recarga dos 8 relatórios (útil após atualização de schema) */
export function resetDatabase() {
  localStorage.removeItem('manusilva_db');
  seedDatabase();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('manusilva-db-reset'));
  }
}
