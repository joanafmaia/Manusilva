import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  cleanEnvSecret,
  buildMimeMessage,
  googleErrorText,
  googleErrorCode,
  toBase64Url,
} = require('../api/enviar-email.js');

describe('enviar-email Gmail helpers', () => {
  it('cleanEnvSecret remove aspas e quebras de linha do refresh token', () => {
    assert.equal(cleanEnvSecret('  "1//abc\n def"  '), '1//abcdef');
    assert.equal(cleanEnvSecret("GOCSPX-xxx"), 'GOCSPX-xxx');
  });

  it('toBase64Url usa alfabeto URL-safe', () => {
    const raw = Buffer.from('hello+/?world');
    const encoded = toBase64Url(raw);
    assert.equal(encoded.includes('+'), false);
    assert.equal(encoded.includes('/'), false);
    assert.equal(encoded.includes('='), false);
  });

  it('googleErrorText distingue OAuth string vs erro JSON da Gmail API', () => {
    assert.equal(
      googleErrorText(
        { error: 'invalid_grant', error_description: 'Bad Request' },
        'fallback',
      ),
      'Bad Request',
    );
    assert.equal(googleErrorCode({ error: 'invalid_grant' }), 'invalid_grant');
    assert.equal(
      googleErrorText(
        {
          error: {
            code: 400,
            message: 'Bad Request',
            status: 'INVALID_ARGUMENT',
            errors: [{ reason: 'invalidArgument' }],
          },
        },
        'fallback',
      ),
      'Bad Request — INVALID_ARGUMENT — invalidArgument',
    );
  });

  it('buildMimeMessage gera RFC822 com Date, To e content-type de ZIP', async () => {
    const mime = await buildMimeMessage({
      from: 'ManuSilva <manusilva.lda@gmail.com>',
      to: 'cliente@empresa.pt',
      subject: 'ManuSilva - Relatório Técnico - Empresa',
      html: '<p>Olá</p>',
      attachments: [
        {
          filename: 'relatorios_manusilva_2_pdfs.zip',
          content: Buffer.from('PK\u0003\u0004'),
          contentType: 'application/zip',
        },
      ],
    });
    const text = mime.toString('utf8');
    assert.match(text, /^Date:/m);
    assert.match(text, /To:.*cliente@empresa\.pt/i);
    assert.match(text, /Subject:/i);
    assert.match(text, /application\/zip/i);
    assert.doesNotMatch(text, /application\/pdf; name="relatorios_manusilva_2_pdfs\.zip"/);
  });
});
