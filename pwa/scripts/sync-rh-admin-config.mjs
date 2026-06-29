/**
 * Gera rh-admin-config (JSON para API + JS para o browser) a partir de mock_data.js.
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
const jsPath = path.join(__dirname, '../js/rh-admin-config.js');

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

const config = buildRhAdminConfig();
const jsonText = `${JSON.stringify(config, null, 2)}\n`;
const jsText = `/** AUTO-GERADO — npm run sync:rh-config (não editar à mão) */
export default ${JSON.stringify(config, null, 2)};
`;

fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(jsonPath, jsonText, 'utf8');
fs.writeFileSync(jsPath, jsText, 'utf8');
console.log(
  `[sync:rh-config] ${jsonPath} + ${jsPath} (${config.emails.length} e-mails RH)`,
);
