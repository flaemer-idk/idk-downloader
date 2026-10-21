/**
 * Что попап выбирает сам: озвучку, качество, язык субтитров и набор качеств
 * для пробы.
 *
 * Зачем отдельный файл: логика чистая (ни DOM, ни chrome.*) — только подписи
 * качеств строками и список озвучек из DOM, поэтому её проверяют тесты
 * (client-extension/test/defaults.test.mjs). Подписи качеств приходят от сайта
 * как есть: «720p», «1080p», «1080p Ultra», «2K», «4K».
 */

const HdzgDefaults = (() => {
  /** Дубляж: «Дубляж (Кириллица)», «Дублированный», «Дубляж (… )». */
  const DUB_RE = /дубл/i;
  /** Дубляж не на русском — по умолчанию он не нужен. */
  const NON_RUSSIAN_DUB_RE = /украин|україн|білорус|беларус/i;
  /** Базовое качество: «1080p Ultra», иначе «1080p», выше не поднимаемся. */
  const BASE_LABEL = '1080p';
  const FULLHD_RE = /^1080\s*p\b/i;
  const ULTRA_RE = /ultra/i;
  /** Ниже 720p — мусор (360p, 144p): вес не ищем, каждая проба стоит запроса. */
  const MIN_PROBE_HEIGHT = 720;

  /** Коды русского языка, которыми сайт помечает субтитры (subtitle_lns). */
  const RUSSIAN_CODES = new Set(['rus', 'ru']);
  /** Русский по названию: «Русский», «Русские (форсированные)», «Russian». */
  const RUSSIAN_LANG_RE = /русск|russian/i;

  /** Разбор подписи качества: число и единица («1080p», «2K», «4K Ultra»). */
  function splitQuality(key) {
    const match = /^(\d+)\s*([pkкК])/i.exec(String(key).trim());
    if (!match) return null;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    return {
      value,
      kilo: unit === 'k' || unit === 'к', // «2K»/«4K» — килопиксели, «1080p» — строки
      ultra: ULTRA_RE.test(String(key)),
    };
  }

  /** Высота из подписи качества: «1080p Ultra» → 1080, «4K» → 2160. null — числа нет. */
  function claimedHeight(key) {
    const parsed = splitQuality(key);
    if (!parsed) return null;
    return parsed.kilo ? parsed.value * 540 : parsed.value;
  }

  /** Вес качества для сравнения: «4K» ≈ 4×630, «1080p Ultra» чуть выше «1080p». */
  function qualityWeight(key) {
    const parsed = splitQuality(key);
    if (!parsed) return 0;
    const rank = parsed.kilo ? parsed.value * 630 : parsed.value;
    return parsed.ultra ? rank + 1 : rank;
  }

  /** Порядок списка качеств в попапе: сверху самые «тяжёлые». */
  function sortQualities(keys) {
    return (keys ?? []).slice().sort((a, b) => qualityWeight(b) - qualityWeight(a));
  }

  /**
   * Ближайшее доступное качество к желаемому: точное совпадение → самое тяжёлое
   * не выше желаемого → самое низкое из доступных. Последний шаг — для серий:
   * набор качеств у одной серии бывает беднее, и лучше скачать чуть меньше, чем
   * не скачать ничего (в оригинальном расширении — `actionOnNoQuality:
   * reduce_quality`).
   */
  function pickQuality(qualities, wanted) {
    const keys = Object.keys(qualities ?? {});
    if (!keys.length) return null;
    if (qualities[wanted]) return wanted;

    const target = qualityWeight(wanted);
    const ascending = sortQualities(keys).reverse();
    const below = ascending.filter((key) => qualityWeight(key) <= target);
    return below.length ? below[below.length - 1] : ascending[0];
  }

  /** Самый «тяжёлый» из равнозначных («1080p Ultra» против «1080p Ultra 60fps»). */
  function heaviest(keys) {
    return sortQualities(keys)[0] ?? null;
  }

  /**
   * Качество по умолчанию: «1080p Ultra», иначе «1080p». Выше 1080p попап сам
   * не поднимается — 2K/4K это уже совсем другой вес файла (в списке они
   * остаются, выбрать руками можно). Если 1080p-класса нет вовсе, берётся
   * ближайшее снизу (720p), а если и его нет — самое низкое из доступных.
   */
  function pickDefaultQuality(qualities) {
    const keys = Object.keys(qualities ?? {});
    if (!keys.length) return null;

    const full = keys.filter((key) => FULLHD_RE.test(key));
    const ultra = full.filter((key) => ULTRA_RE.test(key));
    return heaviest(ultra) ?? heaviest(full) ?? pickQuality(qualities, BASE_LABEL);
  }

  /**
   * Стоит ли пробовать качество (вес и реальное разрешение). Ниже 720p — мусор
   * вроде 360p/144p, а проба это отдельный Range-запрос к CDN, и на слабом
   * канале список из-за неё ждёт заметно дольше. Подписи без числа («SD») тоже
   * не пробуем: это низкое качество по определению.
   */
  function shouldProbe(key) {
    const height = claimedHeight(key);
    return height !== null && height >= MIN_PROBE_HEIGHT;
  }

  /**
   * Насколько озвучка годится на роль выбора по умолчанию — меньше лучше:
   * 0 — дубляж, 1 — дубляж с пометкой премиума (вместо файла у него бывает
   * заглушка), 2 — дубляж не на русском, 3 — не дубляж.
   */
  function voiceoverRank(voice) {
    const title = String(voice?.title ?? '');
    if (!DUB_RE.test(title)) return 3;
    if (NON_RUSSIAN_DUB_RE.test(title)) return 2;
    return voice?.prem ? 1 : 0;
  }

  /** Русский ли это язык субтитров: сначала код от сайта (subtitle_lns), потом название. */
  function isRussianSubtitle(item) {
    if (RUSSIAN_CODES.has(String(item?.code ?? '').trim().toLowerCase())) return true;
    return RUSSIAN_LANG_RE.test(String(item?.lang ?? ''));
  }

  /**
   * Язык субтитров по умолчанию — русский, если он есть у этой озвучки.
   * null — русского нет: субтитры тогда и не включаем, тащить украинские к
   * русской озвучке незачем (включить руками всё равно можно).
   */
  function pickSubtitleLang(subtitles) {
    const russian = (subtitles ?? []).find(isRussianSubtitle);
    return russian ? russian.lang : null;
  }

  /**
   * Озвучка по умолчанию: дубляж, иначе — та, что выбрана на сайте. hdrezka
   * нередко ставит активной свою озвучку («HDrezka Studio»), а дубляж лежит
   * ниже в списке, и раньше приходилось переключать руками. Из двух дубляжей
   * выигрывает первый в списке — так решает сайт.
   */
  function pickVoiceover(voiceovers, fallbackId) {
    let best = null;
    for (const voice of voiceovers ?? []) {
      if (voice?.id == null) continue;
      const rank = voiceoverRank(voice);
      if (rank === 3) continue; // не дубляж — сгодится только как запасной вариант
      if (!best || rank < best.rank) best = { rank, id: voice.id };
    }
    return best ? best.id : (fallbackId ?? null);
  }

  const api = {
    pickVoiceover,
    pickDefaultQuality,
    pickQuality,
    pickSubtitleLang,
    shouldProbe,
    sortQualities,
    qualityWeight,
    claimedHeight,
    // для тестов (client-extension/test/defaults.test.mjs)
    voiceoverRank,
    isRussianSubtitle,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();

// В попапе модуль живёт глобально (классический скрипт, без сборки).
globalThis.HdzgDefaults = HdzgDefaults;