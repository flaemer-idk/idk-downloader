/* Floating controls for the static playground. Loaded after app.js. */
(() => {
  'use strict';

  const panel = document.createElement('aside');
  panel.className = 'pg-panel';
  panel.id = 'pg-panel';
  panel.setAttribute('aria-label', 'Playground controls');
  panel.innerHTML = `
    <div class="pg-head">
      <span class="pg-badge">PLAYGROUND</span>
      <span class="pg-title" data-pg-en="demo · no backend" data-pg-ru="демо · без бэкенда">demo · no backend</span>
      <button class="pg-close" type="button" data-pg="collapse" aria-label="Collapse panel" data-pg-aria-en="Collapse panel" data-pg-aria-ru="Свернуть панель">−</button>
    </div>
    <div class="pg-body">
      <div class="pg-hint" data-pg-en="Data lives in localStorage. No real files are downloaded." data-pg-ru="Данные в localStorage. Реальные файлы не качаются.">Data lives in localStorage. No real files are downloaded.</div>

      <div class="pg-label" data-pg-en="Mango scenarios" data-pg-ru="Сценарии Mango">Mango scenarios</div>
      <button class="pg-btn pg-btn-primary" type="button" data-pg="scene-mangalib" data-pg-en="MangaLib: vol 6 — 12, vol 7 — 8" data-pg-ru="MangaLib: том 6 — 12, том 7 — 8">MangaLib: vol 6 — 12, vol 7 — 8</button>
      <button class="pg-btn" type="button" data-pg="scene-mangadex" data-pg-en="MangaDex: vol 6 — 10, vol 7 — 10" data-pg-ru="MangaDex: том 6 — 10, том 7 — 10">MangaDex: vol 6 — 10, vol 7 — 10</button>
      <button class="pg-btn pg-btn-accent" type="button" data-pg="fix" data-pg-en="Move 61–62 to vol 7" data-pg-ru="Перенести 61–62 в том 7">Move 61–62 to vol 7</button>

      <div class="pg-label" data-pg-en="Queue" data-pg-ru="Очередь">Queue</div>
      <div class="pg-row">
        <button class="pg-btn" type="button" data-pg="add-task" data-pg-en="+ task" data-pg-ru="+ задача">+ task</button>
        <button class="pg-btn" type="button" data-pg="tick" data-pg-en="+ progress" data-pg-ru="+ прогресс">+ progress</button>
        <button class="pg-btn pg-btn-danger" type="button" data-pg="reset" data-pg-en="Reset" data-pg-ru="Сброс">Reset</button>
      </div>

      <div class="pg-hint pg-hint-small" id="pg-note" data-pg-en="Change styles.css / app.js in this folder." data-pg-ru="Правь styles.css / app.js в этой папке.">Change styles.css / app.js in this folder.</div>
    </div>
  `;
  document.body.appendChild(panel);
  applyPgStatic();

  const collapseButton = panel.querySelector('[data-pg="collapse"]');
  if (window.innerWidth < 1100 || window.innerHeight < 780) {
    panel.classList.add('is-collapsed');
    collapseButton.textContent = '+';
    collapseButton.setAttribute('aria-label', 'Развернуть панель');
  }

  const note = panel.querySelector('#pg-note');
  let noteTimer = null;

  function say(message, type) {
    if (note) {
      note.textContent = message;
      note.classList.toggle('pg-note-ok', type === 'success');
      note.classList.toggle('pg-note-err', type === 'error');
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        note.textContent = pgT('Change styles.css / app.js in this folder.', 'Правь styles.css / app.js в этой папке.');
        note.classList.remove('pg-note-ok', 'pg-note-err');
      }, 5000);
    }
    if (typeof window.toast === 'function') window.toast(message, type || 'info');
  }

  function refreshAll() {
    if (typeof window.refresh === 'function') window.refresh();
    if (typeof window.refreshMangoJobs === 'function') window.refreshMangoJobs();
    if (typeof window.refreshMangoHistory === 'function') window.refreshMangoHistory(true);
  }

  function pgT(en, ru) {
    return window.state && window.state.lang === 'ru' ? ru : en;
  }

  function applyPgStatic() {
    document.querySelectorAll('[data-pg-en]').forEach((el) => {
      el.textContent = pgT(el.getAttribute('data-pg-en'), el.getAttribute('data-pg-ru') || '');
    });
    document.querySelectorAll('[data-pg-aria-en]').forEach((el) => {
      el.setAttribute('aria-label', pgT(el.getAttribute('data-pg-aria-en'), el.getAttribute('data-pg-aria-ru') || ''));
    });
  }

  function tr(key, fallback, vars) {
    try {
      if (typeof window.t === 'function') return window.t(key, vars);
    } catch {
      /* playground can load before app i18n in theory */
    }
    return fallback;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function chapterNumber(chapter) {
    const value = Number.parseFloat(String(chapter.number).replace(',', '.'));
    return Number.isFinite(value) ? value : 0;
  }

  function rangeLabel(numbers) {
    const values = [...new Set(numbers.map(Number))].sort((a, b) => a - b);
    if (!values.length) return '';
    let contiguous = true;
    for (let index = 1; index < values.length; index += 1) {
      if (values[index] !== values[index - 1] + 1) {
        contiguous = false;
        break;
      }
    }
    if (contiguous && values.length > 1) return `${values[0]}–${values[values.length - 1]}`;
    return values.join(', ');
  }

  function editorEntries(scope, seriesKey, jobId) {
    const app = window.state || {};
    if (scope === 'series') {
      const series = app.mango && app.mango.series;
      if (!series) return null;
      return {
        title: series.title,
        chapters: series.chapters.map((chapter) => ({
          id: String(chapter.id),
          volume: String(chapter.volume),
          number: String(chapter.number),
          label: chapter.folder || chapter.title || String(chapter.number),
          status: chapter.downloaded ? 'done' : 'new',
          downloaded: Boolean(chapter.downloaded),
        })),
      };
    }
    if (scope === 'history') {
      const rows = (app.mangoHistory || []).filter((row) => row.series_key === seriesKey);
      const fallbackRows = window.Playground.store.history.filter(
        (row) => row.series_key === seriesKey,
      );
      const source = rows.length ? rows : fallbackRows;
      if (!source.length) return null;
      return {
        title: source[0].series_title,
        chapters: source.map((row) => ({
          id: String(row.chapter_id),
          volume: String(row.volume),
          number: String(row.number),
          label: `${row.number}${row.title ? ` - ${row.title}` : ''}`,
          status: 'done',
          downloaded: true,
        })),
      };
    }
    if (scope === 'job') {
      const job =
        (app.mango && (app.mango.jobs || []).find((entry) => String(entry.id) === String(jobId))) ||
        window.Playground.store.jobs.find((entry) => String(entry.id) === String(jobId));
      if (!job) return null;
      const chapters =
        job.chapters ||
        (app.mango && app.mango.details[job.id] && app.mango.details[job.id].chapters) ||
        window.Playground.store.jobs.find((entry) => String(entry.id) === String(jobId))?.chapters ||
        [];
      if (!chapters.length) return null;
      return { title: job.title, chapters };
    }
    return null;
  }

  let editor = null;
  let overlay = null;

  function ensureEditor() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay pg-volume-overlay';
    overlay.id = 'pg-volume-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="modal pg-volume-modal" role="dialog" aria-modal="true" aria-labelledby="pg-ve-title">
        <div class="modal-head">
          <h2 class="modal-title" id="pg-ve-title">Volumes</h2>
          <button class="icon-btn" type="button" data-ve="close" aria-label="${esc(pgT('Close', 'Закрыть'))}">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="pg-ve-note" id="pg-ve-note"></div>
          <div class="pg-ve-list" id="pg-ve-list"></div>
          <div class="pg-ve-plan" id="pg-ve-plan"></div>
        </div>
        <div class="modal-foot pg-ve-foot">
          <label class="pg-ve-target">
            <span>${esc(tr('mango.moveTo', 'Move to'))}</span>
            <input id="pg-ve-target" class="input" type="number" min="1" max="999" step="1" placeholder="${esc(pgT('volume', 'том'))}">
          </label>
          <button class="btn" type="button" data-ve="cancel">${esc(tr('modal.cancel', 'Cancel'))}</button>
          <button class="btn btn-primary" type="button" data-ve="apply" disabled>${esc(tr('mango.moveApply', 'Move'))}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-ve="close"]') || event.target.closest('[data-ve="cancel"]')) {
        closeEditor();
        return;
      }
      if (event.target.closest('[data-ve="apply"]')) applyEditor();
    });

    overlay.addEventListener('change', (event) => {
      if (!editor) return;
      const chapterBox = event.target.closest('[data-ve-chapter]');
      const volumeBox = event.target.closest('[data-ve-volume]');
      if (chapterBox) {
        const id = chapterBox.getAttribute('data-ve-chapter');
        if (chapterBox.checked) editor.selected.add(id);
        else editor.selected.delete(id);
        renderEditor();
        return;
      }
      if (volumeBox) {
        const volume = volumeBox.getAttribute('data-ve-volume');
        const checked = volumeBox.checked;
        editor.chapters
          .filter((chapter) => chapter.volume === volume)
          .forEach((chapter) => {
            if (checked) editor.selected.add(chapter.id);
            else editor.selected.delete(chapter.id);
          });
        renderEditor();
        return;
      }
      if (event.target.id === 'pg-ve-target') {
        editor.target = event.target.value;
        renderEditor();
      }
    });
    return overlay;
  }

  function selectedEditorChapters() {
    if (!editor) return [];
    return editor.chapters.filter((chapter) => editor.selected.has(String(chapter.id)));
  }

  function renderEditor() {
    if (!editor || !overlay) return;
    document.getElementById('pg-ve-title').textContent = tr('mango.volumeEditTitle', 'Volumes · {title}', {
      title: editor.title,
    });
    const note = document.getElementById('pg-ve-note');
    note.textContent = editor.wasRunning
      ? pgT('Edit mode: the job is paused. Files and queue do not move until you press “Move”.', 'Режим редактирования: загрузка поставлена на паузу. Файлы и очередь не двигаются, пока не нажмёшь «Перенести».')
      : pgT('Pick chapters and a volume — existing or new. Volumes stay gap-free: edge chapters move with the selected one.', 'Выбери главы и том — существующий или новый. Тома останутся без пропусков: крайние главы переедут вместе с выбранной.');

    const list = document.getElementById('pg-ve-list');
    const byVolume = new Map();
    editor.chapters
      .slice()
      .sort((a, b) => Number(a.volume) - Number(b.volume) || chapterNumber(a) - chapterNumber(b))
      .forEach((chapter) => {
        if (!byVolume.has(String(chapter.volume))) byVolume.set(String(chapter.volume), []);
        byVolume.get(String(chapter.volume)).push(chapter);
      });
    list.innerHTML = [...byVolume.entries()]
      .map(([volume, chapters]) => {
        const selected = chapters.filter((chapter) => editor.selected.has(String(chapter.id))).length;
        return `<div class="pg-ve-volume">
          <label class="pg-ve-volume-head">
            <input type="checkbox" data-ve-volume="${esc(volume)}"${selected === chapters.length ? ' checked' : ''}${selected > 0 && selected < chapters.length ? ' data-indeterminate="1"' : ''}>
            <span>${esc(tr('mango.volumeName', 'Volume {n}', { n: volume }))}</span>
            <span class="pg-ve-volume-count">${chapters.length}</span>
          </label>
          <div class="pg-ve-rows">
            ${chapters
              .map(
                (chapter) => `<label class="pg-ve-row">
                  <input type="checkbox" data-ve-chapter="${esc(chapter.id)}"${editor.selected.has(String(chapter.id)) ? ' checked' : ''}>
                  <span class="pg-ve-row-label">${esc(chapter.label)}</span>
                  <span class="pg-ve-row-state">${esc(chapter.status)}</span>
                </label>`,
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('');
    list.querySelectorAll('[data-indeterminate="1"]').forEach((input) => {
      input.indeterminate = true;
    });

    const selected = selectedEditorChapters();
    const sourceVolumes = [...new Set(selected.map((chapter) => String(chapter.volume)))];
    const target = document.getElementById('pg-ve-target');
    if (sourceVolumes.length === 1 && !editor.target) {
      const source = Number(sourceVolumes[0]);
      const existing = [...new Set(editor.chapters.map((chapter) => Number(chapter.volume)))]
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const next = String(source + 1);
      const prev = String(source - 1);
      editor.target = existing.includes(Number(next))
        ? next
        : existing.includes(Number(prev))
          ? prev
          : next;
    }
    target.value = editor.target || '';
    target.placeholder = pgT('volume', 'том');
    target.disabled = !sourceVolumes.length;

    const planBox = document.getElementById('pg-ve-plan');
    const apply = overlay.querySelector('[data-ve="apply"]');
    if (!selected.length) {
      planBox.innerHTML = '<span class="pg-ve-muted">' + esc(pgT('Nothing selected.', 'Ничего не выбрано.')) + '</span>';
      apply.disabled = true;
      return;
    }
    if (sourceVolumes.length > 1) {
      planBox.innerHTML = '<span class="pg-ve-error">' + esc(pgT('Chapters must come from one volume.', 'Главы должны быть из одного тома.')) + '</span>';
      apply.disabled = true;
      return;
    }
    if (!editor.target) {
      planBox.innerHTML = '<span class="pg-ve-muted">' + esc(pgT('Enter a volume number — a new one is fine.', 'Укажи номер тома — можно новый.')) + '</span>';
      apply.disabled = true;
      return;
    }
    try {
      const plan = window.Playground.planMove(editor.chapters, [...editor.selected], editor.target);
      const files = plan.moving.filter((chapter) => {
        if (editor.scope === 'history') return true;
        if (editor.scope === 'series') return chapter.downloaded;
        return chapter.status === 'done';
      }).length;
      planBox.innerHTML =
        `<span class="pg-ve-plan-ok">${esc(pgT('Will move:', 'Будет перенесено:'))} ${esc(rangeLabel(plan.numbers))} ` +
        `(${plan.moving.length}) → ${esc(tr('mango.volumeName', 'Volume {n}', { n: plan.target }))}` +
        `${files ? ` · ${esc(pgT('files', 'файлов'))}: ${files}` : ''}</span>`;
      apply.disabled = false;
    } catch (error) {
      planBox.innerHTML = `<span class="pg-ve-error">${esc(error.message)}</span>`;
      apply.disabled = true;
    }
  }

  function openVolumeEditor(scope, seriesKey, jobId) {
    if (overlay && !overlay.hidden) closeEditor();
    const found = editorEntries(scope, seriesKey, jobId);
    if (!found || !found.chapters.length) {
      say(pgT('No chapters to edit.', 'Нет глав для редактирования.'), 'error');
      return;
    }
    const app = window.state || {};
    let wasRunning = false;
    if (scope === 'job') {
      const job = (app.mango && app.mango.jobs || []).find(
        (entry) => String(entry.id) === String(jobId),
      );
      if (job && job.status === 'running') {
        wasRunning = true;
        window.Playground.setJobStatus(jobId, 'paused');
      }
    }
    editor = {
      scope,
      seriesKey,
      jobId,
      title: found.title,
      chapters: found.chapters,
      selected: new Set(),
      target: '',
      wasRunning,
      applied: false,
    };
    ensureEditor();
    renderEditor();
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
  }

  function closeEditor(resume) {
    if (!editor) return;
    const shouldResume = resume !== false && editor.scope === 'job' && editor.wasRunning && !editor.applied;
    if (overlay) {
      overlay.classList.remove('open');
      setTimeout(() => {
        if (overlay && !overlay.classList.contains('open')) overlay.hidden = true;
      }, 170);
    }
    const jobId = editor.jobId;
    editor = null;
    if (shouldResume) {
      window.Playground.setJobStatus(jobId, 'running');
      if (typeof window.refreshMangoJobs === 'function') window.refreshMangoJobs();
    }
  }

  function applyEditor() {
    if (!editor) return;
    let plan;
    let result;
    try {
      plan = window.Playground.planMove(editor.chapters, [...editor.selected], editor.target);
      result = window.Playground.moveChapters(
        editor.scope,
        editor.seriesKey,
        editor.jobId,
        [...editor.selected],
        editor.target,
      );
    } catch (error) {
      say(error.message, 'error');
      return;
    }
    editor.applied = true;
    if (editor.scope === 'job' && editor.wasRunning) {
      window.Playground.setJobStatus(editor.jobId, 'running');
    }
    if (editor.scope === 'series') {
      const box = document.getElementById('mango-chapters');
      if (box) box.dataset.key = '';
      if (typeof window.renderMango === 'function') window.renderMango();
    } else if (editor.scope === 'history') {
      if (typeof window.renderMangoHistory === 'function') window.renderMangoHistory();
      if (typeof window.refreshMangoHistory === 'function') window.refreshMangoHistory(true);
    } else if (editor.scope === 'job') {
      if (typeof window.renderMango === 'function') window.renderMango();
      if (typeof window.refreshMangoJobs === 'function') window.refreshMangoJobs();
    }
    const text =
      `${pgT('Moved:', 'Перенесено:')} ${rangeLabel(plan.numbers)} (${result.moved}) → ` +
      tr('mango.volumeName', 'Volume {n}', { n: result.to }) +
      (result.filesMoved ? ` · ${pgT('files', 'файлов')}: ${result.filesMoved}` : '');
    say(text, 'success');
    closeEditor(false);
  }

  document.addEventListener('click', (event) => {
    const historyToggle = event.target.closest('[data-history-all]');
    if (historyToggle) {
      const key = historyToggle.getAttribute('data-history-all');
      const collapsed = window.state.mango.collapsed[key] !== false;
      window.state.mango.collapsed[key] = !collapsed;
      if (typeof window.renderMangoHistory === 'function') window.renderMangoHistory();
      return;
    }
    const editButton = event.target.closest('[data-edit-volumes]');
    if (!editButton) return;
    event.preventDefault();
    event.stopPropagation();
    openVolumeEditor(
      editButton.getAttribute('data-edit-volumes'),
      editButton.getAttribute('data-series-key') || '',
      editButton.getAttribute('data-job-id') || '',
    );
  });

  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pg]');
    if (!button) return;
    const action = button.dataset.pg;

    if (action === 'collapse') {
      panel.classList.toggle('is-collapsed');
      button.textContent = panel.classList.contains('is-collapsed') ? '+' : '−';
      button.setAttribute(
        'aria-label',
        panel.classList.contains('is-collapsed') ? pgT('Expand panel', 'Развернуть панель') : pgT('Collapse panel', 'Свернуть панель'),
      );
      return;
    }

    if (action === 'scene-mangalib') {
      const series = window.Playground.loadDemo('mangalib');
      say(pgT(`MangaLib: vol 6 — 12, vol 7 — 8. Total ${series.chapters.length}.`, `MangaLib: том 6 — 12 глав, том 7 — 8. Всего ${series.chapters.length}.`), 'success');
      return;
    }

    if (action === 'scene-mangadex') {
      const series = window.Playground.loadDemo('mangadex');
      say(pgT('MangaDex: vol 6 — 10, vol 7 — 10. Languages: ru / en.', 'MangaDex: том 6 — 10 глав, том 7 — 10. Языки: ru / en.'), 'success');
      return;
    }

    if (action === 'fix') {
      if (!window.state || !window.state.mango || !window.state.mango.series) {
        window.Playground.loadDemo('mangalib');
      }
      const moved = window.Playground.fixVolumes();
      say(moved ? pgT(`Moved chapters: ${moved} → vol 7.`, `Перенесено глав: ${moved} → том 7.`) : pgT('Open the MangaLib scenario first.', 'Сначала открой сценарий MangaLib.'), moved ? 'success' : 'info');
      return;
    }

    if (action === 'add-task') {
      const id = window.Playground.addDemoTask();
      refreshAll();
      say(pgT(`Demo task #${id} added.`, `Добавлена демо-задача #${id}.`), 'success');
      return;
    }

    if (action === 'tick') {
      window.Playground.tick(5);
      refreshAll();
      say(pgT('Progress advanced by 5 seconds.', 'Прогресс сдвинут на 5 секунд.'), 'success');
      return;
    }

    if (action === 'reset') {
      window.Playground.reset();
      say(pgT('Demo data reset to examples.', 'Демо-данные сброшены к примерам.'), 'success');
    }
  });

  // Small keyboard escape hatch: Ctrl+Shift+R is browser hard reload, so use
  // Alt+R to reset only the demo store.
  document.addEventListener('keydown', (event) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      window.Playground.reset();
      say('Демо-данные сброшены к примерам.', 'success');
    }
  });
/* ---------- categories / cookies designer (prototype only) ---------- */

  let categoryRules = null;

  function settingsForDesigner() {
    return (
      (window.Playground && window.Playground.store && window.Playground.store.settings) ||
      (window.state && window.state.settings) ||
      null
    );
  }

  function categoryPreview() {
    const box = document.getElementById('pg-cat-preview');
    if (!box) return;
    const samples = [
      ['Invincible', 'cartoons', 'series', '18+'],
      ['Rick and Morty', 'cartoons', 'series', '18+'],
      ['Гравити Фолз', 'cartoons', 'series', '6+'],
      ['Дюна', 'films', 'film', '16+'],
      ['Наруто', 'animation', 'series', '12+'],
    ];
    box.innerHTML = samples
      .map(([name, section, kind, rating]) => {
        const folder = window.Playground.classifyCategory(section, kind, rating) || 'default';
        return `<div><b>${esc(name)}</b> · ${esc(section)} / ${esc(kind)} / ${esc(rating)} → ${esc(folder)}</div>`;
      })
      .join('');
  }

  function drawCategoryRules() {
    const box = document.getElementById('pg-cat-rules');
    if (!box || !categoryRules) return;
    const sections = [
      ['animation', pgT('Anime', 'Аниме')],
      ['films', pgT('Films', 'Фильмы')],
      ['series', pgT('Series', 'Сериалы')],
      ['cartoons', pgT('Cartoons', 'Мультфильмы')],
      ['documentary', pgT('Documentary', 'Документальные')],
    ];
    const kinds = [
      ['film', pgT('Film', 'Фильм')],
      ['series', pgT('Series', 'Сериал')],
      ['any', pgT('Any', 'Любой')],
    ];
    const ratings = ['any', '6+', '12+', '16+', '18+'];
    box.innerHTML = categoryRules
      .map((rule, index) => `
        <div class="pg-cat-rule" data-cat-index="${index}">
          <select class="input" data-cat-field="section">
            ${sections
              .map(
                ([value, label]) =>
                  `<option value="${value}"${rule.section === value ? ' selected' : ''}>${label}</option>`,
              )
              .join('')}
          </select>
          <select class="input" data-cat-field="kind">
            ${kinds
              .map(
                ([value, label]) =>
                  `<option value="${value}"${rule.kind === value ? ' selected' : ''}>${label}</option>`,
              )
              .join('')}
          </select>
          <select class="input" data-cat-field="rating">
            ${ratings
              .map(
                (value) =>
                  `<option value="${value}"${rule.rating === value ? ' selected' : ''}>${value === 'any' ? pgT('Any', 'Любой') : value}</option>`,
              )
              .join('')}
          </select>
          <input class="input mono" data-cat-field="folder" value="${esc(rule.folder)}" placeholder="${esc(pgT('folder', 'папка'))}">
          <button class="pg-btn pg-cat-del" type="button" data-cat-del="${index}" title="${esc(pgT('Delete rule', 'Удалить правило'))}">×</button>
        </div>`)
      .join('');
    const status = document.getElementById('pg-cat-status');
    if (status) status.textContent = `${pgT('Rules', 'Правил')}: ${categoryRules.length} · ${pgT('saved in localStorage', 'сохраняется в localStorage')}`;
    categoryPreview();
  }

  function saveCategoryRules() {
    if (!categoryRules) return;
    const store = window.Playground && window.Playground.store;
    if (store && store.settings) {
      store.settings.library_rules = JSON.parse(JSON.stringify(categoryRules));
      window.Playground.persist();
    }
    if (window.state && window.state.settings) {
      window.state.settings.library_rules = JSON.parse(JSON.stringify(categoryRules));
    }
    categoryPreview();
  }

  function initCategoryDesigner(force) {
    const box = document.getElementById('pg-cat-rules');
    const settings = settingsForDesigner();
    if (!box || !settings) return false;
    if (!box.dataset.ready || force) {
      categoryRules = JSON.parse(
        JSON.stringify(settings.library_rules || window.Playground.defaultLibraryRules()),
      );
      box.dataset.ready = '1';
      drawCategoryRules();
    }
    return true;
  }

  document.addEventListener('change', (event) => {
    const row = event.target.closest('[data-cat-index]');
    if (row) {
      const index = Number(row.getAttribute('data-cat-index'));
      const field = event.target.getAttribute('data-cat-field');
      if (!categoryRules || !categoryRules[index] || !field) return;
      categoryRules[index][field] = event.target.value;
      saveCategoryRules();
    }
  });

  document.addEventListener('input', (event) => {
    const row = event.target.closest('[data-cat-index]');
    if (row && event.target.getAttribute('data-cat-field') === 'folder') {
      const index = Number(row.getAttribute('data-cat-index'));
      if (categoryRules && categoryRules[index]) {
        categoryRules[index].folder = event.target.value;
        saveCategoryRules();
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('#pg-cat-add')) {
      if (!categoryRules) return;
      categoryRules.push({ section: 'films', kind: 'film', rating: 'any', folder: '' });
      saveCategoryRules();
      drawCategoryRules();
      return;
    }
    const del = event.target.closest('[data-cat-del]');
    if (del) {
      const index = Number(del.getAttribute('data-cat-del'));
      if (categoryRules && categoryRules[index]) {
        categoryRules.splice(index, 1);
        saveCategoryRules();
        drawCategoryRules();
      }
    }
  });

  function cookieCount(text) {
    const names = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((line) => {
        if (!line || /^#/.test(line)) return;
        const fields = line.split('\t');
        if (fields.length < 7) return;
        if (fields[5] && fields[5].trim()) names.push(fields[5].trim());
      });
    return { count: names.length, names: [...new Set(names)] };
  }

  function drawCookieStatus() {
    const input = document.getElementById('pg-cookies');
    const status = document.getElementById('pg-cookie-status');
    if (!input || !status) return;
    const parsed = cookieCount(input.value);
    status.textContent = `${parsed.count} ${pgT('cookies', 'куки')}${parsed.names.length ? ' · ' + parsed.names.slice(0, 5).join(', ') : ''}`;
  }

  function initCookiesDesigner(force) {
    const input = document.getElementById('pg-cookies');
    const settings = settingsForDesigner();
    if (!input || !settings || (input.dataset.ready && !force)) return;
    input.dataset.ready = '1';
    input.value = settings.rezka_cookies || '';
    const save = () => {
      const store = window.Playground && window.Playground.store;
      if (store && store.settings) {
        store.settings.rezka_cookies = input.value;
        window.Playground.persist();
      }
      if (window.state && window.state.settings) {
        window.state.settings.rezka_cookies = input.value;
      }
      drawCookieStatus();
    };
    input.addEventListener('input', save);
    input.addEventListener('change', save);
    drawCookieStatus();
  }

  function initDesigners(force) {
    initCategoryDesigner(force);
    initCookiesDesigner(force);
  }

  let designerTimer = setInterval(() => {
    const settings = settingsForDesigner();
    if (!settings) return;
    clearInterval(designerTimer);
    designerTimer = null;
    initDesigners(false);
  }, 300);

  window.addEventListener('pg:lang', () => {
    applyPgStatic();
    if (categoryRules) drawCategoryRules();
    if (editor) renderEditor();
    updateBatchButton();
  });

  applyPgStatic();

  // Reset/Alt+R also reset the visible rule editor.
  const originalReset = window.Playground.reset;
  window.Playground.reset = function playgroundReset() {
    originalReset();
    setTimeout(() => initDesigners(true), 50);
  };


/* ---------- add-by-link: resolver cards ---------- */

  let parsedBatch = null;
  let parseBusy = false;

  function parseStatus(text, type) {
    const el = document.getElementById('pg-parse-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'pg-parse-status' + (type ? ' pg-parse-' + type : '');
  }

  function clearParse() {
    const box = document.getElementById('pg-parse-results');
    parsedBatch = null;
    if (box) {
      box.hidden = true;
      box.innerHTML = '';
    }
    parseStatus('');
    updateBatchButton();
  }

  function cardEpisodeHtml(card, episode, index) {
    const checked = !episode.downloaded;
    return `<label class="pg-card-episode">
      <input type="checkbox" data-card-episode="${index}" data-downloaded="${episode.downloaded ? '1' : '0'}"${checked ? ' checked' : ''}>
      <span>${esc(episode.season ? `S${episode.season}E${episode.episode}` : episode.episode)} · ${esc(episode.title || '')}</span>
      <span class="pg-card-ep-state">${episode.downloaded ? pgT('have', 'есть') : pgT('new', 'новое')}</span>
    </label>`;
  }

  function renderParsedCards(payload) {
    const box = document.getElementById('pg-parse-results');
    if (!box) return;
    parsedBatch = payload;
    box.hidden = false;
    box.innerHTML = payload.cards
      .map((card, cardIndex) => {
        const episodes = card.episodes || [];
        return `<article class="pg-add-card" data-card-index="${cardIndex}">
          <div class="pg-add-card-head">
            <input type="checkbox" data-card-check${card.downloaded < card.total ? ' checked' : ''} aria-label="${esc(pgT('Select', 'Выбрать'))}">
            <div class="pg-add-card-id">
              <div class="pg-add-card-title">${esc(card.title)}${card.year ? ` <span class="pg-add-year">(${esc(card.year)})</span>` : ''}</div>
              <div class="pg-add-card-meta">${esc(card.kind === 'series' ? pgT('series', 'сериал') : pgT('film', 'фильм'))} · ${esc(card.section)} · ${esc(card.rating)} · ${card.downloaded}/${card.total} ${esc(pgT('already there', 'уже есть'))}</div>
            </div>
            <span class="pg-add-badge">${card.downloaded >= card.total ? pgT('have', 'есть') : card.downloaded ? pgT('partial', 'частично') : pgT('new', 'новое')}</span>
          </div>
          <div class="pg-add-card-controls">
            <label>${esc(pgT('Quality', 'Качество'))}
              <select class="input" data-card-quality>
                ${card.qualityOptions.map((q) => `<option value="${esc(q)}"${q === card.quality ? ' selected' : ''}>${esc(q)}</option>`).join('')}
              </select>
            </label>
            <label>${esc(pgT('Voice', 'Озвучка'))}
              <select class="input" data-card-voice>
                ${card.voiceovers.map((v) => `<option value="${esc(v)}"${v === card.voiceover ? ' selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </label>
            <label class="pg-add-force">
              <input type="checkbox" data-card-force>
              <span>${esc(pgT('Download again', 'Скачать заново'))}</span>
            </label>
            <span class="pg-add-subs">${card.subtitles && card.subtitles.length ? pgT('Subtitles: RU · auto', 'Субтитры: RU · авто') : pgT('No subtitles', 'Субтитров нет')}</span>
          </div>
          ${episodes.length ? `<div class="pg-add-episodes">${episodes.map((episode, index) => cardEpisodeHtml(card, episode, index)).join('')}</div>` : ''}
        </article>`;
      })
      .join('');
    parseStatus(`${pgT('Cards', 'Карточек')}: ${payload.cards.length} · ${payload.source}`, 'ok');
    updateBatchButton();
  }

  function cardIsChecked(card) {
    const input = card.querySelector('[data-card-check]');
    return input ? input.checked : false;
  }

  function selectedTaskCount() {
    const box = document.getElementById('pg-parse-results');
    if (!box || !parsedBatch) return 0;
    let count = 0;
    box.querySelectorAll('[data-card-index]').forEach((cardEl) => {
      if (!cardIsChecked(cardEl)) return;
      const force = cardEl.querySelector('[data-card-force]')?.checked;
      const episodes = cardEl.querySelectorAll('[data-card-episode]');
      if (episodes.length) {
        episodes.forEach((episode) => {
          if (episode.checked) count += 1;
        });
      } else {
        const index = Number(cardEl.getAttribute('data-card-index'));
        const card = parsedBatch.cards[index];
        if (card.downloaded && !force) return;
        count += 1;
      }
    });
    return count;
  }

  function updateBatchButton() {
    const button = document.getElementById('pg-add-batch');
    if (!button) return;
    const count = selectedTaskCount();
    button.disabled = count === 0 || parseBusy;
    const label = button.querySelector('span');
    if (label) label.textContent = count ? `${pgT('Add selected', 'Добавить выбранное')} (${count})` : pgT('Add selected', 'Добавить выбранное');
  }

  function taskFromCard(card, episode) {
    const season = episode ? episode.season : null;
    const number = episode ? episode.episode : null;
    return {
      url: `${parsedBatch.url || 'https://rezka.fi/'}#${card.id}${episode ? '-' + episode.id : ''}`,
      title: card.title,
      origTitle: card.origTitle,
      year: card.year,
      quality: card.quality,
      voiceover: card.voiceover,
      section: card.section,
      kind: card.kind,
      rating: card.rating,
      movieId: `${parsedBatch.source || 'rezka'}:${card.id}`,
      season,
      episode: number,
      episodeTitle: episode ? episode.title : null,
      fileType: 'video',
      subtitles: card.subtitles && card.subtitles.includes('ru'),
      subtitle_lang: 'ru',
      totalBytes: episode ? 900 * 1024 * 1024 : 1.8 * 1024 * 1024 * 1024,
    };
  }

  function collectBatchTasks() {
    const box = document.getElementById('pg-parse-results');
    if (!box || !parsedBatch) return [];
    const tasks = [];
    box.querySelectorAll('[data-card-index]').forEach((cardEl) => {
      if (!cardIsChecked(cardEl)) return;
      const index = Number(cardEl.getAttribute('data-card-index'));
      const card = parsedBatch.cards[index];
      const force = cardEl.querySelector('[data-card-force]')?.checked;
      card.quality = cardEl.querySelector('[data-card-quality]')?.value || card.quality;
      card.voiceover = cardEl.querySelector('[data-card-voice]')?.value || card.voiceover;
      const episodes = [...cardEl.querySelectorAll('[data-card-episode]')];
      if (episodes.length) {
        episodes.forEach((episodeInput, episodeIndex) => {
          if (!episodeInput.checked) return;
          const episode = card.episodes[episodeIndex];
          if (episode.downloaded && !force && !episodeInput.dataset.manual) {
            return;
          }
          tasks.push(taskFromCard(card, episode));
        });
      } else if (!card.downloaded || force) {
        tasks.push(taskFromCard(card, null));
      }
    });
    return tasks;
  }

  async function parseCurrentLink() {
    if (parseBusy) return;
    const input = document.getElementById('f-url');
    const url = input ? input.value.trim() : '';
    if (!url) {
      parseStatus(pgT('Paste a link first.', 'Сначала вставь ссылку.'), 'error');
      return;
    }
    parseBusy = true;
    updateBatchButton();
    parseStatus(pgT('Parsing link…', 'Разбираю ссылку…'));
    try {
      const response = await fetch('/api/tasks/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      renderParsedCards(data);
    } catch (error) {
      parsedBatch = null;
      parseStatus(error.message, 'error');
    } finally {
      parseBusy = false;
      updateBatchButton();
    }
  }

  async function addParsedBatch() {
    const tasks = collectBatchTasks();
    if (!tasks.length) {
      parseStatus(pgT('Nothing to add: everything selected is already downloaded.', 'Нечего добавлять: всё выбранное уже скачано.'), 'error');
      return;
    }
    const button = document.getElementById('pg-add-batch');
    if (button) button.disabled = true;
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasks),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      if (typeof window.closeModal === 'function') window.closeModal();
      if (typeof window.toast === 'function') window.toast(pgT(`Added: ${data.created}`, `Добавлено: ${data.created}`), 'success');
      if (typeof window.refresh === 'function') window.refresh();
    } catch (error) {
      parseStatus(error.message, 'error');
    } finally {
      updateBatchButton();
    }
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#pg-parse')) {
      event.preventDefault();
      parseCurrentLink();
      return;
    }
    if (event.target.closest('#pg-add-batch')) {
      event.preventDefault();
      addParsedBatch();
    }
  });

  document.addEventListener('change', (event) => {
    if (!event.target.closest('#pg-parse-results')) return;
    const card = event.target.closest('[data-card-index]');
    if (!card) return;
    if (event.target.matches('[data-card-force]')) {
      const force = event.target.checked;
      card.querySelectorAll('[data-card-episode]').forEach((episode) => {
        episode.checked = force || episode.dataset.downloaded !== '1';
      });
    }
    if (event.target.matches('[data-card-episode]')) {
      event.target.dataset.manual = '1';
    }
    updateBatchButton();
  });

  const addForm = document.getElementById('add-form');
  if (addForm) {
    addForm.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        parseCurrentLink();
      },
      true,
    );
  }

  window.Playground.clearParse = clearParse;
  window.Playground.parseLink = parseCurrentLink;
  window.Playground.collectBatchTasks = collectBatchTasks;

})();
