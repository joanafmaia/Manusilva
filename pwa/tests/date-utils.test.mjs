import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getWeekDates,
  formatDate,
  formatDateLong,
  isToday,
  getDayLabel,
  getDayNumber,
  addDaysToIsoDate,
} from '../js/date-utils.js';

describe('date-utils', () => {
  it('getWeekDates devolve 7 dias ISO começando na segunda', () => {
    const wed = new Date(2026, 5, 10, 12, 0, 0); // quarta, hora local
    const week = getWeekDates(wed);
    assert.equal(week.length, 7);
    assert.equal(week[0], '2026-06-08');
    assert.equal(week[6], '2026-06-14');
  });

  it('formatDate e formatDateLong aceitam ISO YYYY-MM-DD', () => {
    assert.match(formatDate('2026-06-10'), /10/);
    assert.match(formatDateLong('2026-06-10'), /2026/);
  });

  it('isToday compara com data local do sistema', () => {
    const today = new Date();
    const iso = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    assert.equal(isToday(iso), true);
    assert.equal(isToday('2000-01-01'), false);
  });

  it('getDayLabel e getDayNumber para quarta-feira', () => {
    assert.equal(getDayLabel('2026-06-10'), 'Qua');
    assert.equal(getDayNumber('2026-06-10'), 10);
  });

  it('addDaysToIsoDate soma dias em calendário', () => {
    assert.equal(addDaysToIsoDate('2026-06-10', 30), '2026-07-10');
    assert.equal(addDaysToIsoDate('invalid', 1), null);
  });
});
