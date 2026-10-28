import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cookieHeader,
  isRezkaUrl,
  parseRezkaPage,
} from '../src/rezka.js';
import { categoryFolder, buildFilename } from '../src/util.js';

test('Rezka: Netscape cookies → Cookie header', () => {
  const text = [
    '# Netscape HTTP Cookie File',
    '.rezka.fi\tTRUE\t/\tFALSE\t0\tPHPSESSID\tabc',
    '#HttpOnly_.rezka.fi\tTRUE\t/\tFALSE\t0\tdle_user_id\t123',
    'bad line',
  ].join('\n');
  assert.equal(cookieHeader(text), 'PHPSESSID=abc; dle_user_id=123');
  assert.equal(cookieHeader(''), '');
});

test('Rezka: URL host check', () => {
  assert.equal(isRezkaUrl('https://rezka.fi/films/1-x.html'), true);
  assert.equal(isRezkaUrl('https://rezka.ag/series/1-x.html'), true);
  assert.equal(isRezkaUrl('https://example.com/films/1-x.html'), false);
});

test('Rezka: разбор страницы — название, год, возраст, озвучки, серии', () => {
  const html = `
    <h1 itemprop="name">Сияние</h1>
    <meta property="og:title" content="Сияние (1997)" />
    <table class="b-post__info"><tr><td><h2>Возраст</h2>:</td><td><span>18+</span></td></tr></table>
    <li class="b-translator__item active" data-translator_id="343">Варус-Видео</li>
    <li class="b-translator__item" data-translator_id="238">Оригинал (+субтитры)</li>
    <li data-season_id="1" data-episode_id="1">Серия 1</li>
    <li data-season_id="1" data-episode_id="2">Серия 2</li>
  `;
  const page = parseRezkaPage(html, 'https://rezka.fi/series/horror/13383-siyanie-1997.html');
  assert.equal(page.title, 'Сияние');
  assert.equal(page.year, '1997');
  assert.equal(page.kind, 'series');
  assert.equal(page.section, 'series');
  assert.equal(page.rating, '18+');
  assert.equal(page.id, '13383');
  assert.equal(page.activeTranslator, '343');
  assert.deepEqual(page.translators.map((t) => t.id), ['343', '238']);
  assert.equal(page.episodes.length, 2);
});

test('Rezka: единственный перевод без списка — «В переводе» + id плеера', () => {
  const html = `
    <h1 itemprop="name">Проект «Мир»: Сломанный мир и непоющая Мику</h1>
    <meta property="og:title" content="Проект «Мир»: Сломанный мир и непоющая Мику (2025)" />
    <table class="b-post__info">
      <tr><td class="l"><h2>В переводе</h2>:</td><td><a href="/x/">AniLibria</a></td></tr>
    </table>
    <script>sof.tv.initCDNMoviesEvents(89857, 19, 0, 0, 0, 'rezka.fi');</script>
  `;
  const page = parseRezkaPage(
    html,
    'https://rezka.fi/animation/fiction/89857-proekt-mir-slomannyy-mir-i-nepoyuschaya-miku-2025.html',
  );
  assert.equal(page.kind, 'film');
  assert.deepEqual(page.translators, [{ id: '19', name: 'AniLibria' }]);
  assert.equal(page.activeTranslator, '19');
});

test('Categories: правила дают папку без library_dir', () => {
  const settings = {
    library_dir: '',
    filename_template_series: '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%',
    filename_template_film: '%orig_title%%year_part%/%orig_title%',
    filename_template_subtitle:
      '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%.%subtitle_lang%',
    library_rules: JSON.stringify([
      { section: 'cartoons', kind: 'series', rating: '16+', folder: 'томатные несколькосерий' },
      { section: 'cartoons', kind: 'series', rating: '18+', folder: 'томатные несколькосерий' },
      { section: 'cartoons', kind: 'series', rating: 'any', folder: 'банановые несколькосерий' },
      { section: 'films', kind: 'film', rating: 'any', folder: 'арбузные фильмы' },
    ]),
  };
  assert.equal(categoryFolder(settings, 'cartoons', 'series', '18+'), 'томатные несколькосерий');
  assert.equal(categoryFolder(settings, 'cartoons', 'series', '6+'), 'банановые несколькосерий');
  assert.equal(categoryFolder(settings, 'films', 'film', '16+'), 'арбузные фильмы');
  const task = {
    category: 'cartoons',
    kind: 'series',
    rating: '18+',
    title: 'Invincible',
    orig_title: 'Invincible',
    year: '2021',
    season: '1',
    episode: '1',
    file_type: 'video',
  };
  assert.equal(
    buildFilename(task, settings),
    'томатные несколькосерий/Invincible (2021)/Season 1/Invincible S1E1.mp4',
  );
});
