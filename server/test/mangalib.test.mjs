import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMangaLibUrl,
  isMangaLibUrl,
  pickTitle,
  yearFrom,
  chapterFromApi,
  sortChapters,
  collapseDuplicates,
  pagePath,
  imageUrl,
} from '../src/mango/mangalib.js';
import { chapterFolderName } from '../src/mango/naming.js';

test('MangaLib: разбор ссылок на сайте и API', () => {
  assert.deepEqual(parseMangaLibUrl('https://mangalib.me/ru/manga/206--one-piece'), {
    kind: 'manga',
    slug: '206--one-piece',
  });
  assert.deepEqual(
    parseMangaLibUrl('https://mangalib.org/ru/manga/206--one-piece?section=chapters'),
    { kind: 'manga', slug: '206--one-piece' },
  );
  assert.deepEqual(
    parseMangaLibUrl('https://mangalib.me/ru/manga/206--one-piece/read?volume=1&number=1'),
    { kind: 'manga', slug: '206--one-piece' },
  );
  assert.deepEqual(
    parseMangaLibUrl('https://api.imglib.info/api/manga/206--one-piece/chapters'),
    { kind: 'manga', slug: '206--one-piece' },
  );
  assert.deepEqual(parseMangaLibUrl('https://mangalib.me/ru/manga/one-piece'), {
    kind: 'manga',
    slug: 'one-piece',
  });
  assert.equal(isMangaLibUrl('https://mangalib.me/ru/manga/206--one-piece'), true);
  assert.equal(isMangaLibUrl('https://com-x.life/26588-title.html'), false);
  assert.equal(isMangaLibUrl('https://mangadex.org/title/abc'), false);
  assert.equal(isMangaLibUrl('https://mangalib.me/ru/catalog'), false);
  assert.equal(isMangaLibUrl('не ссылка'), false);
});

test('MangaLib: название и год для папки', () => {
  assert.equal(
    pickTitle({ rus_name: 'Ван Пис', name: 'One Piece', eng_name: 'One Piece' }),
    'Ван Пис',
  );
  assert.equal(pickTitle({ name: 'One Piece' }), 'One Piece');
  assert.equal(pickTitle({}), 'Без названия');
  assert.equal(yearFrom('1997 г.'), '1997');
  assert.equal(yearFrom('2020-05-01'), '2020');
  assert.equal(yearFrom(''), null);
});

test('MangaLib: глава из API, группа и языковой суффикс', () => {
  const item = {
    id: 54646,
    volume: '1',
    number: '1',
    name: 'На заре приключений',
    branches: [
      {
        id: 54646,
        branch_id: null,
        created_at: '2016-08-20T05:26:15.000000Z',
        teams: [{ name: 'Команда' }],
      },
    ],
  };
  const chapter = chapterFromApi(item, '206--one-piece');
  assert.equal(chapter.id, '54646');
  assert.equal(chapter.volume, '1');
  assert.equal(chapter.number, '1');
  assert.equal(chapter.folder, '1 - На заре приключений');
  assert.equal(chapter.folder, chapterFolderName({ num: '1', title: 'На заре приключений' }));
  assert.equal(chapter.group, 'Команда');
  assert.equal(chapter.language, 'ru');
  assert.equal(chapter.slugUrl, '206--one-piece');
  assert.match(chapter.url, /\/read\?volume=1&number=1$/);
  assert.equal(chapter.external, false);
  assert.equal(chapter.unavailable, false);
});

test('MangaLib: глава без названия, тома и группы', () => {
  const chapter = chapterFromApi({ id: 7, number: null, name: null }, '7--oneshot');
  assert.equal(chapter.volume, '1');
  assert.equal(chapter.number, '1');
  assert.equal(chapter.folder, '1');
  assert.equal(chapter.group, null);
});

test('MangaLib: сортировка по тому и номеру, а не по строке', () => {
  const make = (volume, number) => ({ volume, number, title: '' });
  const sorted = sortChapters([
    make('10', '1'),
    make('2', '10'),
    make('2', '2'),
    make('1', '1'),
  ]);
  assert.deepEqual(
    sorted.map((chapter) => `${chapter.volume}-${chapter.number}`),
    ['1-1', '2-2', '2-10', '10-1'],
  );
});

test('MangaLib: дубли volume|number схлопываются в именованную группу', () => {
  const make = (id, group, createdAt) => ({
    id,
    volume: '1',
    number: '5',
    name: '',
    branches: [
      {
        id,
        created_at: createdAt,
        teams: group ? [{ name: group }] : [],
      },
    ],
  });
  const result = collapseDuplicates([
    chapterFromApi(make(1, '', '2020-01-02T00:00:00Z'), '1--title'),
    chapterFromApi(make(2, 'Группа', '2020-01-01T00:00:00Z'), '1--title'),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '2');
  assert.equal(result[0].group, 'Группа');
});

test('MangaLib: путь страницы и URL из base + path', () => {
  assert.equal(pagePath({ url: '//manga/one-piece/chapters/54646/01.jpg' }), 'manga/one-piece/chapters/54646/01.jpg');
  assert.equal(pagePath({ url: 'https://cdn.example/01.webp' }), 'https://cdn.example/01.webp');
  assert.equal(pagePath({ url: '//cdn.example/01.webp' }), 'https://cdn.example/01.webp');
  assert.equal(
    imageUrl('https://img3.cdnlibs.org/', 'manga/one-piece/chapters/54646/01.jpg'),
    'https://img3.cdnlibs.org/manga/one-piece/chapters/54646/01.jpg',
  );
  assert.equal(
    imageUrl('https://img3.cdnlibs.org', 'https://other.example/01.jpg'),
    'https://other.example/01.jpg',
  );
});