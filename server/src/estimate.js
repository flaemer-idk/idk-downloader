/**
 * Сколько места ещё нужно очереди.
 *
 * Правила (важны для честного предупреждения «места не хватит»):
 *  - считаются ВСЕ незаконченные задачи, а не только активные: те, что ждут
 *    своей очереди, тоже положат файл на диск;
 *  - из известного веса вычитается уже скачанное, поэтому уже готовая часть
 *    не требует места повторно;
 *  - если вес неизвестен (старая задача без пробы, ручная ссылка), берётся
 *    средний вес похожих скачанных файлов, а когда и его нет — заглушка
 *    PLACEHOLDER_BYTES. Без заглушки такие задачи «весили» бы ноль, и места
 *    хватало бы до первого FILE_NO_SPACE;
 *  - субтитры почти ничего не весят, поэтому неизвестный вес субтитров
 *    не раздувается до заглушки: они учитываются, только если размер известен;
 *  - статус `error` входит в расчёт: task.retryFailedTasks и кнопка «Повторить»
 *    вернут её в очередь, значит место под неё держим.
 */

/** Что считаем незаконченным: эти статусы вернут задачу на диск. */
export const UNFINISHED_STATUSES = ['queued', 'downloading', 'paused', 'error'];

/** Заглушка для задачи, про которую не знаем ничего (после средних). */
export const PLACEHOLDER_BYTES = 1.5 * 1024 * 1024 * 1024;

function keyOf(row) {
  return String(row.movie_id || row.title || 'other');
}

/**
 * @param {Array<{status, file_type, movie_id, title, total_bytes, received_bytes}>} unfinished
 * @param {Array<{movie_id, title, total_bytes}>} doneSizes — скачанные видео с известным весом
 * @returns {{bytes: number, unknown: number, placeholderBytes: number}}
 *          bytes — сколько места ещё нужно (без уже скачанного);
 *          unknown — сколько задач посчитано по заглушке/среднему (вес мог быть больше).
 */
export function estimateRemaining(unfinished, doneSizes, placeholderBytes = PLACEHOLDER_BYTES) {
  const averages = new Map();
  let globalSum = 0;
  let globalCount = 0;

  for (const row of doneSizes) {
    const size = Number(row.total_bytes) || 0;
    if (size <= 0) continue;
    const key = keyOf(row);
    const entry = averages.get(key) || { sum: 0, count: 0 };
    entry.sum += size;
    entry.count += 1;
    averages.set(key, entry);
    globalSum += size;
    globalCount += 1;
  }

  const globalAverage = globalCount > 0 ? globalSum / globalCount : 0;
  let bytes = 0;
  let unknown = 0;

  for (const row of unfinished) {
    const total = Number(row.total_bytes) || 0;
    const received = Number(row.received_bytes) || 0;

    if (total > 0) {
      bytes += Math.max(0, total - received);
      continue;
    }
    // Неизвестный вес: субтитры не оцениваем — заглушка для них была бы ложью.
    if (row.file_type && row.file_type !== 'video') continue;

    const entry = averages.get(keyOf(row));
    const average = entry && entry.count > 0 ? entry.sum / entry.count : globalAverage;
    bytes += average > 0 ? average : placeholderBytes;
    unknown += 1;
  }

  return { bytes: Math.round(bytes), unknown, placeholderBytes };
}