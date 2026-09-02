import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCoalescedIdFetcher,
  createIdTtlCache,
  createKeyedFetchGate,
} from '../js/supabase-query.js';

describe('supabase-query — anti-loop', () => {
  it('createKeyedFetchGate ignora refetch dentro do TTL', async () => {
    const gate = createKeyedFetchGate(60_000);
    let runs = 0;
    const first = await gate.run('semana-a', async () => {
      runs += 1;
      return ['ok'];
    });
    const second = await gate.run('semana-a', async () => {
      runs += 1;
      return ['again'];
    });
    assert.equal(first.skipped, false);
    assert.deepEqual(first.value, ['ok']);
    assert.equal(second.skipped, true);
    assert.equal(runs, 1);
  });

  it('createKeyedFetchGate junta chamadas em voo', async () => {
    const gate = createKeyedFetchGate(1);
    let runs = 0;
    let release;
    const blocker = new Promise((resolve) => {
      release = resolve;
    });
    const p1 = gate.run('k', async () => {
      runs += 1;
      await blocker;
      return 1;
    });
    const p2 = gate.run('k', async () => {
      runs += 1;
      return 2;
    });
    release();
    const [a, b] = await Promise.all([p1, p2]);
    assert.equal(runs, 1);
    assert.equal(a.value, 1);
    assert.equal(b.value, 1);
  });

  it('createCoalescedIdFetcher não volta a pedir IDs frescos', async () => {
    const ttl = createIdTtlCache(60_000);
    const seen = [];
    const ensure = createCoalescedIdFetcher(async (ids) => {
      seen.push([...ids]);
    }, ttl);

    await ensure(['a', 'b']);
    await ensure(['a', 'b', 'c']);
    assert.deepEqual(seen, [
      ['a', 'b'],
      ['c'],
    ]);
  });
});
