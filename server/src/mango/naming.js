/**
 * Правила имён манги — чистые функции без I/O (покрыты test/mango.test.js).
 * Источник правил — prototypes/mango/mango.md: {Название} [{год}]/
 * Volume N/«8» или «8 - Название»/000.ext.
 */

/** `8 - яблоко: зелёное?` → `8 - яблоко - зелёное` (Windows-совместимо).
 *  `_` вместо символов выглядит грязно, поэтому:
 *  `:` `/` `\` `|` → « - », `*` `?` `"` `<` `>` и управляющие → выкидываем. */
export function sanitizeName(raw) {
  let value = String(raw ?? '')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/[:/\\|]/g, ' - ')
    .replace(/[*?"<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\s-\s)+/g, ' - ')
    .replace(/^[-\s]+/, '')
    .replace(/[.\s]+$/, '')
    .replace(/\s-\s*$/, '');
  if (value.length > 150) value = value.slice(0, 150).replace(/[-\s.]+$/, '');
  return value;
}

/**
 * Строка главы с сайта → { vol, num, title }.
 *   «1 - 8»              → { vol:'1', num:'8',  title:'' }
 *   «1 - 2.5 Экстра»     → { vol:'1', num:'2.5', title:'Экстра' }
 *   «1 Кому улыбнётся?»  → { vol:'1', num:'1',  title:'Кому улыбнётся?' }
 * Разделитель тома и главы — только « - » с пробелами (mango.md).
 */
export function parseChapterString(raw) {
  const text = String(raw ?? '').trim();
  const numRe = /^(\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?)(?:\s+([\s\S]+))?$/;
  const sep = text.indexOf(' - ');
  if (sep !== -1) {
    const vol = text.slice(0, sep).trim();
    const rest = text.slice(sep + 3).trim();
    const match = rest.match(numRe);
    if (match && /^\d/.test(vol)) {
      return { vol, num: match[1], title: (match[2] || '').trim() };
    }
  }
  const match = text.match(numRe);
  if (match) return { vol: '1', num: match[1], title: (match[2] || '').trim() };
  return { vol: '1', num: '0', title: text };
}

/**
 * Папка главы: «8» или «8 - Название».
 * Язык не ru добавляется суффиксом «[en]», чтобы главы разных переводов не
 * попадали в одну папку (MangaDex). Для ComX язык всегда ru — без суффикса.
 */
export function chapterFolderName({ num, title }, language = 'ru') {
  const base = title ? `${num} - ${title}` : String(num);
  const code = String(language || 'ru').toLowerCase();
  return code === 'ru' ? base : `${base} [${code}]`;
}

/** Папка тайтла: «Название [2020]», без года — просто название. */
export function seriesFolderName(title, year) {
  const name = sanitizeName(title) || 'Без названия';
  return year ? `${name} [${year}]` : name;
}

/**
 * Свободная папка тайтла: base, иначе base 2, base 3…
 * `exists(candidate)` — проверка занятости (БД/диск).
 */
export function uniqueFolderName(base, exists) {
  const first = sanitizeName(base) || 'Без названия';
  if (!exists(first)) return first;
  // Оставляем место под « 2», иначе sanitizeName обрежет суффикс и кандидат
  // навсегда останется тем же.
  const stem = first.length > 140
    ? first.slice(0, 140).replace(/[-\s.]+$/, '')
    : first;
  for (let index = 2; index < 1000; index++) {
    const candidate = sanitizeName(`${stem} ${index}`);
    if (!exists(candidate)) return candidate;
  }
  throw new Error('не удалось подобрать свободную папку тайтла');
}

/** Имя страницы: 000.webp; при ≥1000 страниц — 0000.webp. */
export function pageFileName(index, total, ext) {
  const width = total >= 1000 ? 4 : 3;
  return String(index).padStart(width, '0') + ext;
}
