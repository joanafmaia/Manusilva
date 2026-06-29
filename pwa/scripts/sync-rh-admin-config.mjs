/**
 * Gera pwa/shared/rh-admin-config.json a partir de mock_data.js.
 * Executar após alterar UTILIZADORES ou e-mails RH.
 *
 *   npm run sync:rh-config
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FILIPA_LEGACY_AUTH_EMAIL, UTILIZADORES } from '../js/mock_data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../shared/rh-admin-config.json');

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
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`[sync:rh-config] Escrito ${outPath} (${config.emails.length} e-mails RH)`);
