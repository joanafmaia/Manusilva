import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllPaged, SUPABASE_PAGE_SIZE } from '../js/supabase-query.js';
import { stripHeavyReportDados } from '../js/report-payload-gc.js';
import { storagePathFromPublicUrl } from '../js/supabase-storage-gc.js';
import { IMAGE_COMPRESS_MAX_WIDTH } from '../js/image-compress.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('quota Supabase — paginação e payload', () => {
  it('fetchAllPaged junta páginas até um lote curto', async () => {
    const pages = [[1, 2], [3], []];
    let call = 0;
    const { data, error } = await fetchAllPaged(() => {
      const index = call;
      call += 1;
      return {
        range() {
          return Promise.resolve({ data: pages[index] || [], error: null });
        },
      };
    }, 2);
    assert.equal(error, null);
    assert.deepEqual(data, [1, 2, 3]);
    assert.equal(SUPABASE_PAGE_SIZE, 500);
  });

  it('stripHeavyReportDados remove base64 quando já há URL http', () => {
    const slim = stripHeavyReportDados({
      fotoAntesUrl: 'https://x.supabase.co/storage/v1/object/public/fotos_trabalhos/a.jpg',
      fotoAntesBase64: 'data:image/jpeg;base64,AAAA',
      pdfBase64: 'JVBERi0',
      photos: [
        {
          url: 'https://x.supabase.co/storage/v1/object/public/fotos_trabalhos/b.jpg',
          base64: 'data:image/jpeg;base64,BBBB',
        },
      ],
    });
    assert.equal(slim.fotoAntesBase64, undefined);
    assert.equal(slim.pdfBase64, undefined);
    assert.equal(slim.photos[0].base64, undefined);
    assert.match(slim.fotoAntesUrl, /^https:/);
  });

  it('stripHeavyReportDados mantém base64 offline sem URL http', () => {
    const slim = stripHeavyReportDados({
      fotoAntesUrl: 'data:image/jpeg;base64,AAAA',
      fotoAntesBase64: 'data:image/jpeg;base64,AAAA',
    });
    assert.equal(slim.fotoAntesBase64, 'data:image/jpeg;base64,AAAA');
  });

  it('storagePathFromPublicUrl extrai o path do bucket', () => {
    const url =
      'https://proj.supabase.co/storage/v1/object/public/pdfs_trabalhos/Relatorio_OP-2026-01.pdf';
    assert.equal(
      storagePathFromPublicUrl(url, 'pdfs_trabalhos'),
      'Relatorio_OP-2026-01.pdf',
    );
  });

  it('fotos comprimidas cabem em 1024px de lado', () => {
    assert.equal(IMAGE_COMPRESS_MAX_WIDTH, 1024);
  });

  it('módulos de dados não usam SELECT *', () => {
    const files = [
      'relatorios-db.js',
      'servicos-db.js',
      'trabalhos-db.js',
      'clients-catalog.js',
      'folhas-obra-db.js',
      'faturas-manuais-db.js',
      'cliente-equipamentos-db.js',
    ];
    for (const file of files) {
      const src = fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
      assert.doesNotMatch(src, /\.select\(\s*['"]\*['"]\s*\)/, file);
    }
  });
});
