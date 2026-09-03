import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  isPdfStoragePermissionError,
  formatPdfStorageError,
} from '../js/pdf-storage.js';

const require = createRequire(import.meta.url);
const {
  sanitizePdfStorageFilename,
  decodePdfBase64,
  publicPdfUrl,
  PDF_BUCKET,
} = require('../server-lib/pdf-storage-upload.js');

describe('upload PDF — sanitização e validação', () => {
  it('sanitizePdfStorageFilename bloqueia path traversal e força .pdf', () => {
    assert.equal(sanitizePdfStorageFilename('../etc/passwd'), 'passwd.pdf');
    assert.equal(
      sanitizePdfStorageFilename('Relatório Manutenção.pdf'),
      'Relatorio_Manutencao.pdf',
    );
    assert.equal(sanitizePdfStorageFilename(''), 'relatorio.pdf');
  });

  it('decodePdfBase64 rejeita payloads que não são PDF', () => {
    assert.throws(() => decodePdfBase64(''), /PDF em falta/);
    assert.throws(() => decodePdfBase64(Buffer.from('hello').toString('base64')), /PDF inválido/);
  });

  it('decodePdfBase64 aceita %PDF com prefixo data URL', () => {
    const pdf = Buffer.from('%PDF-1.4 test');
    const decoded = decodePdfBase64(`data:application/pdf;base64,${pdf.toString('base64')}`);
    assert.equal(decoded.subarray(0, 4).toString('latin1'), '%PDF');
  });

  it('publicPdfUrl aponta para o bucket público', () => {
    process.env.SUPABASE_URL = 'https://zhfbezrevosmbmcbyskw.supabase.co';
    const url = publicPdfUrl('Relatorio_OP-2026-01.pdf');
    assert.match(url, new RegExp(`/object/public/${PDF_BUCKET}/Relatorio_OP-2026-01\\.pdf$`));
  });
});

describe('erros de Storage no cliente', () => {
  it('reconhece 403 / RLS como falta de permissão', () => {
    assert.equal(isPdfStoragePermissionError({ status: 403, message: 'Unauthorized' }), true);
    assert.equal(
      isPdfStoragePermissionError({ message: 'new row violates row-level security policy' }),
      true,
    );
    assert.equal(isPdfStoragePermissionError({ message: 'Bucket not found' }), true);
    assert.equal(isPdfStoragePermissionError({ message: 'PDF inválido' }), false);
  });

  it('formatPdfStorageError já não bloqueia com instrução SQL isolada', () => {
    const msg = formatPdfStorageError({ status: 403, message: 'Unauthorized' });
    assert.match(msg, /servidor/i);
    assert.match(msg, /supabase-storage-pdfs\.sql/i);
  });
});
