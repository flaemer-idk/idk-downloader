/**
 * Тесты выбора по умолчанию (client-extension/defaults.js).
 *
 * Запуск:  node client-extension/test/defaults.test.mjs
 *
 * Проверяем ровно то, из-за чего эти правила и появились: дубляж должен
 * выигрывать у озвучки сайта, «1080p Ultra» — у остальных качеств, а вес и
 * разрешение не должны пробоваться у мусора ниже 720p.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const defaults = require('../defaults.js');

let failed = 0;
let passed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}\n       ожидалось: ${JSON.stringify(expected)}\n       получилось: ${JSON.stringify(actual)}`);
  }
}

/** Озвучки так, как их отдаёт страница (порядок — как в разметке). */
const voice = (id, title, prem = false) => ({ id, title, prem });

/* ─────────────────────────── 1. Озвучка по умолчанию ─────────────────────── */

console.log('Озвучка по умолчанию (дубляж, иначе — озвучка сайта)');

const siteVoiceovers = [
  voice('0', 'HDrezka Studio'),
  voice('110', 'Оригинал'),
  voice('17', 'LostFilm'),
  voice('42', 'Дубляж (Кириллица)'),
  voice('43', 'Многоголосый закадровый'),
];

check(
  'дубляж выигрывает у озвучки сайта (активна «HDrezka Studio»)',
  defaults.pickVoiceover(siteVoiceovers, '0'),
  '42',
);
check(
  'активная озвучка сайта решает, только если дубляжа нет',
  defaults.pickVoiceover(siteVoiceovers.filter((v) => v.id !== '42'), '17'),
  '17',
);
check('дубляж есть, но озвучка сайта — не дубляж: всё равно дубляж', defaults.pickVoiceover(siteVoiceovers, '43'), '42');
check('дубляжа нет и fallback не указан', defaults.pickVoiceover(siteVoiceovers.filter((v) => v.id !== '42'), null), null);
check('пустой список — остаётся fallback', defaults.pickVoiceover([], '110'), '110');
check('пустой список и без fallback', defaults.pickVoiceover(null, null), null);

check(
  'премиумный дубляж — после обычного (у премиума бывает заглушка вместо файла)',
  defaults.pickVoiceover([voice('5', 'Дубляж (Пифагор)', true), voice('42', 'Дубляж (Кириллица)')], '0'),
  '42',
);
check(
  'премиумный дубляж остаётся выбором, если другого дубляжа нет',
  defaults.pickVoiceover([voice('0', 'HDrezka Studio'), voice('5', 'Дубляж (Пифагор)', true)], '0'),
  '5',
);
check(
  'украинский дубляж — после русского',
  defaults.pickVoiceover([voice('9', 'Дубляж (Украинский)'), voice('42', 'Дублированный')], '0'),
  '42',
);
check(
  'украинский дубляж остаётся выбором, если русского дубляжа нет',
  defaults.pickVoiceover([voice('0', 'HDrezka Studio'), voice('9', 'Дубляж (Украинский)')], '0'),
  '9',
);
check(
  '«ДУБЛЯЖ» регистром не обмануть',
  defaults.pickVoiceover([voice('0', 'HDrezka Studio'), voice('7', 'ДУБЛЯЖ')], '0'),
  '7',
);
check(
  '«HDrezka Studio» и «Многоголосый» — не дубляж',
  defaults.pickVoiceover([voice('0', 'HDrezka Studio'), voice('43', 'Многоголосый закадровый')], '43'),
  '43',
);

/* ─────────────────────────── 2. Качество по умолчанию ────────────────────── */

console.log('\nКачество по умолчанию (1080p Ultra → 1080p)');

/** Словарь качеств: попап смотрит только на ключи. */
const qualities = (...labels) => Object.fromEntries(labels.map((label) => [label, { urls: ['x'] }]));

check(
  'есть Ultra — берём его',
  defaults.pickDefaultQuality(qualities('360p', '480p', '720p', '1080p', '1080p Ultra')),
  '1080p Ultra',
);
check(
  'Ultra нет — берём 1080p',
  defaults.pickDefaultQuality(qualities('360p', '480p', '720p', '1080p')),
  '1080p',
);
check(
  'максимум 2K — всё равно 1080p Ultra',
  defaults.pickDefaultQuality(qualities('720p', '1080p', '1080p Ultra', '2K')),
  '1080p Ultra',
);
check(
  '2K есть, Ultra нет — 1080p, а не 2K',
  defaults.pickDefaultQuality(qualities('720p', '1080p', '2K')),
  '1080p',
);
check('2K и 4K без 1080p — берём ближайшее, 2K', defaults.pickDefaultQuality(qualities('2K', '4K')), '2K');
check('только низкие — 720p', defaults.pickDefaultQuality(qualities('360p', '480p', '720p')), '720p');
check('единственное качество', defaults.pickDefaultQuality(qualities('360p')), '360p');
check('качеств нет', defaults.pickDefaultQuality({}), null);
check('2K не подменяет 1080p по высоте', defaults.pickDefaultQuality(qualities('2K')), '2K');

/* ─────────────────── 3. Субтитры: русский по умолчанию ───────────────────── */

console.log('\nЯзык субтитров по умолчанию (русский)');

const subtitle = (lang, code = null) => ({ lang, code, url: 'https://cdn.test/x.vtt' });

check(
  'русский по коду от сайта (subtitle_lns)',
  defaults.pickSubtitleLang([subtitle('English', 'eng'), subtitle('Русский', 'rus')]),
  'Русский',
);
check(
  'русский по названию, когда кода нет',
  defaults.pickSubtitleLang([subtitle('Английский'), subtitle('Русские (форсированные)')]),
  'Русские (форсированные)',
);
check(
  'русских нет — язык по умолчанию не навязываем',
  defaults.pickSubtitleLang([subtitle('English', 'eng'), subtitle('Українська', 'ukr')]),
  null,
);
check('субтитров нет вовсе', defaults.pickSubtitleLang([]), null);
check('список не пришёл', defaults.pickSubtitleLang(null), null);
check(
  'первый из нескольких русских',
  defaults.pickSubtitleLang([subtitle('Русский', 'rus'), subtitle('Русский (SDH)', 'rus')]),
  'Русский',
);
check(
  '«Russian» в названии тоже русский',
  defaults.isRussianSubtitle(subtitle('Russian')),
  true,
);
check(
  'украинские субтитры русскими не считаем',
  [subtitle('Українська', 'ukr'), subtitle('English', 'eng')].map(defaults.isRussianSubtitle),
  [false, false],
);

/* ───────────────────── 4. Что пробуем (вес и разрешение) ─────────────────── */

console.log('\nПроба: только 720p и выше');

check(
  '720p, 1080p, 1080p Ultra, 2K, 4K — пробуем',
  ['720p', '1080p', '1080p Ultra', '2K', '4K'].map((key) => defaults.shouldProbe(key)),
  [true, true, true, true, true],
);
check(
  '480p, 360p, 144p, SD — не пробуем',
  ['480p', '360p', '144p', 'SD'].map((key) => defaults.shouldProbe(key)),
  [false, false, false, false],
);
check('кириллическая «2к» тоже качество 2K', [defaults.shouldProbe('2к'), defaults.claimedHeight('2к')], [true, 1080]);
check('подпись без числа — высота неизвестна', defaults.claimedHeight('SD'), null);

/* ───────────────────────── 4. Ближайшее качество ─────────────────────────── */

console.log('\nБлижайшее доступное качество (для серий с бедным набором)');

check('точное совпадение', defaults.pickQuality(qualities('720p', '1080p'), '1080p'), '1080p');
check(
  'желаемого нет — берём самое тяжёлое ниже',
  defaults.pickQuality(qualities('360p', '720p', '1080p'), '2K'),
  '1080p',
);
check(
  '1080p Ultra пропал — берём 1080p',
  defaults.pickQuality(qualities('720p', '1080p'), '1080p Ultra'),
  '1080p',
);
check(
  'всё выше желаемого — берём самое низкое',
  defaults.pickQuality(qualities('2K', '4K'), '720p'),
  '2K',
);
check('качеств нет вовсе', defaults.pickQuality({}, '1080p'), null);

/* ───────────────────────────── 5. Вес и порядок ──────────────────────────── */

console.log('\nВес качеств и порядок списка');

check('высота из подписи', ['1080p Ultra', '2K', '4K'].map(defaults.claimedHeight), [1080, 1080, 2160]);
check(
  'Ultra тяжелее обычного 1080p, 4K — тяжелее 2K',
  [
    defaults.qualityWeight('1080p Ultra') > defaults.qualityWeight('1080p'),
    defaults.qualityWeight('4K') > defaults.qualityWeight('2K'),
    defaults.qualityWeight('2K') > defaults.qualityWeight('1080p'),
  ],
  [true, true, true],
);
check(
  'сортировка списка — от тяжёлых к лёгким',
  defaults.sortQualities(['720p', '1080p', '2K', '1080p Ultra', '360p', '4K']),
  ['4K', '2K', '1080p Ultra', '1080p', '720p', '360p'],
);

console.log(`\nИтог: ${passed} ok, ${failed} FAIL`);
process.exit(failed ? 1 : 0);