/* Production UI extras: volume editor, category/cookie designer, Add-by-link cards. */
(() => {
  'use strict';

  function say(message, type) {
    if (typeof window.toast === 'function') window.toast(message, type || 'info');
  }

  function refreshAll() {
    if (typeof window.refresh === 'function') window.refresh();
    if (typeof window.refreshMangoJobs === 'function') window.refreshMangoJobs();
    if (typeof window.refreshMangoHistory === 'function') window.refreshMangoHistory(true);
  }

  function numberValue(value) {
    const n = Number.parseFloat(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  /** Same cascade as the prototype: edge chapters move with the selection. */
  function planMove(chapters, selectedIds, targetVolume) {
    const ids = new Set((selectedIds || []).map(String));
    const selected = chapters.filter((chapter) => ids.has(String(chapter.id)));
    if (!selected.length) throw new Error('Выберите хотя бы одну главу');
    const source = String(selected[0].volume);
    if (selected.some((chapter) => String(chapter.volume) !== source)) {
      throw new Error('Главы должны быть из одного тома');
    }
    const target = String(targetVolume);
    if (!Number.isInteger(Number(target)) || Number(target) < 1) {
      throw new Error('Укажите номер тома: целое число от 1');
    }
    if (target === source) throw new Error('Это тот же том');
    const sourceChapters = chapters
      .filter((chapter) => String(chapter.volume) === source)
      .sort((a, b) => numberValue(a.number) - numberValue(b.number));
    const nums = selected.map((chapter) => numberValue(chapter.number));
    const delta = Number(target) - Number(source);
    const edge = delta > 0 ? Math.min(...nums) : Math.max(...nums);
    const moving = sourceChapters.filter((chapter) =>
      delta > 0 ? numberValue(chapter.number) >= edge : numberValue(chapter.number) <= edge,
    );
    return { source, target, moving, numbers: moving.map((chapter) => String(chapter.number)) };
  }

  async function setJobStatus(jobId, status) {
    const job =
      (window.state && window.state.mango && (window.state.mango.jobs || []).find(
        (item) => String(item.id) === String(jobId),
      )) || null;
    if (!job) return;
    const action = status === 'paused' ? 'pause' : 'resume';
    try {
      await window.api(
        '/api/mango/series/' + encodeURIComponent(job.seriesKey) + '/' + action,
        { method: 'POST' },
      );
    } catch (error) {
      say(error.message, 'error');
      return;
    }
    job.status = status;
    if (typeof window.renderMango === 'function') window.renderMango();
  }

  async function moveChapters(seriesKey, selectedIds, targetVolume) {
    return window.api(
      '/api/mango/series/' + encodeURIComponent(seriesKey) + '/chapters/move',
      {
        method: 'POST',
        body: JSON.stringify({ chapterIds: selectedIds, targetVolume }),
      },
    );
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
      /* the panel can load before app i18n in theory */
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
      const source = rows;
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
        null;
      if (!job) return null;
      const chapters =
        job.chapters ||
        (app.mango && app.mango.details[job.id] && app.mango.details[job.id].chapters) ||
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
      const plan = planMove(editor.chapters, [...editor.selected], editor.target);
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

  async function openVolumeEditor(scope, seriesKey, jobId) {
    if (overlay && !overlay.hidden) closeEditor();
    const app = window.state || {};
    if (scope === 'series' && app.mango && app.mango.series) {
      seriesKey = app.mango.series.seriesKey;
    }
    const found = editorEntries(scope, seriesKey, jobId);
    if (!found || !found.chapters.length) {
      say(pgT('No chapters to edit.', 'Нет глав для редактирования.'), 'error');
      return;
    }
    let wasRunning = false;
    if (scope === 'job') {
      const job = (app.mango && app.mango.jobs || []).find(
        (entry) => String(entry.id) === String(jobId),
      );
      if (job && job.status === 'running') {
        wasRunning = true;
        await setJobStatus(jobId, 'paused');
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
      setJobStatus(jobId, 'running');
      if (typeof window.refreshMangoJobs === 'function') window.refreshMangoJobs();
    }
  }

  async function applyEditor() {
    if (!editor) return;
    let plan;
    let result;
    try {
      plan = planMove(editor.chapters, [...editor.selected], editor.target);
      result = await moveChapters(editor.seriesKey, [...editor.selected], editor.target);
    } catch (error) {
      say(error.message, 'error');
      return;
    }
    editor.applied = true;
    if (editor.scope === 'job' && editor.wasRunning) {
      await setJobStatus(editor.jobId, 'running').catch(() => {});
    }
    try {
      if (editor.scope === 'series') {
        const box = document.getElementById('mango-chapters');
        if (box) box.dataset.key = '';
        if (typeof window.refreshMangoSeries === 'function') await window.refreshMangoSeries();
        if (typeof window.renderMango === 'function') window.renderMango();
      } else if (editor.scope === 'history') {
        if (typeof window.refreshMangoHistory === 'function') await window.refreshMangoHistory(true);
        if (typeof window.renderMangoHistory === 'function') window.renderMangoHistory();
      } else if (editor.scope === 'job') {
        if (typeof window.refreshMangoJobs === 'function') await window.refreshMangoJobs();
        if (typeof window.renderMango === 'function') window.renderMango();
      }
    } catch {
      // The server move already succeeded; a refresh failure must not keep
      // the editor open with a stale list.
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

/* ---------- categories / cookies designer ---------- */

  let categoryRules = null;
  let categorySaveTimer = null;
  const DEFAULT_LIBRARY_RULES = [
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

  function settingsForDesigner() {
    return (window.state && window.state.settings) || null;
  }

  function classifyCategory(section, kind, rating) {
    const rules = Array.isArray(window.state?.settings?.library_rules)
      ? window.state.settings.library_rules
      : DEFAULT_LIBRARY_RULES;
    const wantedSection = String(section || '').toLowerCase();
    const wantedKind = String(kind || 'any').toLowerCase();
    const wantedRating = String(rating || 'any').toLowerCase().replace(/\+/g, '');
    const score = (rule) => {
      let value = 0;
      if (String(rule.rating || 'any').toLowerCase().replace(/\+/g, '') !== 'any') value += 2;
      if (String(rule.kind || 'any').toLowerCase() !== 'any') value += 1;
      if (String(rule.section || '').toLowerCase() === wantedSection) value += 4;
      return value;
    };
    const match = rules
      .filter((rule) => String(rule.section || '').toLowerCase() === wantedSection)
      .filter((rule) => {
        const ruleKind = String(rule.kind || 'any').toLowerCase();
        return ruleKind === 'any' || ruleKind === wantedKind;
      })
      .filter((rule) => {
        const ruleRating = String(rule.rating || 'any').toLowerCase().replace(/\+/g, '');
        return ruleRating === 'any' || ruleRating === wantedRating;
      })
      .sort((a, b) => score(b) - score(a))[0];
    return match ? match.folder : null;
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
        const folder = classifyCategory(section, kind, rating) || 'default';
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
    if (status) status.textContent = `${pgT('Rules', 'Правил')}: ${categoryRules.length} · ${pgT('saved on server', 'сохраняется на сервере')}`;
    categoryPreview();
  }

  function saveCategoryRules() {
    if (!categoryRules) return;
    const rules = JSON.parse(JSON.stringify(categoryRules));
    if (window.state && window.state.settings) window.state.settings.library_rules = rules;
    categoryPreview();
    clearTimeout(categorySaveTimer);
    categorySaveTimer = setTimeout(() => {
      window.api('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ library_rules: rules }),
      }).catch((error) => say(error.message, 'error'));
    }, 350);
  }

  function initCategoryDesigner(force) {
    const box = document.getElementById('pg-cat-rules');
    const settings = settingsForDesigner();
    if (!box || !settings) return false;
    if (!box.dataset.ready || force) {
      categoryRules = JSON.parse(
        JSON.stringify(
          Array.isArray(settings.library_rules) && settings.library_rules.length
            ? settings.library_rules
            : DEFAULT_LIBRARY_RULES,
        ),
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
      categoryRules.push({ section: 'films', kind: 'film', rating: 'any', folder: pgT('New folder', 'Новая папка') });
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
        if (!line) return;
        if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length);
        else if (/^#/.test(line)) return;
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
    let cookieSaveTimer = null;
    const save = () => {
      if (window.state && window.state.settings) {
        window.state.settings.rezka_cookies = input.value;
      }
      drawCookieStatus();
      clearTimeout(cookieSaveTimer);
      cookieSaveTimer = setTimeout(() => {
        window.api('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({ rezka_cookies: input.value }),
        }).catch((error) => say(error.message, 'error'));
      }, 350);
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
    const cardsHtml = payload.cards
      .map((card, cardIndex) => {
        const episodes = card.episodes || [];
        const voiceNames = (card.voiceovers || []).filter(Boolean);
        const voice = card.voiceover || voiceNames[0] || pgT('Unknown', 'Неизвестная');
        const voices = voiceNames.length ? voiceNames : [voice];
        const singleVoice = voices.length <= 1;
        const selectedEpisodes = episodes.filter((episode) => !episode.downloaded).length;
        return `<article class="pg-add-card" data-card-index="${cardIndex}" data-card-downloaded="${card.downloaded || 0}" data-card-total="${card.total || 1}">
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
              <select class="input" data-card-voice${singleVoice ? ' disabled' : ''}>
                ${voices.map((v) => `<option value="${esc(v)}"${v === voice ? ' selected' : ''}>${esc(v)}</option>`).join('')}
              </select>
            </label>
            <label class="pg-add-force">
              <input type="checkbox" data-card-force>
              <span>${esc(pgT('Download again', 'Скачать заново'))}</span>
            </label>
            <span class="pg-add-subs">${card.subtitles && card.subtitles.length ? pgT('Subtitles: RU · auto', 'Субтитры: RU · авто') : pgT('No subtitles', 'Субтитров нет')}</span>
          </div>
          ${episodes.length ? `<div class="pg-add-epbar">
            <button type="button" class="pg-add-eptoggle" data-ep-toggle aria-expanded="false">
              <span class="pg-add-epchev" aria-hidden="true">▸</span>
              <span>${esc(pgT('Episodes', 'Серии'))} (${episodes.length})</span>
              <span class="pg-add-epsep">·</span>
              <span><b data-ep-count>${selectedEpisodes}</b> ${esc(pgT('selected', 'выбрано'))}</span>
            </button>
            <button type="button" class="pg-mini-btn" data-card-ep-all>${esc(pgT('All', 'Все'))}</button>
            <button type="button" class="pg-mini-btn" data-card-ep-none>${esc(pgT('None', 'Ничего'))}</button>
          </div>
          <div class="pg-add-episodes" hidden>${episodes.map((episode, index) => cardEpisodeHtml(card, episode, index)).join('')}</div>` : ''}
        </article>`;
      })
      .join('');
    box.innerHTML = `<div class="pg-parse-tools">
        <span class="pg-parse-tools-label">${esc(pgT('Selection', 'Выбор'))}</span>
        <button type="button" class="pg-mini-btn" data-cards-all>${esc(pgT('Select all', 'Выбрать все'))}</button>
        <button type="button" class="pg-mini-btn" data-cards-none>${esc(pgT('Clear', 'Убрать все'))}</button>
      </div>` + cardsHtml;
    parseStatus(`${pgT('Cards', 'Карточек')}: ${payload.cards.length} · ${payload.source}`, 'ok');
    updateBatchButton();
  }

  function updateEpisodesSummary(cardEl) {
    const count = cardEl.querySelector('[data-ep-count]');
    if (!count) return;
    const inputs = [...cardEl.querySelectorAll('[data-card-episode]')];
    count.textContent = String(inputs.filter((input) => input.checked).length);
    if (inputs.some((input) => input.checked)) {
      const cardCheck = cardEl.querySelector('[data-card-check]');
      if (cardCheck) cardCheck.checked = true;
    }
  }

  function setAllEpisodes(cardEl, checked) {
    const force = Boolean(cardEl.querySelector('[data-card-force]')?.checked);
    const inputs = [...cardEl.querySelectorAll('[data-card-episode]')];
    inputs.forEach((input) => {
      // «Все» выбирает новые серии. Уже скачанные добавляются только
      // при явной галочке «Скачать заново», иначе получатся дубли.
      input.checked = checked && (force || input.dataset.downloaded !== '1');
      delete input.dataset.manual;
    });
    const cardCheck = cardEl.querySelector('[data-card-check]');
    if (cardCheck) cardCheck.checked = checked && inputs.some((input) => input.checked);
    updateEpisodesSummary(cardEl);
  }

  function setAllCards(checked) {
    const box = document.getElementById('pg-parse-results');
    if (!box) return;
    box.querySelectorAll('[data-card-index]').forEach((cardEl) => {
      const inputs = [...cardEl.querySelectorAll('[data-card-episode]')];
      if (inputs.length) {
        setAllEpisodes(cardEl, checked);
        return;
      }
      const downloaded = Number(cardEl.getAttribute('data-card-downloaded')) || 0;
      const total = Number(cardEl.getAttribute('data-card-total')) || 1;
      const force = Boolean(cardEl.querySelector('[data-card-force]')?.checked);
      const cardCheck = cardEl.querySelector('[data-card-check]');
      if (cardCheck) cardCheck.checked = checked && (force || downloaded < total);
    });
  }

  function toggleEpisodes(button) {
    const cardEl = button.closest('[data-card-index]');
    const panel = cardEl?.querySelector('.pg-add-episodes');
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.classList.toggle('is-open', open);
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
      url: card.url || parsedBatch.url,
      filename: card.filename || null,
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

  function rezkaSelection(cardEl, card) {
    const force = Boolean(cardEl.querySelector('[data-card-force]')?.checked);
    const episodes = [...cardEl.querySelectorAll('[data-card-episode]')]
      .filter((input) => input.checked)
      .map((input) => card.episodes[Number(input.getAttribute('data-card-episode'))])
      .filter(Boolean);
    return {
      url: card.url,
      title: card.title,
      origTitle: card.origTitle,
      year: card.year,
      kind: card.kind,
      section: card.section,
      rating: card.rating,
      quality: cardEl.querySelector('[data-card-quality]')?.value || card.quality,
      voiceover: cardEl.querySelector('[data-card-voice]')?.value || card.voiceover,
      translatorId: card.translatorId || null,
      episodes,
      force,
      subtitles: card.subtitles && card.subtitles.includes('ru'),
    };
  }

  function collectRezkaSelections() {
    const box = document.getElementById('pg-parse-results');
    if (!box || !parsedBatch) return [];
    const items = [];
    box.querySelectorAll('[data-card-index]').forEach((cardEl) => {
      if (!cardEl.querySelector('[data-card-check]')?.checked) return;
      const card = parsedBatch.cards[Number(cardEl.getAttribute('data-card-index'))];
      if (!card) return;
      const selection = rezkaSelection(cardEl, card);
      if (selection.episodes.length || selection.force || !card.downloaded) {
        items.push(selection);
      }
    });
    return items;
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
      const data = await window.api('/api/tasks/preview', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
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
    const isRezka = parsedBatch && parsedBatch.source === 'rezka';
    const payload = isRezka ? collectRezkaSelections() : collectBatchTasks();
    if (!payload.length) {
      parseStatus(pgT('Nothing to add: everything selected is already downloaded.', 'Нечего добавлять: всё выбранное уже скачано.'), 'error');
      return;
    }
    const button = document.getElementById('pg-add-batch');
    if (button) button.disabled = true;
    try {
      const data = await window.api(isRezka ? '/api/tasks/rezka' : '/api/tasks', {
        method: 'POST',
        body: JSON.stringify(isRezka ? { items: payload } : payload),
      });
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
      return;
    }
    const episodeToggle = event.target.closest('[data-ep-toggle]');
    if (episodeToggle) {
      event.preventDefault();
      toggleEpisodes(episodeToggle);
      return;
    }
    const cardAll = event.target.closest('[data-card-ep-all]');
    const cardNone = event.target.closest('[data-card-ep-none]');
    if (cardAll || cardNone) {
      event.preventDefault();
      const cardEl = event.target.closest('[data-card-index]');
      if (cardEl) setAllEpisodes(cardEl, Boolean(cardAll));
      updateBatchButton();
      return;
    }
    const cardsAll = event.target.closest('[data-cards-all]');
    const cardsNone = event.target.closest('[data-cards-none]');
    if (cardsAll || cardsNone) {
      event.preventDefault();
      setAllCards(Boolean(cardsAll));
      updateBatchButton();
    }
  });

  document.addEventListener('change', (event) => {
    if (!event.target.closest('#pg-parse-results')) return;
    const card = event.target.closest('[data-card-index]');
    if (!card) return;
    if (event.target.matches('[data-card-force]')) {
      const force = event.target.checked;
      if (force) {
        const check = card.querySelector('[data-card-check]');
        if (check) check.checked = true;
      }
      card.querySelectorAll('[data-card-episode]').forEach((episode) => {
        episode.checked = force || episode.dataset.downloaded !== '1';
        delete episode.dataset.manual;
      });
    }
    if (event.target.matches('[data-card-episode]')) {
      event.target.dataset.manual = '1';
      const inputs = [...card.querySelectorAll('[data-card-episode]')];
      const cardCheck = card.querySelector('[data-card-check]');
      if (cardCheck) cardCheck.checked = inputs.some((episode) => episode.checked);
    }
    updateEpisodesSummary(card);
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

  
  window.IdkUI = {
    clearParse,
    parseLink: parseCurrentLink,
    collectBatchTasks,
    openVolumeEditor,
  };


})();
