/**
 * Gera rh-admin-config (JSON para API + bloco em auth-roles.js) a partir de mock_data.js.
 * Executar após alterar UTILIZADORES ou e-mails RH.
 *
 *   npm run sync:rh-config
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILIPA_LEGACY_AUTH_EMAIL, UTILIZADORES } from '../js/mock_data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.join(__dirname, '../shared/rh-admin-config.json');
const authRolesPath = path.join(__dirname, '../js/auth-roles.js');

const RH_CONFIG_START = '// >>> RH_CONFIG_START (npm run sync:rh-config)';
const RH_CONFIG_END = '// <<< RH_CONFIG_END';

const RH_ADMIN_ROLE_VALUES = [
  'RH',
  'rh',
  'admin',
  'Admin',
  'ADMIN',
  'administracao',
  'Administracao',
];

function buildRhAdminConfig() {
  const tecnicoEmails = new Set(
    UTILIZADORES.filter((u) => u.role === 'Tecnico').map((u) => u.email.toLowerCase()),
  );
  const emails = [
    ...new Set(
      [
        ...UTILIZADORES.filter((u) => u.role === 'RH')
          .map((u) => u.email.toLowerCase())
          .filter((email) => email && !tecnicoEmails.has(email)),
        FILIPA_LEGACY_AUTH_EMAIL.toLowerCase(),
      ].filter(Boolean),
    ),
  ];
  const names = [
    ...new Set(
      UTILIZADORES.filter((u) => u.role === 'RH').map((u) => u.nome.toLowerCase()),
    ),
  ];

  return {
    roleValues: RH_ADMIN_ROLE_VALUES,
    emails,
    names,
  };
}

function formatRhConfigBlock(config) {
  return `${RH_CONFIG_START}
const RH_CONFIG = ${JSON.stringify(config, null, 2)};
${RH_CONFIG_END}`;
}

function patchAuthRolesJs(config) {
  const source = fs.readFileSync(authRolesPath, 'utf8');
  const startIdx = source.indexOf(RH_CONFIG_START);
  const endIdx = source.indexOf(RH_CONFIG_END);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Marcadores RH_CONFIG não encontrados em auth-roles.js');
  }
  const endLine = endIdx + RH_CONFIG_END.length;
  const next = `${source.slice(0, startIdx)}${formatRhConfigBlock(config)}${source.slice(endLine)}`;
  fs.writeFileSync(authRolesPath, next, 'utf8');
}

const config = buildRhAdminConfig();
const jsonText = `${JSON.stringify(config, null, 2)}\n`;

fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(jsonPath, jsonText, 'utf8');
patchAuthRolesJs(config);
console.log(`[sync:rh-config] ${jsonPath} + auth-roles.js (${config.emails.length} e-mails RH)`);
