/**
 * Manusilva PWA — Mock Database (8 relatórios oficiais)
 */

import { INSPECAO_DL50_CATEGORIES, INSPECAO_DL50_LEGAL_OPTIONS } from './inspecao-dl50-categories.js';
import {
  VERIFICACOES_EXTERNAS_ITEMS,
  VERIFICACOES_INTERNAS_ITEMS,
} from './preventiva-empilhadores-items.js';

export const SCHEMA_VERSION = 17;

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
  icon: '🔧',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_1', label: 'Data 1', section: 'Datas de Intervenção' },
    { type: 'date', id: 'data_2', label: 'Data 2', section: 'Datas de Intervenção' },
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão', section: 'Datas de Intervenção' },
    { type: 'text', id: 'deslocacao', label: 'Deslocação' },
    { type: 'text', id: 'marca', label: 'Marca', section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: 'Modelo', section: 'Informações da Máquina' },
    { type: 'text', id: 'numero_de_serie', label: 'Número de Série', section: 'Informações da Máquina' },
    { type: 'text', id: 'n_interno', label: 'Nº Interno', section: 'Informações da Máquina' },
    { type: 'number', id: 'horas', label: 'Horas', section: 'Informações da Máquina', min: 0, step: 1 },
    { type: 'textarea', id: 'detecao_de_avaria', label: 'Deteção de Avaria' },
    { type: 'textarea', id: 'resolucao_da_avaria', label: 'Resolução da Avaria' },
    { type: 'textarea', id: 'material_utilizado', label: 'Material Utilizado' },
    { type: 'number', id: 'horas_gastas', label: 'Horas Gastas', min: 0, step: 0.5 },
    {
      type: 'status_pills',
      id: 'estado_maquina',
      label: 'Estado Em Que Ficou a Máquina',
      options: ['Apta a Trabalhar', 'Aguardar Intervenção', 'Pedido de Orçamento'],
    },
  ],
};

/** Template oficial — Clientes Grandes */
export const MANUTENCAO_BATERIAS_GRANDES = {
  id: 'manutencao_baterias_grandes',
  title: 'Formulário Manutenção Baterias Clientes Grandes',
  label: 'Formulário Manutenção Baterias Clientes Grandes',
  icon: '🏭',
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
    {
      type: 'dynamic_table',
      id: 'consumiveis_utilizados',
      label: 'Consumíveis Utilizados',
      section: 'Consumíveis',
      columns: ['Material', 'Quantidade', 'Tipo'],
    },
    { type: 'textarea', id: 'observacoes', label: 'Observações' },
  ],
};

/** Template oficial — Manutenção Corretiva de Máquinas */
export const MANUTENCAO_CORRETIVA_MAQUINAS = {
  id: 'manutencao_corretiva_maquinas',
  title: 'Folha Manutenção Corretiva de Máquinas',
  label: 'Folha Manutenção Corretiva de Máquinas',
  icon: '⚙️',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    { type: 'text', id: 'marca', label: 'Marca', section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: 'Modelo', section: 'Informações da Máquina' },
    { type: 'text', id: 'numero_de_serie', label: 'Número de Série', section: 'Informações da Máquina' },
    {
      type: 'verification_toggles',
      id: 'lista_de_verificacoes',
      label: 'Lista de Verificações',
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
  ],
};

/** Template oficial — Manutenção Preventiva Bateria */
export const MANUTENCAO_PREVENTIVA_BATERIA = {
  id: 'manutencao_preventiva_bateria',
  title: 'Relatório Manutenção Preventiva Bateria',
  label: 'Relatório Manutenção Preventiva Bateria',
  icon: '🔋',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    { type: 'text', id: 'densidade', label: 'Densidade', section: 'Análise Da Bateria' },
    {
      type: 'status_pills',
      id: 'tensao',
      label: 'Tensão',
      section: 'Análise Da Bateria',
      options: ['Normal', 'Irregular'],
    },
    { type: 'text', id: 'tensao_media_elementos', label: 'Tensão Média de Elementos', section: 'Análise Da Bateria' },
    {
      type: 'status_pills',
      id: 'nivel_eletrolito',
      label: 'Nível de Eletrólito',
      section: 'Análise Da Bateria',
      options: ['Normal', 'Baixo', 'Alto'],
    },
    { type: 'number', id: 'elementos_curto_circuito', label: 'Nº Elementos Em Curto Circuito', section: 'Análise Da Bateria', min: 0, step: 1 },
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
    {
      type: 'dynamic_table',
      id: 'consumiveis',
      label: 'Consumíveis',
      section: 'Consumíveis',
      columns: ['Material', 'Quantidade'],
      tableVariant: 'consumables',
      addButtonLabel: 'Adicionar Material',
    },
    { type: 'text', id: 'deslocacao', label: 'Deslocação', section: 'Deslocação e Tempo' },
    { type: 'number', id: 'horas', label: 'Horas', section: 'Deslocação e Tempo', min: 0, step: 0.5 },
    { type: 'textarea', id: 'observacao', label: 'Observação' },
    { type: 'text', id: 'estado_final', label: 'Estado Final', section: 'Estado final' },
  ],
};

/** Template oficial — Inspeção Decreto-Lei 50/2005 */
export const INSPECAO_DL50_2005 = {
  id: 'inspecao_dl50_2005',
  title: 'Inspeção da Máquina Decreto-Lei 50-2005',
  label: 'Inspeção da Máquina Decreto-Lei 50-2005',
  icon: '📋',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    { type: 'text', id: 'marca', label: 'Marca', section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: 'Modelo', section: 'Informações da Máquina' },
    { type: 'text', id: 'numero_de_serie', label: 'Nº Série', section: 'Informações da Máquina' },
    { type: 'date', id: 'data_fabrico', label: 'Data Fabrico', section: 'Informações da Máquina' },
    {
      type: 'status_pills',
      id: 'periodicidade_inspecao',
      label: 'Periodicidade Inspeção',
      section: 'Periodicidade Inspeção',
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
      type: 'legal_verdict',
      id: 'declaracao_seguranca',
      label: 'Declaração de Segurança',
      options: INSPECAO_DL50_LEGAL_OPTIONS,
    },
  ],
};

/** Template oficial — Manutenção Preventiva Empilhadores */
export const MANUTENCAO_PREVENTIVA_EMPILHADORES = {
  id: 'manutencao_preventiva_empilhadores',
  title: 'Relatório Manutenção Preventiva Empilhadores',
  label: 'Relatório Manutenção Preventiva Empilhadores',
  icon: '🛡️',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    { type: 'text', id: 'marca', label: 'Marca', section: 'Informações da Máquina' },
    { type: 'text', id: 'modelo', label: 'Modelo', section: 'Informações da Máquina' },
    { type: 'text', id: 'numero_de_serie', label: 'Nº Série', section: 'Informações da Máquina' },
    { type: 'number', id: 'horas', label: 'Horas', section: 'Informações da Máquina', min: 0, step: 1 },
    { type: 'text', id: 'n_interno', label: 'Nº Interno', section: 'Informações da Máquina' },
    {
      type: 'verification_toggles',
      id: 'componentes_externos',
      label: 'Componentes Externos',
      section: 'Verificações Externas',
      collapsible: true,
      defaultOpen: true,
      items: VERIFICACOES_EXTERNAS_ITEMS,
    },
    {
      type: 'verification_toggles',
      id: 'componentes_internos',
      label: 'Componentes Internos',
      section: 'Verificações Internas',
      collapsible: true,
      defaultOpen: false,
      items: VERIFICACOES_INTERNAS_ITEMS,
    },
    {
      type: 'number',
      id: 'litros_oleo_diferencial',
      label: 'Litros Óleo Diferencial',
      section: 'Substituição de Material',
      min: 0,
      step: 0.1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'litros_oleo_torque',
      label: 'Litros Óleo Torque',
      section: 'Substituição de Material',
      min: 0,
      step: 0.1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'litros_oleo_hidraulico',
      label: 'Litros Óleo Hidráulico',
      section: 'Substituição de Material',
      min: 0,
      step: 0.1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'litros_oleo_travoes',
      label: 'Litros Óleo Travões',
      section: 'Substituição de Material',
      min: 0,
      step: 0.1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'litros_oleo_motor',
      label: 'Litros Óleo Motor',
      section: 'Substituição de Material',
      min: 0,
      step: 0.1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'qtd_filtro_oleo_motor',
      label: 'Quantidade Filtro Óleo Motor',
      section: 'Substituição de Material',
      min: 0,
      step: 1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'qtd_filtro_ar',
      label: 'Quantidade Filtro Ar',
      section: 'Substituição de Material',
      min: 0,
      step: 1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'qtd_filtro_combustivel',
      label: 'Quantidade Filtro Combustível',
      section: 'Substituição de Material',
      min: 0,
      step: 1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'qtd_kit_gaseificador',
      label: 'Quantidade Kit Gaseificador',
      section: 'Substituição de Material',
      min: 0,
      step: 1,
      uiVariant: 'material',
    },
    {
      type: 'number',
      id: 'qtd_limpeza_lubrificante',
      label: 'Quantidade Limpeza e Lubrificante',
      section: 'Substituição de Material',
      min: 0,
      step: 1,
      uiVariant: 'material',
    },
    { type: 'textarea', id: 'observacoes', label: 'Observações' },
    {
      type: 'toggle',
      id: 'pedir_orcamento_adicional',
      label: 'Pedir Orçamento Adicional?',
      onValue: 'Sim',
      offValue: 'Não',
    },
    {
      type: 'status_pills',
      id: 'estado_maquina',
      label: 'Estado da Máquina',
      options: ['Operacional', 'Inoperacional por Segurança', 'Aguardar Peças'],
    },
  ],
};

/** Template oficial — Reparação Carregador */
export const REPARACAO_CARREGADOR = {
  id: 'reparacao_carregador',
  title: 'Relatório Reparação Carregador',
  label: 'Relatório Reparação Carregador',
  icon: '⚡',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_rececao', label: 'Data de Receção', section: 'Logística' },
    { type: 'date', id: 'concluido_testado_em', label: 'Concluído e Testado Em', section: 'Logística' },
    { type: 'client_combobox', id: 'cliente', label: 'Cliente', section: 'Identificação Cliente' },
    { type: 'text', id: 'nif', label: 'NIF', section: 'Identificação Cliente' },
    { type: 'text', id: 'morada', label: 'Morada', section: 'Identificação Cliente' },
    { type: 'text', id: 'localidade', label: 'Localidade', section: 'Identificação Cliente' },
    { type: 'text', id: 'etiqueta', label: 'Etiqueta', section: 'Identificação Cliente' },
    { type: 'text', id: 'responsavel', label: 'Responsável', section: 'Identificação Cliente' },
    { type: 'text', id: 'marca_modelo', label: 'Marca/Modelo', section: 'Identificação Do Carregador' },
    { type: 'text', id: 'numero_de_serie', label: 'Número de Série', section: 'Identificação Do Carregador' },
    {
      type: 'dynamic_table',
      id: 'registo_intervencao',
      label: 'Registo de Intervenção',
      section: 'Registo de Intervenção',
      columns: ['Data Intervenção', 'Serviço Efectuado/ Equipamento', 'Horas', 'Tecnico'],
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
      type: 'text',
      id: 'valor_amperagem_debitado',
      label: 'Valor da amperagem debitado',
      section: 'Resultado do Teste',
      placeholder: 'Ex: 75 A',
    },
    {
      type: 'dynamic_table',
      id: 'consumiveis_material',
      label: 'Consumíveis (Material Colocado)',
      section: 'Consumíveis',
      columns: ['Equipamento', 'Quantidade'],
      columnTypes: { quantidade: 'number' },
      addButtonLabel: 'Adicionar Material',
      tableVariant: 'consumables',
    },
  ],
};

/** Template oficial — Reparação Avarias Bateria */
export const REPARACAO_AVARIAS_BATERIA = {
  id: 'reparacao_avarias_bateria',
  title: 'Relatório Reparação Avarias Bateria',
  label: 'Relatório Reparação Avarias Bateria',
  icon: '🔋',
  companyName: 'ManuSilva Manutenção Industrial, Unipessoal, Lda',
  companyAddress: 'Rua São Mamede, Lote Nº1 - Fração D, 4760-725 Ribeirão VNF',
  fields: [
    { type: 'date', id: 'data_de_conclusao', label: 'Data de Conclusão' },
    {
      type: 'textarea',
      id: 'analise_da_bateria',
      label: 'Análise Da Bateria',
      section: 'Diagnóstico Técnico',
      prominent: true,
      placeholder:
        'Descreva sintomas, elementos danificados, voltagem do banco, densidade do eletrólito, ligações/pontes e diagnóstico técnico...',
    },
    {
      type: 'dynamic_table',
      id: 'consumiveis',
      label: 'Consumíveis',
      section: 'Material Aplicado',
      columns: ['Material', 'Quantidade'],
      columnTypes: { quantidade: 'number' },
      addButtonLabel: 'Adicionar Material',
      tableVariant: 'consumables',
    },
    { type: 'text', id: 'deslocacao', label: 'Deslocação', section: 'Deslocação e Tempo' },
    { type: 'number', id: 'horas', label: 'Horas', section: 'Deslocação e Tempo', min: 0, step: 0.5 },
    { type: 'textarea', id: 'observacao', label: 'Observação', rows: 4 },
    {
      type: 'status_pills',
      id: 'estado_final',
      label: 'Estado Final',
      options: ['Reparação Concluída', 'Necessita Elementos Novos', 'Inoperacional'],
    },
  ],
};

/** 8 templates oficiais — suite completa ManuSilva */
export const reportTemplates = [
  FOLHA_INTERVENCAO_AVARIAS,
  MANUTENCAO_BATERIAS_GRANDES,
  MANUTENCAO_CORRETIVA_MAQUINAS,
  MANUTENCAO_PREVENTIVA_BATERIA,
  INSPECAO_DL50_2005,
  MANUTENCAO_PREVENTIVA_EMPILHADORES,
  REPARACAO_CARREGADOR,
  REPARACAO_AVARIAS_BATERIA,
];

export const PDF_DOCUMENT_TITLES = {
  folha_intervencao_avarias: 'FOLHA DE INTERVENÇÃO DE AVARIAS',
  reparacao_avarias_bateria: 'RELATÓRIO REPARAÇÃO AVARIAS BATERIA',
  reparacao_carregador: 'RELATÓRIO REPARAÇÃO CARREGADOR',
  manutencao_preventiva_empilhadores: 'RELATÓRIO MANUTENÇÃO PREVENTIVA EMPILHADORES',
  inspecao_dl50_2005: 'INSPEÇÃO DA MÁQUINA DECRETO-LEI 50-2005',
  manutencao_preventiva_bateria: 'RELATÓRIO MANUTENÇÃO PREVENTIVA BATERIA',
  manutencao_baterias_grandes: 'FORMULÁRIO MANUTENÇÃO BATERIAS CLIENTES GRANDES',
  manutencao_corretiva_maquinas: 'FOLHA MANUTENÇÃO CORRETIVA DE MÁQUINAS',
};

/** Tabela `utilizadores` — roles: `Tecnico` | `RH` */
export const UTILIZADORES = [
  { nome: 'Hugo', nif: '236465767', telemovel: '917715182', email: 'filipasilvahugo2013@gmail.com', role: 'Tecnico', technicianId: 'tech-1' },
  { nome: 'Filipe', nif: '231912250', telemovel: '910858928', email: 'filipeg409@gmail.com', role: 'Tecnico', technicianId: 'tech-2' },
  { nome: 'Adelton', nif: '323438199', telemovel: '937123479', email: 'adeltonair@gmail.com', role: 'Tecnico', technicianId: 'tech-3' },
  { nome: 'Joana', nif: '240563077', telemovel: '910587126', email: 'joanamaia97@gmail.com', role: 'RH' },
  { nome: 'Filipa', nif: null, telemovel: '910249947', email: 'filipasilvahugo2013@gmail.com', role: 'RH' },
];

export const ROLE_UI_TO_DB = { technician: 'Tecnico', admin: 'RH' };
export const ROLE_DB_TO_UI = { Tecnico: 'technician', RH: 'admin' };

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
    Telemovel: telemovel,
    address,
    morada,
    codigoPostal: cp,
    localidade: loc,
    pais: record['País/Região'] ?? record.pais ?? 'Portugal',
    condicao_pagamento: record.condicao_pagamento ?? record.condicaoPagamento ?? '',
    forklifts: record.forklifts || [],
  };
}

export const CLIENTS = [];

/** Tipos de serviço disponíveis (8 relatórios oficiais) */
export const SERVICE_TYPES = [...reportTemplates];

export const JOB_STATUSES = {
  scheduled: { label: 'Pendente', color: '#78350f', bg: '#fef3c7' },
  in_progress: { label: 'Em Progresso', color: '#78350f', bg: '#fef3c7' },
  pending_parts: { label: 'Pendente Peças', color: '#78350f', bg: '#fef3c7' },
  rejected: { label: 'Rejeitado', color: '#991b1b', bg: '#fee2e2' },
  completed: { label: 'Aprovado', color: '#166534', bg: '#dcfce7' },
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
        deslocacao: 'Braga — Parque Empresarial',
        marca: 'Hyster',
        modelo: 'H2.5FT',
        numero_de_serie: 'FL-2020-0078',
        detecao_de_avaria: 'Falha no contactor principal do circuito de elevação. Máquina parada.',
        resolucao_da_avaria: 'Substituição do contactor e testes de funcionamento do elevador.',
        material_utilizado: 'Contactor 48V, bornes, cabo de comando 2m',
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
        valor_amperagem_debitado: '',
        consumiveis_material: [{ equipamento: 'Cabo de carga', quantidade: '1' }],
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
}
