import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRemaining, PLACEHOLDER_BYTES } from '../src/estimate.js';

const GB = 1024 ** 3;

function video(fields = {}) {
  return {
    status: 'queued',
    file_type: 'video',
    movie_id: '1',
    title: 'Фильм',
    total_bytes: 0,
    received_bytes: 0,
    ...fields,
  };
}

test('известный вес: из задачи вычитается уже скачанное', () => {
  const rows = [
    video({ total_bytes: 5 * GB, received_bytes: 2 * GB }),
    video({ status: 'downloading', total_bytes: 3 * GB, received_bytes: 3 * GB }),
  ];
  const result = estimateRemaining(rows, []);
  assert.equal(result.bytes, 3 * GB);
  assert.equal(result.unknown, 0);
});

test('задачи, которые просто ждут, тоже считаются (не только активные)', () => {
  const rows = [
    video({ status: 'downloading', total_bytes: GB, received_bytes: 0 }),
    video({ status: 'queued', total_bytes: 2 * GB }),
    video({ status: 'paused', total_bytes: 3 * GB }),
    video({ status: 'error', total_bytes: 4 * GB }),
  ];
  assert.equal(estimateRemaining(rows, []).bytes, 10 * GB);
});

test('скачанное больше ожидаемого — не уходим в минус', () => {
  const rows = [video({ total_bytes: GB, received_bytes: 2 * GB })];
  assert.equal(estimateRemaining(rows, []).bytes, 0);
});

test('неизвестный вес: средний вес того же фильма', () => {
  const done = [
    { movie_id: '42', title: 'Сериал', total_bytes: GB },
    { movie_id: '42', title: 'Сериал', total_bytes: 3 * GB },
  ];
  const rows = [video({ movie_id: '42', title: 'Сериал' })];
  const result = estimateRemaining(rows, done);
  assert.equal(result.bytes, 2 * GB);
  assert.equal(result.unknown, 1);
});

test('неизвестный вес: чужой фильм берёт общее среднее', () => {
  const done = [
    { movie_id: '1', title: 'A', total_bytes: 2 * GB },
    { movie_id: '2', title: 'B', total_bytes: 4 * GB },
  ];
  const rows = [video({ movie_id: '3', title: 'C' })];
  assert.equal(estimateRemaining(rows, done).bytes, 3 * GB);
});

test('неизвестный вес без истории: заглушка вместо нуля', () => {
  const result = estimateRemaining([video(), video({ movie_id: '2' })], []);
  assert.equal(result.bytes, Math.round(2 * PLACEHOLDER_BYTES));
  assert.equal(result.unknown, 2);
  assert.equal(result.placeholderBytes, PLACEHOLDER_BYTES);
});

test('субтитры с неизвестным весом не раздувают расчёт', () => {
  const rows = [
    video({ file_type: 'subtitle', total_bytes: 0 }),
    video({ file_type: 'subtitle', total_bytes: 40 * 1024 }),
  ];
  const result = estimateRemaining(rows, []);
  assert.equal(result.bytes, 40 * 1024);
  assert.equal(result.unknown, 0);
});

test('нулевой и битый вес не считаются известными', () => {
  const rows = [video({ total_bytes: 0 }), video({ total_bytes: null })];
  const result = estimateRemaining(rows, [{ movie_id: '1', title: 'Фильм', total_bytes: 0 }]);
  // всё ушло в заглушку: нулевой вес в истории тоже не считается известным
  assert.equal(result.bytes, Math.round(2 * PLACEHOLDER_BYTES));
  assert.equal(result.unknown, 2);
});

test('без задач места не нужно', () => {
  const result = estimateRemaining([], []);
  assert.equal(result.bytes, 0);
  assert.equal(result.unknown, 0);
});