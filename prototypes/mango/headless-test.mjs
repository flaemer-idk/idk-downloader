// Тест: проходит ли headless Chromium DleGuard и отдаёт ли window.__DATA__.
// Это сценарий «юзер вставил ссылку в веб-морду → сервер сам всё открыл»:
// клиент и расширение не нужны.
import puppeteer from 'puppeteer-core';

const url = process.argv[2] || 'https://com-x.life/26588-sui-i-neri-s-zakatnoj-planety.html';
const HIDE_WEBDRIVER = !process.argv.includes('--raw');

const browser = await puppeteer.launch({
  executablePath: '/run/current-system/sw/bin/chromium',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    // как в референсе-форке: скрыть признаки автоматизации
    '--disable-blink-features=AutomationControlled',
    '--excludeSwitches=enable-automation',
  ],
});

try {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  );
  if (HIDE_WEBDRIVER) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  console.log(`→ открываю ${url} (webdriver hidden: ${HIDE_WEBDRIVER})`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const state = await page.evaluate(() => ({
      url: location.href,
      title: document.title.slice(0, 60),
      htmlLen: document.documentElement.outerHTML.length,
      hasData:
        typeof window.__DATA__ !== 'undefined' &&
        window.__DATA__ &&
        Array.isArray(window.__DATA__.chapters),
      webdriver: navigator.webdriver,
    }));
    console.log(`  t=${(i + 1) * 5}s`, JSON.stringify(state));
    if (state.hasData) break;
  }

  const hasData = await page.evaluate(
    () => typeof window.__DATA__ !== 'undefined' && window.__DATA__ && Array.isArray(window.__DATA__.chapters),
  );
  if (!hasData) {
    console.log('✗ __DATA__ не появился; сниппет страницы:');
    console.log(await page.evaluate(() => document.body ? document.body.innerText.slice(0, 500) : '(пусто)'));
    await browser.close();
    process.exit(1);
  }

  const info = await page.evaluate(() => {
    const h1 = document.querySelector('h1.flex-grow-1');
    const yearEl = [...document.querySelectorAll('li')].find((li) => li.textContent.includes('Год:'));
    return {
      title: h1 ? h1.textContent.trim() : null,
      year: yearEl && yearEl.querySelector('a') ? yearEl.querySelector('a').textContent.trim() : null,
      chapters: window.__DATA__.chapters.map((c) => ({ id: c.id, title: c.title, posi: c.posi })),
    };
  });
  console.log(`✓ тайтл: ${info.title} (${info.year ?? 'год не найден'}), глав: ${info.chapters.length}`);

  // читалка первой главы тем же браузером
  const readerUrl = 'https://com-x.life/reader/26588/918139';
  console.log('→ открываю читалку', readerUrl);
  await page.goto(readerUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(
    () => typeof window.__DATA__ !== 'undefined' && window.__DATA__ && Array.isArray(window.__DATA__.images),
    { timeout: 30000, polling: 500 },
  );
  const reader = await page.evaluate(() => ({
    host: window.__DATA__.host,
    host_ru: window.__DATA__.host_ru,
    images: window.__DATA__.images.length,
  }));
  console.log(`✓ читалка: ${reader.images} страниц, host=${reader.host}, host_ru=${reader.host_ru}`);
  console.log('✓ ИТОГ: headless Chromium проходит DleGuard без логина и cookies');
} finally {
  await browser.close();
}
