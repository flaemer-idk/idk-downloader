import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMangaDexUrl,
  isMangaDexUrl,
  pickTitle,
  sortLanguages,
  defaultLanguage,
  chapterFromApi,
  collapseDuplicates,
  imageUrl,
} from '../src/mango/mangadex.js';
import { chapterFolderName } from '../src/mango/naming.js';

test('MangaDex: разбор ссылок на тайтл, главу и API', () => {
  const id = 'b5e36871-1708-41e4-9a1b-b380abf1a19e';
  assert.deepEqual(parseMangaDexUrl(`https://mangadex.org/title/${id}/tasogare`), {
    kind: 'manga',
    id,
  });
  assert.deepEqual(parseMangaDexUrl(`https://mangadex.org/chapter/${id}`), {
    kind: 'chapter',
    id,
  });
  assert.deepEqual(parseMangaDexUrl(`https://api.mangadex.org/manga/${id}`), {
    kind: 'manga',
    id,
  });
  assert.equal(isMangaDexUrl(`https://mangadex.org/title/${id}`), true);
  assert.equal(isMangaDexUrl('https://com-x.life/26588-title.html'), false);
  assert.equal(isMangaDexUrl('https://mangadex.org/title/not-a-uuid'), false);
});

test('MangaDex: название для папки — ru, alt ru, en, original', () => {
  assert.equal(
    pickTitle({
      title: { en: 'English', ja: '日本語' },
      altTitles: [{ ru: 'Русское' }],
      originalLanguage: 'ja',
    }),
    'Русское',
  );
  assert.equal(
    pickTitle({ title: { ru: 'Русское', en: 'English' } }),
    'Русское',
  );
  assert.equal(pickTitle({ title: { en: 'English' } }), 'English');
  assert.equal(
    pickTitle({ title: { ja: '日本語' }, originalLanguage: 'ja' }),
    '日本語',
  );
  assert.equal(pickTitle({}), 'Без названия');
});

test('MangaDex: языки не зашиты в ru/en, но ru/en идут первыми', () => {
  assert.deepEqual(sortLanguages(['de', 'en', 'ru', 'pt-br', 'ru']), [
    'ru',
    'en',
    'de',
    'pt-br',
  ]);
  assert.equal(defaultLanguage(['de', 'en', 'ru']), 'ru');
  assert.equal(defaultLanguage(['de', 'en']), 'en');
  assert.equal(defaultLanguage(['de']), 'de');
});

test('MangaDex: глава из API и языковой суффикс папки', () => {
  const base = {
    id: 'ccbd409f-2f9c-4f0b-8350-d75ba6dd2fac',
    attributes: {
      volume: '1',
      chapter: '2.5',
      title: 'Экстра',
      translatedLanguage: 'en',
      externalUrl: null,
      isUnavailable: false,
      pages: 10,
      publishAt: '2021-09-12T13:34:38+00:00',
    },
    relationships: [{ type: 'scanlation_group', attributes: { name: 'Group' } }],
  };
  assert.equal(chapterFolderName({ num: '2.5', title: 'Экстра' }, 'ru'), '2.5 - Экстра');
  assert.equal(chapterFolderName({ num: '2.5', title: 'Экстра' }, 'en'), '2.5 - Экстра [en]');
  const chapter = chapterFromApi(base, 'en');
  assert.equal(chapter.folder, '2.5 - Экстра [en]');
  assert.equal(chapter.language, 'en');
  assert.equal(chapter.group, 'Group');
  assert.equal(chapter.external, false);
  assert.equal(chapter.unavailable, false);
});

test('MangaDex: external и пустая глава помечаются', () => {
  const chapter = chapterFromApi(
    {
      id: 'x',
      attributes: {
        volume: null,
        chapter: null,
        title: 'One-shot',
        externalUrl: 'https://mangaplus.shueisha.co.jp/viewer/1',
        isUnavailable: false,
        pages: 0,
      },
      relationships: [],
    },
    'en',
  );
  assert.equal(chapter.volume, '1');
  assert.equal(chapter.number, '1');
  assert.equal(chapter.external, true);
  assert.equal(chapter.unavailable, false);
});

test('MangaDex: дубли групп схлопываются в одну главу с большим числом страниц', () => {
  const make = (pages, group, publishAt) => ({
    id: `${group}-${pages}`,
    attributes: {
      volume: '2',
      chapter: '15',
      title: '',
      externalUrl: null,
      isUnavailable: false,
      pages,
      publishAt,
    },
    relationships: [{ type: 'scanlation_group', attributes: { name: group } }],
  });
  const result = collapseDuplicates([
    chapterFromApi(make(17, 'A', '2020-01-02T00:00:00+00:00'), 'en'),
    chapterFromApi(make(19, 'B', '2020-01-01T00:00:00+00:00'), 'en'),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].pages, 19);
  assert.equal(result[0].group, 'B');
});

test('MangaDex: URL страницы собирается из baseUrl/hash/filename', () => {
  assert.equal(
    imageUrl('https://uploads.mangadex.org', 'abc', '1.jpg'),
    'https://uploads.mangadex.org/data/abc/1.jpg',
  );
  assert.equal(
    imageUrl('https://uploads.mangadex.org/', 'abc', '1.jpg', 'saver'),
    'https://uploads.mangadex.org/data-saver/abc/1.jpg',
  );
});
