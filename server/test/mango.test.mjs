import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeName,
  parseChapterString,
  chapterFolderName,
  seriesFolderName,
  mangoTemplateParts,
  uniqueFolderName,
  pageFileName,
} from '../src/mango/naming.js';
import { isMangaPageUrl, newsIdFromUrl, pagesFromReaderData } from '../src/mango/comx.js';

test('parseChapterString: том и глава через « - »', () => {
  assert.deepEqual(parseChapterString('1 - 8'), { vol: '1', num: '8', title: '' });
  assert.deepEqual(parseChapterString('1 - 2.5 Экстра'), {
    vol: '1',
    num: '2.5',
    title: 'Экстра',
  });
  assert.deepEqual(parseChapterString('1 - 5 5 лет спустя'), {
    vol: '1',
    num: '5',
    title: '5 лет спустя',
  });
  assert.deepEqual(parseChapterString('1 - 2 '), { vol: '1', num: '2', title: '' });
});

test('parseChapterString: глава без тома (оншот)', () => {
  assert.deepEqual(parseChapterString('1 Кому улыбнётся мир?'), {
    vol: '1',
    num: '1',
    title: 'Кому улыбнётся мир?',
  });
});

test('parseChapterString: строка вида 8-9 трактуется буквально', () => {
  assert.deepEqual(parseChapterString('1 - 8-9'), { vol: '1', num: '8-9', title: '' });
});

test('chapterFolderName: с названием и без', () => {
  assert.equal(chapterFolderName({ num: '8', title: '' }), '8');
  assert.equal(chapterFolderName({ num: '2.5', title: 'Экстра' }), '2.5 - Экстра');
});

test('seriesFolderName: [год] и без года', () => {
  assert.equal(seriesFolderName('Суи и Нери с закатной планеты', '2020'),
    'Суи и Нери с закатной планеты [2020]');
  assert.equal(seriesFolderName('Оншот', null), 'Оншот');
});

test('mangoTemplateParts: тайтл, том, глава и языковой суффикс', () => {
  assert.deepEqual(
    mangoTemplateParts('%orig_title%%year_part%/Volume %volume%/%chapter%%chapter_title_part%', {
      title: 'Суи и Нери с закатной планеты',
      year: '2020',
      volume: '6',
      number: '61',
      chapterTitle: 'Нери',
    }),
    ['Суи и Нери с закатной планеты [2020]', 'Volume 6', '61 - Нери'],
  );
  assert.deepEqual(
    mangoTemplateParts('%orig_title% [%year_part%]/%chapter%', {
      title: 'Оншот',
      year: '',
      number: '1',
    }),
    ['Оншот', '1'],
  );
});

test('sanitizeName: запрещённые символы, хвостовые точки, длина', () => {
  assert.equal(sanitizeName('а/б\\в:г*д?е"ж<з>и|к'), 'а - б - в - гдежзи - к');
  assert.equal(
    sanitizeName('Дремлющая принцесса: Неизвестная история обо мне'),
    'Дремлющая принцесса - Неизвестная история обо мне',
  );
  assert.equal(sanitizeName('Не смейся, Сидзима.'), 'Не смейся, Сидзима');
  assert.equal(sanitizeName('a:b'), 'a - b');
  assert.equal(sanitizeName('Title:'), 'Title');
  assert.equal(sanitizeName('  много   пробелов  '), 'много пробелов');
  assert.equal(sanitizeName('x'.repeat(200)).length, 150);
});

test('pageFileName: 3 цифры, с 1000 страниц — 4', () => {
  assert.equal(pageFileName(0, 27, '.webp'), '000.webp');
  assert.equal(pageFileName(26, 27, '.webp'), '026.webp');
  assert.equal(pageFileName(5, 1200, '.webp'), '0005.webp');
});

test('isMangaPageUrl: только страницы тайтлов com-x', () => {
  assert.equal(isMangaPageUrl('https://com-x.life/26588-sui-i-neri.html'), true);
  assert.equal(isMangaPageUrl('https://ru.com-x.life/26588-sui-i-neri.html'), true);
  assert.equal(isMangaPageUrl('https://com-x.life/reader/26588/918139'), false);
  assert.equal(isMangaPageUrl('https://example.com/26588-title.html'), false);
  assert.equal(isMangaPageUrl('не ссылка'), false);
});

test('newsIdFromUrl', () => {
  assert.equal(newsIdFromUrl('https://com-x.life/26588-sui-i-neri.html'), '26588');
  assert.equal(newsIdFromUrl('https://com-x.life/'), null);
});

test('pagesFromReaderData: хосты в порядке попыток, пути без хоста', () => {
  const pages = pagesFromReaderData({
    host: 'img.com-x.life',
    host_ru: 'rus.com-x.life',
    images: ['26588/918139/1.jpg', '26588/918139/2.png'],
  });
  assert.deepEqual(pages.hosts, ['img.com-x.life', 'rus.com-x.life']);
  assert.deepEqual(pages.images, [
    { path: '26588/918139/1.jpg', extFromUrl: '.jpg' },
    { path: '26588/918139/2.png', extFromUrl: '.png' },
  ]);
});

test('uniqueFolderName: свободная, затем 2, 3…', () => {
  assert.equal(uniqueFolderName('Тайтл', () => false), 'Тайтл');
  const taken = new Set(['Тайтл', 'Тайтл 2']);
  assert.equal(uniqueFolderName('Тайтл', (name) => taken.has(name)), 'Тайтл 3');
});
