/**
 * Demo API for frontend-playground.
 *
 * This file replaces window.fetch before app.js loads. There is no backend:
 * every /api/* request is answered from the in-memory store below, and the
 * store is persisted to localStorage so the demo survives a page refresh.
 *
 * The real server/public files are untouched. Edit this copy when you want to
 * try a new design; copy changes back manually when they are ready.
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'idk-playground-v1';
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  const now = () => Date.now();
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const DEFAULT_SETTINGS = {
    download_dir: '/home/demo/Downloads',
    library_dir: '',
    library_categories: [
      'films = арбузные фильмы',
      'series = арбузные несколькосерий',
      'animation = морковные фильмы',
      'cartoons = банановые фильмы',
      'documentary = Документальные',
    ].join('\n'),
    mango_dir: '',
    chromium_path: '/run/current-system/sw/bin/chromium',
    max_concurrent: '2',
    max_attempts: '5',
    retry_delay_ms: '15000',
    overwrite_existing: '1',
    filename_template_film: '%orig_title%%year_part%/%orig_title%',
    filename_template_series: '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%',
    filename_template_subtitle:
      '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%.%subtitle_lang%',
    filename_template_mango:
      '%orig_title%%year_part%/Volume %volume%/%chapter%%chapter_title_part%',
    // Structured demo rules for the Categories editor. Real backend needs a
    // migration before this can replace library_categories.
    library_rules: defaultLibraryRules(),
    rezka_cookies: '',
  };

  function defaultLibraryRules() {
    return [
      { section: 'animation', kind: 'film', rating: 'any', folder: 'морковные фильмы' },
      { section: 'animation', kind: 'series', rating: 'any', folder: 'морковные несколькосерий' },
      { section: 'films', kind: 'film', rating: 'any', folder: 'арбузные фильмы' },
      { section: 'series', kind: 'series', rating: 'any', folder: 'арбузные несколькосерий' },
      { section: 'cartoons', kind: 'film', rating: 'any', folder: 'банановые фильмы' },
      { section: 'cartoons', kind: 'series', rating: 'any', folder: 'банановые несколькосерий' },
      { section: 'cartoons', kind: 'film', rating: '16+', folder: 'томатные фильмы' },
      { section: 'cartoons', kind: 'film', rating: '18+', folder: 'томатные фильмы' },
      { section: 'cartoons', kind: 'series', rating: '16+', folder: 'томатные несколькосерий' },
      { section: 'cartoons', kind: 'series', rating: '18+', folder: 'томатные несколькосерий' },
    ];
  }

  function task(overrides) {
    return Object.assign(
      {
        id: 0,
        status: 'queued',
        url: '',
        altUrls: [],
        filename: '',
        referer: '',
        movieId: null,
        title: null,
        origTitle: null,
        quality: null,
        voiceover: null,
        season: null,
        seasonTitle: null,
        year: null,
        episode: null,
        episodeTitle: null,
        fileType: 'video',
        subtitleLang: null,
        subtitleLangCode: null,
        realWidth: null,
        realHeight: null,
        totalBytes: 0,
        receivedBytes: 0,
        attempts: 1,
        error: null,
        filePath: null,
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        queueHidden: false,
      },
      overrides,
    );
  }

  function seedTasks() {
    const t = now();
    return [
      task({
        id: 1,
        status: 'done',
        url: 'https://cdn.example/dune-part-two-2024-1080p.mkv',
        filename: 'арбузные фильмы/Дюна: Часть вторая (2024)/Дюна: Часть вторая (2024).mkv',
        referer: 'https://hdrezka.example/films/123-dune-part-two.html',
        movieId: 'dune-2',
        title: 'Дюна: Часть вторая',
        origTitle: 'Dune: Part Two',
        quality: '1080p',
        year: '2024',
        totalBytes: 8.4 * GB,
        receivedBytes: 8.4 * GB,
        realWidth: 1920,
        realHeight: 1080,
        createdAt: t - 3 * 60 * 60 * 1000,
        startedAt: t - 2.9 * 60 * 60 * 1000,
        finishedAt: t - 2.1 * 60 * 60 * 1000,
      }),
      task({
        id: 2,
        status: 'downloading',
        url: 'https://cdn.example/avatar-2009-4k.mkv',
        filename: 'арбузные фильмы/Аватар (2009)/Аватар (2009).mkv',
        referer: 'https://hdrezka.example/films/456-avatar.html',
        movieId: 'avatar',
        title: 'Аватар',
        origTitle: 'Avatar',
        quality: '4K',
        year: '2009',
        totalBytes: 12.1 * GB,
        receivedBytes: 7.6 * GB,
        realWidth: 3840,
        realHeight: 2160,
        createdAt: t - 22 * 60 * 1000,
        startedAt: t - 20 * 60 * 1000,
      }),
      task({
        id: 3,
        status: 'done',
        url: 'https://cdn.example/shining-s01e01.mkv',
        filename: 'арбузные несколькосерий/The Shining (1997)/Season 1/The Shining S01E01.mkv',
        referer: 'https://hdrezka.example/series/789-the-shining.html',
        movieId: 'shining',
        title: 'The Shining',
        origTitle: 'The Shining',
        quality: '1080p',
        year: '1997',
        season: '1',
        episode: '1',
        episodeTitle: 'The Shining',
        totalBytes: 1.4 * GB,
        receivedBytes: 1.4 * GB,
        realWidth: 1440,
        realHeight: 1080,
        createdAt: t - 5 * 60 * 60 * 1000,
        startedAt: t - 4.8 * 60 * 60 * 1000,
        finishedAt: t - 4.5 * 60 * 60 * 1000,
      }),
      task({
        id: 4,
        status: 'done',
        url: 'https://cdn.example/shining-s01e01.rus.vtt',
        filename: 'арбузные несколькосерий/The Shining (1997)/Season 1/The Shining S01E01.rus.vtt',
        referer: 'https://hdrezka.example/series/789-the-shining.html',
        movieId: 'shining',
        title: 'The Shining',
        origTitle: 'The Shining',
        year: '1997',
        season: '1',
        episode: '1',
        fileType: 'subtitle',
        subtitleLang: 'Русский',
        subtitleLangCode: 'rus',
        totalBytes: 48 * 1024,
        receivedBytes: 48 * 1024,
        createdAt: t - 4.6 * 60 * 60 * 1000,
        finishedAt: t - 4.5 * 60 * 60 * 1000,
      }),
      task({
        id: 5,
        status: 'downloading',
        url: 'https://cdn.example/shining-s01e02.mkv',
        filename: 'арбузные несколькосерий/The Shining (1997)/Season 1/The Shining S01E02.mkv',
        referer: 'https://hdrezka.example/series/789-the-shining.html',
        movieId: 'shining',
        title: 'The Shining',
        origTitle: 'The Shining',
        quality: '1080p',
        year: '1997',
        season: '1',
        episode: '2',
        episodeTitle: 'The Shining: Part 2',
        totalBytes: 1.4 * GB,
        receivedBytes: 620 * MB,
        realWidth: 1440,
        realHeight: 1080,
        createdAt: t - 18 * 60 * 1000,
        startedAt: t - 16 * 60 * 1000,
      }),
      task({
        id: 6,
        status: 'queued',
        url: 'https://cdn.example/shining-s01e03.mkv',
        filename: 'арбузные несколькосерий/The Shining (1997)/Season 1/The Shining S01E03.mkv',
        referer: 'https://hdrezka.example/series/789-the-shining.html',
        movieId: 'shining',
        title: 'The Shining',
        origTitle: 'The Shining',
        quality: '1080p',
        year: '1997',
        season: '1',
        episode: '3',
        episodeTitle: 'The Shining: Part 3',
        totalBytes: 1.4 * GB,
        receivedBytes: 0,
        createdAt: t - 17 * 60 * 1000,
      }),
      task({
        id: 7,
        status: 'error',
        url: 'https://cdn.example/interstellar-2014-1080p.mkv',
        filename: 'арбузные фильмы/Интерстеллар (2014)/Интерстеллар (2014).mkv',
        referer: 'https://hdrezka.example/films/999-interstellar.html',
        movieId: 'interstellar',
        title: 'Интерстеллар',
        origTitle: 'Interstellar',
        quality: '1080p',
        year: '2014',
        totalBytes: 10.2 * GB,
        receivedBytes: 2.2 * GB,
        error: 'HTTP 403 Forbidden — ссылка устарела',
        createdAt: t - 2 * 60 * 60 * 1000,
        startedAt: t - 2 * 60 * 60 * 1000,
        finishedAt: t - 1.9 * 60 * 60 * 1000,
      }),
      task({
        id: 8,
        status: 'paused',
        url: 'https://cdn.example/blade-runner-2049.mkv',
        filename: 'арбузные фильмы/Бегущий по лезвию 2049 (2017)/Бегущий по лезвию 2049 (2017).mkv',
        referer: 'https://hdrezka.example/films/777-blade-runner-2049.html',
        movieId: 'blade-runner',
        title: 'Бегущий по лезвию 2049',
        origTitle: 'Blade Runner 2049',
        quality: '1080p',
        year: '2017',
        totalBytes: 9.3 * GB,
        receivedBytes: 4.1 * GB,
        createdAt: t - 40 * 60 * 1000,
        startedAt: t - 38 * 60 * 1000,
      }),
      task({
        id: 9,
        status: 'canceled',
        url: 'https://cdn.example/shawshank-1994.mkv',
        filename: 'арбузные фильмы/Побег из Шоушенка (1994)/Побег из Шоушенка (1994).mkv',
        referer: 'https://hdrezka.example/films/321-shawshank.html',
        movieId: 'shawshank',
        title: 'Побег из Шоушенка',
        origTitle: 'The Shawshank Redemption',
        quality: '1080p',
        year: '1994',
        totalBytes: 4.2 * GB,
        receivedBytes: 1.1 * GB,
        createdAt: t - 6 * 60 * 60 * 1000,
        finishedAt: t - 5.7 * 60 * 60 * 1000,
      }),
    ];
  }

  function chapterForJob(id, volume, number, title, status, pagesDone) {
    return {
      id,
      label: title ? `${number} - ${title}` : String(number),
      volume: String(volume),
      number: String(number),
      title,
      language: 'ru',
      group: 'Закатная планета',
      status,
      pagesDone,
      pagesTotal: 18,
      error: null,
    };
  }

  function seedJobs() {
    const t = now();
    return [
      {
        id: 1,
        seriesKey: 'mangalib:demo-sui',
        url: 'https://mangalib.me/ru/manga/99999--sui-i-neri',
        source: 'mangalib',
        sourceLabel: 'MangaLib',
        language: 'ru',
        title: 'Суи и Нери с закатной планеты',
        year: '2020',
        folder: 'Суи и Нери с закатной планеты [2020]',
        status: 'running',
        total: 6,
        done: 3,
        skipped: 0,
        failed: [],
        current: { id: 'mangalib:demo-sui:61', label: '61 - Нери', pagesDone: 7, pagesTotal: 18 },
        error: null,
        dir: '/demo/downloads/mango/Суи и Нери с закатной планеты [2020]',
        startedAt: t - 4 * 60 * 1000,
        finishedAt: null,
        chapters: [
          chapterForJob('mangalib:demo-sui:55', 6, 55, 'Письмо с заката', 'done', 18),
          chapterForJob('mangalib:demo-sui:56', 6, 56, 'Зелёное яблоко', 'done', 18),
          chapterForJob('mangalib:demo-sui:57', 6, 57, 'Дорога домой', 'done', 18),
          chapterForJob('mangalib:demo-sui:61', 6, 61, 'Нери', 'downloading', 7),
          chapterForJob('mangalib:demo-sui:62', 6, 62, 'Свет', 'queued', 0),
          chapterForJob('mangalib:demo-sui:63', 7, 63, 'Сон', 'queued', 0),
        ],
      },
      {
        id: 2,
        seriesKey: 'mangadex:demo-one-piece',
        url: 'https://mangadex.org/title/demo-one-piece',
        source: 'mangadex',
        sourceLabel: 'MangaDex',
        language: 'ru',
        title: 'Ван Пис',
        year: '1997',
        folder: 'Ван Пис [1997]',
        status: 'done',
        total: 3,
        done: 3,
        skipped: 0,
        failed: [],
        current: null,
        error: null,
        dir: '/demo/downloads/mango/Ван Пис [1997]',
        startedAt: t - 2 * 60 * 60 * 1000,
        finishedAt: t - 90 * 60 * 1000,
        chapters: [
          chapterForJob('mangadex:demo-one-piece:1', 1, 1, 'Рассвет романтики', 'done', 50),
          chapterForJob('mangadex:demo-one-piece:2', 1, 2, 'Луффи Соломенная шляпа', 'done', 52),
          chapterForJob('mangadex:demo-one-piece:3', 1, 3, 'Морган против Луффи', 'done', 48),
        ],
      },
    ];
  }

  function seedHistory() {
    const t = now();
    const rows = [];
    let id = 1;
    for (let number = 51; number <= 55; number++) {
      rows.push({
        id: id++,
        series_key: 'mangalib:demo-sui',
        series_url: 'https://mangalib.me/ru/manga/99999--sui-i-neri',
        series_title: 'Суи и Нери с закатной планеты',
        year: '2020',
        chapter_id: `mangalib:demo-sui:${number}`,
        volume: '6',
        number: String(number),
        title: number === 55 ? 'Письмо с заката' : '',
        folder: number === 55 ? `${number} - Письмо с заката` : String(number),
        pages: 18,
        source: 'mangalib',
        language: 'ru',
        group_name: 'Закатная планета',
        chapter_url: `https://mangalib.me/ru/manga/99999--sui-i-neri/read?volume=6&number=${number}`,
        is_external: 0,
        created_at: t - (60 - number) * 60 * 1000,
      });
    }
    for (let number = 63; number <= 65; number++) {
      rows.push({
        id: id++,
        series_key: 'mangalib:demo-sui',
        series_url: 'https://mangalib.me/ru/manga/99999--sui-i-neri',
        series_title: 'Суи и Нери с закатной планеты',
        year: '2020',
        chapter_id: `mangalib:demo-sui:${number}`,
        volume: '7',
        number: String(number),
        title: number === 63 ? 'Сон' : '',
        folder: number === 63 ? `${number} - Сон` : String(number),
        pages: 18,
        source: 'mangalib',
        language: 'ru',
        group_name: 'Закатная планета',
        chapter_url: `https://mangalib.me/ru/manga/99999--sui-i-neri/read?volume=7&number=${number}`,
        is_external: 0,
        created_at: t - (80 - number) * 60 * 1000,
      });
    }
    for (let number = 1; number <= 3; number++) {
      rows.push({
        id: id++,
        series_key: 'mangadex:demo-one-piece',
        series_url: 'https://mangadex.org/title/demo-one-piece',
        series_title: 'Ван Пис',
        year: '1997',
        chapter_id: `mangadex:demo-one-piece:${number}`,
        volume: '1',
        number: String(number),
        title: '',
        folder: String(number),
        pages: 50,
        source: 'mangadex',
        language: 'ru',
        group_name: 'Sunset Scan',
        chapter_url: `https://mangadex.org/chapter/demo-${number}`,
        is_external: 0,
        created_at: t - (120 - number) * 60 * 1000,
      });
    }
    return rows;
  }

  function seed() {
    return {
      settings: { ...DEFAULT_SETTINGS },
      tasks: seedTasks(),
      jobs: seedJobs(),
      history: seedHistory(),
      nextTaskId: 10,
      nextJobId: 3,
      lastSeries: null,
      lastTick: now(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seed();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.jobs)) return seed();
      parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
      parsed.history = Array.isArray(parsed.history) ? parsed.history : [];
      parsed.nextTaskId = Number(parsed.nextTaskId) || 100;
      parsed.nextJobId = Number(parsed.nextJobId) || 10;
      parsed.lastTick = Number(parsed.lastTick) || now();
      return parsed;
    } catch {
      return seed();
    }
  }

  let store = load();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* file:// or private mode — the demo still works until reload */
    }
  }

  function stats() {
    const result = { queued: 0, downloading: 0, paused: 0, done: 0, error: 0, canceled: 0 };
    store.tasks.forEach((item) => {
      if (result[item.status] !== undefined) result[item.status] += 1;
    });
    return result;
  }

  function remainingBytes() {
    return store.tasks.reduce((sum, item) => {
      if (['done', 'canceled'].includes(item.status)) return sum;
      return sum + Math.max(0, (item.totalBytes || 0) - (item.receivedBytes || 0));
    }, 0);
  }

  function serverInfo() {
    const active = store.tasks.filter((item) => item.status === 'downloading').length;
    const free = 84 * GB;
    return {
      version: '0.1.0-playground',
      node: 'demo',
      ffmpeg: true,
      downloadDir: store.settings.download_dir,
      saveDir: store.settings.download_dir,
      libraryDir: null,
      freeSpace: free,
      totalSpace: 512 * GB,
      needBytes: remainingBytes(),
      needUnknown: 0,
      placeholderBytes: 0,
      spaceEnough: true,
      active,
      mangoDir: `${store.settings.download_dir}/mango`,
      mangoActive: store.jobs.filter((job) => job.status === 'running').length,
    };
  }

  function tickTasks(seconds) {
    const max = Math.max(1, Number(store.settings.max_concurrent) || 2);
    let active = store.tasks.filter((item) => item.status === 'downloading').length;
    for (const item of store.tasks) {
      if (item.status === 'queued' && active < max) {
        item.status = 'downloading';
        item.startedAt = now();
        active += 1;
      }
    }
    for (const item of store.tasks) {
      if (item.status !== 'downloading') continue;
      const total = item.totalBytes || 0;
      if (total <= 0) continue;
      // Slow enough to watch: roughly 5 minutes for a full demo file.
      item.receivedBytes = Math.min(
        total,
        (item.receivedBytes || 0) + (total / 300) * seconds,
      );
      if (item.receivedBytes >= total) {
        item.receivedBytes = total;
        item.status = 'done';
        item.finishedAt = now();
      }
    }
  }

  function addHistory(job, chapter) {
    const exists = store.history.some(
      (row) => row.chapter_id === chapter.id && row.series_key === job.seriesKey,
    );
    if (exists) return;
    store.history.unshift({
      id: (store.history.reduce((max, row) => Math.max(max, row.id || 0), 0) || 0) + 1,
      series_key: job.seriesKey,
      series_url: job.url,
      series_title: job.title,
      year: job.year,
      chapter_id: chapter.id,
      volume: chapter.volume,
      number: chapter.number,
      title: chapter.title,
      folder: chapter.label,
      pages: chapter.pagesTotal,
      source: job.source,
      language: chapter.language || job.language,
      group_name: chapter.group || null,
      chapter_url: null,
      is_external: 0,
      created_at: now(),
    });
  }

  function finishJob(job) {
    job.status = 'done';
    job.finishedAt = now();
    job.current = null;
    job.done = job.chapters.filter((chapter) => chapter.status === 'done').length;
  }

  function tickJobs(seconds) {
    for (const job of store.jobs) {
      if (job.status !== 'running') continue;
      let current = job.chapters.find((chapter) => chapter.status === 'downloading');
      if (!current) {
        current = job.chapters.find((chapter) => chapter.status === 'queued');
        if (!current) {
          finishJob(job);
          continue;
        }
        current.status = 'downloading';
        current.pagesDone = 0;
      }

      current.pagesDone = Math.min(
        current.pagesTotal,
        (current.pagesDone || 0) + Math.max(1, seconds * 2),
      );
      job.current = {
        id: current.id,
        label: current.label,
        pagesDone: current.pagesDone,
        pagesTotal: current.pagesTotal,
      };

      if (current.pagesDone >= current.pagesTotal) {
        current.status = 'done';
        addHistory(job, current);
        const next = job.chapters.find((chapter) => chapter.status === 'queued');
        if (next) {
          next.status = 'downloading';
          next.pagesDone = 0;
          job.current = {
            id: next.id,
            label: next.label,
            pagesDone: 0,
            pagesTotal: next.pagesTotal,
          };
        } else {
          finishJob(job);
        }
      }
      job.done = job.chapters.filter((chapter) => chapter.status === 'done').length;
    }
  }

  function tick(seconds) {
    const elapsed = Number(seconds) || Math.max(0.25, (now() - store.lastTick) / 1000);
    store.lastTick = now();
    tickTasks(Math.min(10, elapsed));
    tickJobs(Math.min(10, elapsed));
    persist();
  }

  function previewCard(overrides) {
    return {
      id: '',
      title: '',
      origTitle: '',
      year: '',
      kind: 'film',
      section: 'films',
      rating: '16+',
      source: 'rezka.fi',
      quality: '1080p',
      qualityOptions: ['Auto', '2160p', '1080p Ultra', '1080p', '720p', '480p'],
      voiceover: 'Дубляж',
      voiceovers: ['Дубляж', 'LostFilm', 'Кубик в Кубе'],
      subtitles: ['ru'],
      downloaded: 0,
      total: 1,
      episodes: [],
      ...overrides,
    };
  }

  function episodeList(count, downloadedCount) {
    const rows = [];
    for (let index = 1; index <= count; index++) {
      rows.push({
        id: `s1e${index}`,
        season: '1',
        episode: String(index),
        title: `Серия ${index}`,
        downloaded: index <= downloadedCount,
      });
    }
    return rows;
  }

  /**
   * Prototype resolver: turns a franchise/favorites/title link into cards.
   * It is deterministic and does not touch the network.
   */
  function previewLink(rawUrl) {
    let url;
    try {
      url = new URL(String(rawUrl || '').trim());
    } catch {
      throw new Error('Нужна корректная ссылка http(s)://…');
    }
    const path = url.pathname.toLowerCase();
    const source = url.hostname.replace(/^www\./, '');
    const isFranchise = path.includes('/franchises/');
    const isFavorites = path.includes('/favorites/');
    const section = path.includes('/animation/')
      ? 'animation'
      : path.includes('/cartoons/')
        ? 'cartoons'
        : path.includes('/series/')
          ? 'series'
          : 'films';

    let cards;
    if (isFranchise) {
      cards = [
        previewCard({
          id: 'shining-1980',
          title: 'Сияние',
          origTitle: 'The Shining',
          year: '1980',
          kind: 'film',
          section: 'films',
          rating: '18+',
          quality: '1080p Ultra',
          downloaded: 1,
          total: 1,
          source,
        }),
        previewCard({
          id: 'shining-1997',
          title: 'Сияние',
          origTitle: 'The Shining',
          year: '1997',
          kind: 'series',
          section: 'series',
          rating: '18+',
          quality: '1080p',
          downloaded: 1,
          total: 3,
          episodes: episodeList(3, 1),
          source,
        }),
        previewCard({
          id: 'doctor-sleep',
          title: 'Доктор Сон',
          origTitle: 'Doctor Sleep',
          year: '2019',
          kind: 'film',
          section: 'films',
          rating: '18+',
          quality: '1080p Ultra',
          downloaded: 0,
          total: 1,
          source,
        }),
      ];
    } else if (isFavorites) {
      cards = [
        previewCard({
          id: 'dune-2',
          title: 'Дюна: Часть вторая',
          origTitle: 'Dune: Part Two',
          year: '2024',
          kind: 'film',
          section: 'films',
          quality: '2160p',
          downloaded: 1,
          total: 1,
          source,
        }),
        previewCard({
          id: 'avatar',
          title: 'Аватар',
          origTitle: 'Avatar',
          year: '2009',
          kind: 'film',
          section: 'films',
          quality: '1080p Ultra',
          downloaded: 0,
          total: 1,
          source,
        }),
      ];
    } else {
      // Section says anime/cartoon/film/series; series vs film needs episode
      // metadata, not just /animation/. A generic link is treated as a film.
      const kind = section === 'series' ? 'series' : 'film';
      const title = decodeURIComponent(
        (url.pathname.split('/').filter(Boolean).pop() || 'Разобранный тайтл')
          .replace(/^\d+-/, '')
          .replace(/-/g, ' '),
      );
      cards = [
        previewCard({
          id: 'parsed-1',
          title: title || 'Разобранный тайтл',
          origTitle: title || 'Parsed title',
          year: '2026',
          kind: kind === 'series' ? 'series' : 'film',
          section,
          rating: section === 'cartoons' ? '18+' : '16+',
          quality: section === 'animation' ? '1080p Ultra' : '1080p',
          downloaded: 0,
          total: kind === 'series' ? 2 : 1,
          episodes: kind === 'series' ? episodeList(2, 0) : [],
          source,
        }),
      ];
    }

    return {
      source,
      url: url.href,
      pageTitle: isFranchise ? 'Франшиза · Сияние' : isFavorites ? 'Закладки' : 'Ссылка',
      cards,
    };
  }

  function taskFromInput(raw) {
    const url = String(raw?.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Нужна ссылка http(s)://…');
    const parts = url.split('/').filter(Boolean);
    let fallbackName = 'demo-file';
    try {
      fallbackName = decodeURIComponent(parts[parts.length - 1] || 'demo-file').split('?')[0];
    } catch {
      fallbackName = 'demo-file';
    }
    const title = String(raw.title || '').trim() || fallbackName.replace(/\.[^.]+$/, '');
    const year = raw.year ? String(raw.year) : '2026';
    const season = raw.season ? String(raw.season) : null;
    const episode = raw.episode ? String(raw.episode) : null;
    const kind = raw.kind || (season ? 'series' : 'film');
    const section = raw.section || 'films';
    const rating = raw.rating || '16+';
    const folder = raw.folder || classifyCategory(section, kind, rating) || '';
    const quality = raw.quality && raw.quality !== 'auto' ? String(raw.quality) : '1080p';
    let filename = String(raw.filename || '').trim();
    if (!filename) {
      if (season && episode) {
        filename = `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}.mkv`;
      } else {
        filename = `${title}${year ? ` (${year})` : ''}.mkv`;
      }
      if (folder) filename = `${folder}/${filename}`;
    }
    if (!/\.[a-z0-9]+$/i.test(filename)) filename += '.mkv';
    const id = store.nextTaskId++;
    let referer = raw.referer ? String(raw.referer) : '';
    if (!referer) {
      try {
        referer = new URL(url).origin + '/';
      } catch {
        referer = '';
      }
    }
    return task({
      id,
      status: 'queued',
      url,
      filename,
      referer,
      movieId: raw.movieId ? String(raw.movieId) : `demo-${id}`,
      title,
      origTitle: raw.origTitle ? String(raw.origTitle) : title,
      quality,
      voiceover: raw.voiceover ? String(raw.voiceover) : null,
      season,
      episode,
      episodeTitle: raw.episodeTitle ? String(raw.episodeTitle) : null,
      year,
      fileType: raw.fileType === 'subtitle' ? 'subtitle' : 'video',
      totalBytes: Number(raw.totalBytes) || 1.8 * GB,
      receivedBytes: 0,
      createdAt: now(),
    });
  }

  function addDemoTask() {
    const id = store.nextTaskId++;
    store.tasks.unshift(
      task({
        id,
        status: 'queued',
        url: `https://cdn.example/demo-${id}.mkv`,
        filename: `арбузные фильмы/Демо-фильм ${id} (2026)/Демо-фильм ${id} (2026).mkv`,
        referer: 'https://hdrezka.example/films/demo.html',
        movieId: `demo-${id}`,
        title: `Демо-фильм ${id}`,
        origTitle: `Demo Movie ${id}`,
        quality: '1080p',
        year: '2026',
        totalBytes: 2.4 * GB,
        receivedBytes: 0,
        createdAt: now(),
      }),
    );
    persist();
    return id;
  }

  function resolveSettings(patch) {
    const next = { ...store.settings, ...(patch || {}) };
    if ('overwrite_existing' in (patch || {})) {
      next.overwrite_existing = patch.overwrite_existing ? '1' : '0';
    }
    // Library folder was removed: categories live directly under download_dir.
    next.library_dir = '';
    if (Array.isArray(next.library_rules)) {
      next.library_rules = next.library_rules
        .filter((rule) => rule && typeof rule === 'object')
        .map((rule) => ({
          section: String(rule.section || 'films'),
          kind: String(rule.kind || 'any'),
          rating: String(rule.rating || 'any'),
          folder: String(rule.folder || ''),
        }));
    }
    store.settings = next;
    persist();
    return store.settings;
  }

  /** Какой папке достанется раздел/тип/рейтинг. Возвращает правило или null. */
  function classifyCategoryRule(section, kind, rating) {
    const wantedSection = String(section || '').toLowerCase();
    const wantedKind = String(kind || 'any').toLowerCase();
    const wantedRating = String(rating || 'any').toLowerCase().replace(/\+/g, '');
    const rules = Array.isArray(store.settings.library_rules)
      ? store.settings.library_rules
      : defaultLibraryRules();
    const score = (rule) => {
      let value = 0;
      if (String(rule.rating || 'any').toLowerCase().replace(/\+/g, '') !== 'any') value += 2;
      if (String(rule.kind || 'any').toLowerCase() !== 'any') value += 1;
      if (String(rule.section || '').toLowerCase() === wantedSection) value += 4;
      return value;
    };
    return (
      rules
        .filter((rule) => String(rule.section || '').toLowerCase() === wantedSection)
        .filter((rule) => {
          const ruleKind = String(rule.kind || 'any').toLowerCase();
          return ruleKind === 'any' || ruleKind === wantedKind;
        })
        .filter((rule) => {
          const ruleRating = String(rule.rating || 'any').toLowerCase().replace(/\+/g, '');
          return ruleRating === 'any' || ruleRating === wantedRating;
        })
        .sort((a, b) => score(b) - score(a))[0] || null
    );
  }

  function publicJob(job) {
    return { ...clone(job), chapters: clone(job.chapters || []) };
  }

  function demoChapter(source, seriesKey, volume, number, language, downloaded) {
    const titles = {
      51: 'Письмо с заката',
      55: 'Письмо',
      56: 'Зелёное яблоко',
      61: 'Нери',
      62: 'Свет',
    };
    const title = titles[number] || '';
    const suffix = language && language !== 'ru' ? ` [${language}]` : '';
    const folder = `${number}${title ? ` - ${title}` : ''}${suffix}`;
    const id = `${seriesKey}:${number}`;
    return {
      id,
      volume: String(volume),
      number: String(number),
      title,
      folder,
      language,
      group: source === 'mangadex' ? 'Sunset Scan' : 'Закатная планета',
      external: false,
      unavailable: false,
      pages: 18,
      url:
        source === 'mangadex'
          ? `https://mangadex.org/chapter/demo-${number}`
          : `https://mangalib.me/ru/manga/99999--sui-i-neri/read?volume=${volume}&number=${number}`,
      downloaded,
      pending: false,
    };
  }

  /**
   * Demo title with the volume mix-up from the user's example:
   *   MangaLib: Volume 6 = 51–62 (12), Volume 7 = 63–70 (8)
   *   MangaDex: Volume 6 = 51–60 (10), Volume 7 = 61–70 (10)
   */
  function demoSeries(url, language) {
    const rawUrl = String(url || '');
    const source = /mangadex\./i.test(rawUrl)
      ? 'mangadex'
      : /com-x\./i.test(rawUrl)
        ? 'comx'
        : 'mangalib';
    const sourceLabel =
      source === 'mangadex' ? 'MangaDex' : source === 'comx' ? 'com-x.life' : 'MangaLib';
    const lang = source === 'mangadex' ? String(language || 'ru') : 'ru';
    const seriesKey = `${source}:demo-sui`;
    const ranges =
      source === 'mangalib'
        ? [
            { volume: 6, from: 51, to: 62 },
            { volume: 7, from: 63, to: 70 },
          ]
        : [
            { volume: 6, from: 51, to: 60 },
            { volume: 7, from: 61, to: 70 },
          ];
    const downloadedIds = new Set(
      store.history
        .filter((row) => row.series_key === seriesKey)
        .map((row) => String(row.chapter_id)),
    );
    const chapters = [];
    for (const range of ranges) {
      for (let number = range.from; number <= range.to; number++) {
        const id = `${seriesKey}:${number}`;
        chapters.push(
          demoChapter(
            source,
            seriesKey,
            range.volume,
            number,
            lang,
            downloadedIds.has(id),
          ),
        );
      }
    }
    return {
      source,
      sourceLabel,
      seriesKey,
      url:
        source === 'mangadex'
          ? 'https://mangadex.org/title/demo-sui'
          : source === 'comx'
            ? 'https://com-x.life/99999-sui-i-neri.html'
            : 'https://mangalib.me/ru/manga/99999--sui-i-neri',
      title: 'Суи и Нери с закатной планеты',
      year: '2020',
      folder: 'Суи и Нери с закатной планеты [2020]',
      language: lang,
      languages: source === 'mangadex' ? ['ru', 'en'] : [],
      chapters,
      active: false,
    };
  }

  function brief(series) {
    return {
      url: series.url,
      source: series.source,
      sourceLabel: series.sourceLabel,
      language: series.language,
      title: series.title,
      year: series.year,
      folder: series.folder,
    };
  }

  function loadDemo(source) {
    const url =
      source === 'mangadex'
        ? 'https://mangadex.org/title/demo-sui'
        : source === 'comx'
          ? 'https://com-x.life/99999-sui-i-neri.html'
          : 'https://mangalib.me/ru/manga/99999--sui-i-neri';
    const series = demoSeries(url, 'ru');
    store.lastSeries = clone(series);
    persist();
    window.location.hash = '#/mango';
    const app = window.state;
    if (app && app.mango) {
      app.mango.series = series;
      app.mango.selection = {};
      series.chapters.forEach((chapter) => {
        if (!chapter.downloaded && !chapter.unavailable) app.mango.selection[chapter.id] = true;
      });
      const box = document.getElementById('mango-chapters');
      if (box) box.dataset.key = '';
      if (typeof window.renderMango === 'function') window.renderMango();
    }
    return series;
  }

  function fixVolumes() {
    const app = window.state;
    const series = app && app.mango && app.mango.series;
    if (!series) return 0;
    let moved = 0;
    series.chapters.forEach((chapter) => {
      if (chapter.number === '61' || chapter.number === '62') {
        if (chapter.volume !== '7') moved += 1;
        chapter.volume = '7';
        chapter.url = String(chapter.url || '').replace(/volume=\d+/, 'volume=7');
      }
    });
    for (const job of store.jobs) {
      if (job.seriesKey !== series.seriesKey) continue;
      job.chapters.forEach((chapter) => {
        if (chapter.number === '61' || chapter.number === '62') chapter.volume = '7';
      });
    }
    for (const row of store.history) {
      if (row.series_key === series.seriesKey && (row.number === '61' || row.number === '62')) {
        row.volume = '7';
      }
    }
    store.lastSeries = clone(series);
    persist();
    const box = document.getElementById('mango-chapters');
    if (box) box.dataset.key = '';
    if (typeof window.renderMango === 'function') window.renderMango();
    if (typeof window.renderMangoHistory === 'function') window.renderMangoHistory();
    return moved;
  }

  function numberValue(value) {
    const number = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(number) ? number : 0;
  }

  /**
   * Rule: volumes stay contiguous. Moving 55 (vol 6) to 7 also moves 56–62;
   * moving 67 (vol 7) to 6 also moves 63–67. The target can be any number,
   * including a new volume; this is how a series is renumbered to 1/2.
   */
  function planMove(chapters, selectedIds, targetVolume) {
    const ids = new Set((selectedIds || []).map(String));
    const selected = chapters.filter((chapter) => ids.has(String(chapter.id)));
    if (!selected.length) throw new Error('Выберите хотя бы одну главу');
    const source = String(selected[0].volume);
    if (selected.some((chapter) => String(chapter.volume) !== source)) {
      throw new Error('Главы должны быть из одного тома');
    }
    const target = String(targetVolume);
    const sourceNumber = numberValue(source);
    const targetNumber = numberValue(target);
    if (!Number.isFinite(targetNumber) || targetNumber < 1 || !Number.isInteger(targetNumber)) {
      throw new Error('Укажи номер тома: целое число от 1');
    }
    if (targetNumber === sourceNumber) {
      throw new Error('Это тот же том');
    }
    const delta = targetNumber - sourceNumber;
    const sourceChapters = chapters
      .filter((chapter) => String(chapter.volume) === source)
      .sort((a, b) => numberValue(a.number) - numberValue(b.number));
    const selectedNumbers = selected.map((chapter) => numberValue(chapter.number));
    const edge = delta > 0 ? Math.min(...selectedNumbers) : Math.max(...selectedNumbers);
    const moving = sourceChapters.filter((chapter) =>
      delta > 0
        ? numberValue(chapter.number) >= edge
        : numberValue(chapter.number) <= edge,
    );
    return {
      source,
      target,
      moving,
      numbers: moving.map((chapter) => String(chapter.number)),
    };
  }

  function moveChapters(scope, seriesKey, jobId, selectedIds, targetVolume) {
    const app = window.state || {};
    const ids = new Set((selectedIds || []).map(String));
    let plan;
    if (scope === 'series') {
      const series = app.mango && app.mango.series;
      if (!series) throw new Error('Сначала открой тайтл');
      plan = planMove(series.chapters, selectedIds, targetVolume);
      series.chapters.forEach((chapter) => {
        if (plan.moving.some((item) => item.id === chapter.id)) {
          chapter.volume = plan.target;
        }
      });
      store.lastSeries = clone(series);
    } else if (scope === 'history') {
      const rows = store.history.filter((row) => row.series_key === seriesKey);
      const mapped = rows.map((row) => ({
        id: String(row.chapter_id),
        volume: String(row.volume),
        number: String(row.number),
      }));
      plan = planMove(mapped, selectedIds, targetVolume);
      const movingIds = new Set(plan.moving.map((item) => item.id));
      store.history.forEach((row) => {
        if (row.series_key === seriesKey && movingIds.has(String(row.chapter_id))) {
          row.volume = plan.target;
        }
      });
      if (app.mangoHistory) {
        app.mangoHistory.forEach((row) => {
          if (row.series_key === seriesKey && movingIds.has(String(row.chapter_id))) {
            row.volume = plan.target;
          }
        });
      } else {
        app.mangoHistory = clone(store.history);
      }
    } else if (scope === 'job') {
      const job = store.jobs.find((entry) => String(entry.id) === String(jobId));
      if (!job) throw new Error('Задание не найдено');
      plan = planMove(job.chapters, selectedIds, targetVolume);
      const movingIds = new Set(plan.moving.map((item) => item.id));
      job.chapters.forEach((chapter) => {
        if (movingIds.has(String(chapter.id))) chapter.volume = plan.target;
      });
      const appJob = (app.mango && app.mango.jobs || []).find(
        (entry) => String(entry.id) === String(job.id),
      );
      if (appJob) {
        appJob.chapters = clone(job.chapters);
        appJob.done = job.done;
        appJob.current = clone(job.current);
        appJob.status = job.status;
      }
    } else {
      throw new Error('Неизвестный режим переноса');
    }

    const filesMoved = plan.moving.filter((chapter) => {
      if (scope === 'history') return true;
      if (scope === 'series') return Boolean(chapter.downloaded);
      return chapter.status === 'done';
    }).length;
    persist();
    return {
      moved: plan.moving.length,
      filesMoved,
      from: plan.source,
      to: plan.target,
      numbers: plan.numbers,
    };
  }

  function setJobStatus(jobId, status) {
    const job = store.jobs.find((entry) => String(entry.id) === String(jobId));
    if (job) job.status = status;
    const app = window.state;
    const appJob = app && app.mango && (app.mango.jobs || []).find(
      (entry) => String(entry.id) === String(jobId),
    );
    if (appJob) appJob.status = status;
    persist();
    if (typeof window.renderMango === 'function') window.renderMango();
    return job || null;
  }

  function classifyCategory(section, kind, rating) {
    const rule = classifyCategoryRule(section, kind, rating);
    return rule ? rule.folder : null;
  }

  function reset() {
    store = seed();
    persist();
    const app = window.state;
    if (app && app.mango) {
      app.mango.series = null;
      app.mango.selection = {};
      app.mango.jobs = [];
      app.mango.details = {};
      app.mango.detailsPending = {};
      app.mangoHistory = [];
      app.mangoHistoryAt = 0;
    }
    if (typeof window.refresh === 'function') window.refresh();
    if (typeof window.refreshMangoJobs === 'function') window.refreshMangoJobs();
    if (typeof window.refreshMangoHistory === 'function') window.refreshMangoHistory(true);
    if (typeof window.renderMango === 'function') window.renderMango();
  }

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  function fail(message, status = 400) {
    return json({ error: message }, status);
  }

  function parseBody(init) {
    if (!init || !init.body) return {};
    try {
      return JSON.parse(init.body);
    } catch {
      return {};
    }
  }

  function handle(pathname, method, body) {
    if (pathname === '/api/state' && method === 'GET') {
      tick();
      return json({
        server: serverInfo(),
        stats: stats(),
        settings: { ...store.settings },
        tasks: clone(store.tasks),
      });
    }

    if (pathname === '/api/settings' && method === 'GET') {
      return json({ ...store.settings });
    }
    if (pathname === '/api/settings' && method === 'PATCH') {
      return json(resolveSettings(body));
    }

    if (pathname === '/api/tasks/preview' && method === 'POST') {
      try {
        return json(previewLink(body.url));
      } catch (error) {
        return fail(error.message);
      }
    }

    if (pathname === '/api/tasks' && method === 'POST') {
      const items = Array.isArray(body) ? body : Array.isArray(body.tasks) ? body.tasks : [body];
      try {
        let createdCount = 0;
        const created = items.map((item) => {
          const next = taskFromInput(item);
          store.tasks.unshift(next);
          createdCount += 1;
          if (item.subtitles && item.subtitle_lang && item.subtitle_lang !== 'none') {
            const lang = String(item.subtitle_lang);
            const subName = next.filename.replace(/\.[^.]+$/, `.${lang}.vtt`);
            const sub = task({
              id: store.nextTaskId++,
              status: 'queued',
              url: `${next.url}.${lang}.vtt`,
              filename: subName,
              referer: next.referer,
              movieId: next.movieId,
              title: next.title,
              origTitle: next.origTitle,
              year: next.year,
              fileType: 'subtitle',
              subtitleLang: lang === 'ru' ? 'Русский' : 'English',
              subtitleLangCode: lang,
              totalBytes: 48 * 1024,
              receivedBytes: 0,
              createdAt: now(),
            });
            store.tasks.unshift(sub);
            createdCount += 1;
          }
          return next;
        });
        persist();
        return json({ created: createdCount, tasks: created });
      } catch (error) {
        return fail(error.message);
      }
    }

    if (pathname === '/api/tasks/pause-all' && method === 'POST') {
      let paused = 0;
      store.tasks.forEach((item) => {
        if (item.status === 'downloading' || item.status === 'queued') {
          item.status = 'paused';
          paused += 1;
        }
      });
      persist();
      return json({ paused });
    }

    if (pathname === '/api/tasks/resume-all' && method === 'POST') {
      let resumed = 0;
      store.tasks.forEach((item) => {
        if (item.status === 'paused') {
          item.status = 'queued';
          resumed += 1;
        }
      });
      persist();
      return json({ resumed });
    }

    if (pathname === '/api/tasks/cancel-all' && method === 'POST') {
      let canceled = 0;
      store.tasks.forEach((item) => {
        if (['downloading', 'queued', 'paused'].includes(item.status)) {
          item.status = 'canceled';
          item.finishedAt = now();
          canceled += 1;
        }
      });
      persist();
      return json({ canceled });
    }

    if (pathname === '/api/tasks/retry-failed' && method === 'POST') {
      let retried = 0;
      store.tasks.forEach((item) => {
        if (item.status === 'error') {
          item.status = 'queued';
          item.error = null;
          item.receivedBytes = 0;
          item.finishedAt = null;
          retried += 1;
        }
      });
      persist();
      return json({ retried });
    }

    if (pathname === '/api/tasks/hide-finished' && method === 'POST') {
      const wanted = new Set(body.statuses || ['done', 'canceled']);
      let hidden = 0;
      store.tasks.forEach((item) => {
        if (wanted.has(item.status) && !item.queueHidden) {
          item.queueHidden = true;
          hidden += 1;
        }
      });
      persist();
      return json({ hidden });
    }

    const taskMatch = /^\/api\/tasks\/(\d+)(?:\/([a-z-]+))?$/.exec(pathname);
    if (taskMatch) {
      const id = Number(taskMatch[1]);
      const action = taskMatch[2] || '';
      const item = store.tasks.find((entry) => entry.id === id);
      if (!item) return fail('Задача не найдена', 404);
      if (method === 'DELETE') {
        store.tasks = store.tasks.filter((entry) => entry.id !== id);
        persist();
        return json({ ok: true });
      }
      if (method === 'POST' && action) {
        if (action === 'pause') item.status = 'paused';
        else if (action === 'resume') item.status = 'queued';
        else if (action === 'retry') {
          item.status = 'queued';
          item.error = null;
          item.receivedBytes = 0;
          item.finishedAt = null;
        } else if (action === 'cancel') {
          item.status = 'canceled';
          item.finishedAt = now();
        } else if (action === 'delete') {
          store.tasks = store.tasks.filter((entry) => entry.id !== id);
        } else {
          return fail('Неизвестное действие', 404);
        }
        persist();
        return json({ ok: true });
      }
    }

    if (pathname === '/api/mango/jobs' && method === 'GET') {
      tickJobs(Math.min(10, Math.max(0.25, (now() - store.lastTick) / 1000)));
      store.lastTick = now();
      persist();
      return json({
        jobs: store.jobs.map(publicJob),
        stats: { chapters: store.history.length },
      });
    }

    const mangoJobMatch = /^\/api\/mango\/jobs\/(\d+)$/.exec(pathname);
    if (mangoJobMatch && method === 'GET') {
      const job = store.jobs.find((entry) => entry.id === Number(mangoJobMatch[1]));
      if (!job) return fail('Задание не найдено', 404);
      return json({ job: publicJob(job) });
    }

    const mangoCancel = /^\/api\/mango\/jobs\/(\d+)\/cancel$/.exec(pathname);
    if (mangoCancel && method === 'POST') {
      const job = store.jobs.find((entry) => entry.id === Number(mangoCancel[1]));
      if (!job) return json({ canceled: false });
      if (job.status === 'running' || job.status === 'paused') job.status = 'canceled';
      job.chapters.forEach((chapter) => {
        if (chapter.status === 'queued' || chapter.status === 'downloading') {
          chapter.status = 'canceled';
        }
      });
      job.current = null;
      job.finishedAt = now();
      persist();
      return json({ canceled: true });
    }

    if (pathname === '/api/mango/history' && method === 'GET') {
      return json({ chapters: clone(store.history) });
    }

    if (pathname === '/api/mango/resolve' && method === 'POST') {
      const series = demoSeries(body.url, body.language);
      store.lastSeries = clone(series);
      persist();
      return json(series);
    }

    if (pathname === '/api/mango/download' && method === 'POST') {
      const series = store.lastSeries || demoSeries(body.url, body.language);
      const wantedIds = new Set((body.chapters || []).map(String));
      const selected = series.chapters.filter((chapter) => wantedIds.has(chapter.id));
      const wanted = selected.filter((chapter) => !chapter.external && !chapter.unavailable);
      const alreadyDownloaded = wanted.filter((chapter) => chapter.downloaded).length;
      const toDownload = wanted.filter((chapter) => !chapter.downloaded);
      if (!toDownload.length) {
        return json({
          job: null,
          alreadyDownloaded,
          total: wanted.length,
          info: brief(series),
        });
      }
      const id = store.nextJobId++;
      const job = {
        id,
        seriesKey: series.seriesKey,
        url: series.url,
        source: series.source,
        sourceLabel: series.sourceLabel,
        language: series.language,
        title: series.title,
        year: series.year,
        folder: series.folder,
        status: 'running',
        total: toDownload.length,
        done: 0,
        skipped: 0,
        failed: [],
        current: null,
        error: null,
        dir: `/demo/downloads/mango/${series.folder}`,
        startedAt: now(),
        finishedAt: null,
        chapters: toDownload.map((chapter) => ({
          id: chapter.id,
          label: chapter.folder,
          volume: chapter.volume,
          number: chapter.number,
          title: chapter.title,
          language: chapter.language,
          group: chapter.group,
          status: 'queued',
          pagesDone: 0,
          pagesTotal: 18,
          error: null,
        })),
      };
      const first = job.chapters[0];
      if (first) {
        first.status = 'downloading';
        job.current = {
          id: first.id,
          label: first.label,
          pagesDone: 0,
          pagesTotal: first.pagesTotal,
        };
      }
      store.jobs.unshift(job);
      persist();
      return json({
        job: publicJob(job),
        alreadyDownloaded,
        total: wanted.length,
        info: brief(series),
      }, 201);
    }

    const mangoVolumeDelete = /^\/api\/mango\/series\/([^/]+)\/volume\/([^/]+)\/delete$/.exec(
      pathname,
    );
    if (mangoVolumeDelete && method === 'POST') {
      const seriesKey = decodeURIComponent(mangoVolumeDelete[1]);
      const volume = decodeURIComponent(mangoVolumeDelete[2]);
      const before = store.history.length;
      store.history = store.history.filter(
        (row) => !(row.series_key === seriesKey && String(row.volume) === String(volume)),
      );
      store.jobs.forEach((job) => {
        if (job.seriesKey !== seriesKey) return;
        job.chapters.forEach((chapter) => {
          if (String(chapter.volume) === String(volume) && chapter.status !== 'queued') {
            chapter.status = 'deleted';
          }
        });
      });
      persist();
      return json({ deleted: before - store.history.length, volume });
    }

    const mangoSeriesAction = /^\/api\/mango\/series\/([^/]+)\/(cancel|pause|resume|delete)$/.exec(
      pathname,
    );
    if (mangoSeriesAction && method === 'POST') {
      const seriesKey = decodeURIComponent(mangoSeriesAction[1]);
      const action = mangoSeriesAction[2];
      const jobs = store.jobs.filter((job) => job.seriesKey === seriesKey);
      if (action === 'pause') {
        let paused = 0;
        jobs.forEach((job) => {
          if (job.status === 'running') {
            job.status = 'paused';
            paused += 1;
          }
        });
        persist();
        return json({ paused });
      }
      if (action === 'resume') {
        let resumed = 0;
        jobs.forEach((job) => {
          if (job.status === 'paused') {
            job.status = 'running';
            resumed += 1;
          }
        });
        persist();
        return json({ resumed });
      }
      if (action === 'cancel') {
        let canceled = 0;
        jobs.forEach((job) => {
          if (job.status === 'running' || job.status === 'paused') {
            job.status = 'canceled';
            job.finishedAt = now();
            job.current = null;
            job.chapters.forEach((chapter) => {
              if (chapter.status === 'queued' || chapter.status === 'downloading') {
                chapter.status = 'canceled';
              }
            });
            canceled += 1;
          }
        });
        persist();
        return json({ canceled });
      }
      if (action === 'delete') {
        const volumes = new Set([
          ...jobs.flatMap((job) => job.chapters.map((chapter) => String(chapter.volume))),
          ...store.history
            .filter((row) => row.series_key === seriesKey)
            .map((row) => String(row.volume)),
        ]);
        store.jobs = store.jobs.filter((job) => job.seriesKey !== seriesKey);
        store.history = store.history.filter((row) => row.series_key !== seriesKey);
        persist();
        return json({ deleted: volumes.size, dir: null });
      }
    }

    return fail(`Playground API: нет маршрута ${method} ${pathname}`, 404);
  }

  const nativeFetch = window.fetch;
  window.fetch = function playgroundFetch(input, init) {
    const raw = typeof input === 'string' ? input : input && input.url;
    if (!raw) return nativeFetch(input, init);
    let url;
    try {
      url = new URL(raw, window.location.href);
    } catch {
      return nativeFetch(input, init);
    }
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    const method = String((init && init.method) || 'GET').toUpperCase();
    const body = parseBody(init);
    try {
      return Promise.resolve(handle(url.pathname.replace(/\/+$/, ''), method, body));
    } catch (error) {
      return Promise.resolve(fail(error.message, 500));
    }
  };

  window.Playground = {
    get store() {
      return store;
    },
    seed,
    reset,
    tick,
    addDemoTask,
    loadDemo,
    fixVolumes,
    planMove,
    moveChapters,
    setJobStatus,
    classifyCategory,
    defaultLibraryRules,
    previewLink,
    demoSeries,
    persist,
  };

  persist();
})();