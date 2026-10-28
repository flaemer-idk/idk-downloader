/**
 * Серверный headless Chromium только для ComX (com-x.life).
 *
 * MangaDex и MangaLib работают через свои API и этот модуль не трогают.
 *
 * Зачем ComX: DleGuard пропускает только настоящий браузерный TLS/JS-отпечаток —
 * серверный fetch/curl молча тарпитятся. Chromium проходит челлендж сам, без
 * логина и cookies. Запускается лениво и только на момент разбора страницы
 * (не во время скачивания, не при старте сервера). Профиль лежит рядом с БД,
 * поэтому сессия антибота переживает перезапуски сервера.
 *
 * `puppeteer-core` — тонкий клиент к уже установленному браузеру: ничего не
 * скачивает и не требует драйверов (это не Selenium). Путь задаётся
 * CHROMIUM_PATH или ищется по типовым путям/PATH.
 */

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { config } from '../config.js';
import * as db from '../db.js';

const CANDIDATES = [
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
  'chrome',
];

function findInPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* ищем дальше */
    }
  }
  return null;
}

function resolveChromiumPath() {
  // Настройка из веб-морды главнее переменной окружения (как у папок).
  const settings = db.getSettings();
  const configured = String(settings.chromium_path || '').trim();
  if (configured) return configured;
  if (config.chromiumPath) return config.chromiumPath;
  const known = [
    '/run/current-system/sw/bin/chromium', // NixOS
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
  ];
  for (const candidate of known) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const name of CANDIDATES) {
    const found = findInPath(name);
    if (found) return found;
  }
  return null;
}

function profileDir() {
  return path.join(path.dirname(config.dbFile), 'mango-chromium-profile');
}

let browserPromise = null;
let closeRequested = false;

async function getBrowser() {
  if (closeRequested) throw new Error('сервер останавливается');
  if (!browserPromise) {
    const executablePath = resolveChromiumPath();
    if (!executablePath) {
      browserPromise = null;
      throw new Error(
        'Chromium не найден. Установите его или задайте CHROMIUM_PATH ' +
          '(например /run/current-system/sw/bin/chromium на NixOS)',
      );
    }
    fs.mkdirSync(profileDir(), { recursive: true });
    browserPromise = puppeteer
      .launch({
        executablePath,
        headless: true,
        userDataDir: profileDir(),
        args: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          // DleGuard тарпитит браузер с видимыми признаками автоматизации
          '--disable-blink-features=AutomationControlled',
        ],
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

/** Один Chromium — не даём двум разборам страниц работать одновременно. */
let chain = Promise.resolve();
function exclusive(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function openPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return page;
}

async function gotoAndWait(page, url, waitWhat, timeoutMs) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (error) {
    // Реклама/аналитика могут держать догрузку — страница при этом уже живая;
    // окончательно решает waitForFunction ниже.
    if (error?.name !== 'TimeoutError') throw error;
  }
  await page.waitForFunction(waitWhat, { timeout: timeoutMs, polling: 500 });
}

/**
 * Страница тайтла → { url, title, year, chapters: [{id, title, posi}] }.
 */
export async function fetchMangaInfo(url) {
  return exclusive(async () => {
    const browser = await getBrowser();
    const page = await openPage(browser);
    try {
      await gotoAndWait(
        page,
        url,
        () =>
          typeof window.__DATA__ !== 'undefined' &&
          window.__DATA__ &&
          Array.isArray(window.__DATA__.chapters) &&
          window.__DATA__.chapters.length > 0,
        35000,
      );
      const info = await page.evaluate(() => {
        const h1 = document.querySelector('h1.flex-grow-1');
        const yearLine = [...document.querySelectorAll('li')].find((li) =>
          li.textContent.includes('Год:'),
        );
        return {
          url: location.origin + location.pathname,
          title: h1 ? h1.textContent.trim() : null,
          year: yearLine && yearLine.querySelector('a')
            ? yearLine.querySelector('a').textContent.trim()
            : null,
          chapters: window.__DATA__.chapters.map((chapter) => ({
            id: chapter.id,
            title: chapter.title,
            posi: chapter.posi,
          })),
        };
      });
      if (!info.title) throw new Error('на странице не нашлось название тайтла');
      return info;
    } finally {
      await page.close().catch(() => {});
    }
  });
}

/**
 * Страница читалки → { host, host_ru, images: [путь, ...] }.
 */
export async function fetchReaderInfo(readerUrl) {
  return exclusive(async () => {
    const browser = await getBrowser();
    const page = await openPage(browser);
    try {
      await gotoAndWait(
        page,
        readerUrl,
        () =>
          typeof window.__DATA__ !== 'undefined' &&
          window.__DATA__ &&
          Array.isArray(window.__DATA__.images) &&
          window.__DATA__.images.length > 0,
        35000,
      );
      return await page.evaluate(() => ({
        host: window.__DATA__.host || null,
        host_ru: window.__DATA__.host_ru || null,
        images: window.__DATA__.images.map(String),
      }));
    } finally {
      await page.close().catch(() => {});
    }
  });
}

/** Останавливает браузер при выключении сервера. */
export async function close() {
  closeRequested = true;
  const pending = browserPromise;
  browserPromise = null;
  if (pending) {
    try {
      const browser = await pending;
      await browser.close();
    } catch {
      /* уже закрыт */
    }
  }
}