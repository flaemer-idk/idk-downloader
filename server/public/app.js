/* ============================================================
   idk downloader — веб-интерфейс (дизайн «Панель»)
   Vanilla JS, обычный скрипт, без сборки.
   Данные — реальные: опрос /api/state раз в секунду.

   I18N: переводы лежат в словарях I18N.dict.<код> (веб-аналог
   gettext .po — те же пары «ключ → строка», только в JS/JSON).
   Как добавить язык:
     1. скопировать dict.en и перевести значения;
     2. добавить язык в I18N.langs (кнопка-переключатель);
     3. если в языке свои формы множественного числа — добавить
        правило в I18N.plural и массив месяцев в I18N.months.
   ============================================================ */
'use strict';

/* ---------------- i18n ---------------- */

var I18N = {
  langs: [
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'ru', label: 'RU', name: 'Русский' }
  ],
  plural: {
    en: function (n) { return n === 1 ? 0 : 1; },
    ru: function (n) {
      var n10 = n % 10, n100 = n % 100;
      if (n10 === 1 && n100 !== 11) return 0;
      if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 1;
      return 2;
    }
  },
  months: {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  dict: {
    en: {
      'app.title': 'idk downloader',
      'nav.queue': 'Queue',
      'nav.history': 'History',
      'nav.settings': 'Settings',
      'nav.aria': 'Main navigation',
      'lang.aria': 'Interface language',
      'auth.prompt': 'The server requires an access token. Enter it:',
      'auth.denied': 'Access denied (wrong token)',
      'server.title': 'Server',
      'server.free': '{v} free',
      'server.total': 'of {total} · used {used}',
      'server.need': 'need ≈{v}',
      'server.needHint': 'The queue still needs roughly this much: unfinished tasks minus what is already downloaded. Tasks with unknown size count as the average of finished ones, otherwise {v}.',
      'server.meta': 'v{version} · ffmpeg: {ffmpeg}',
      'server.ffmpegYes': 'available',
      'server.ffmpegNo': 'missing',
      'sub.queue': '{n} {groups} · downloading {dl}',
      'sub.history': '{n} {records}',
      'sub.settings': 'Downloads, media library and name templates',
      'kpi.downloading': 'Downloading',
      'kpi.queued': 'Queued',
      'kpi.done': 'Done',
      'kpi.left': 'Remaining',
      'kpi.slots': 'slots used {dl} of {max}',
      'kpi.pausedPart': 'paused {p}',
      'kpi.errPart': 'errors {e}',
      'kpi.waitSlot': 'waiting for a free slot',
      'kpi.inHistory': 'in history: {n}',
      'kpi.freeOnServer': '{v} free on server',
      'kpi.spaceWarn': 'may not be enough space!',
      'status.queued': 'Queued',
      'status.downloading': 'Downloading',
      'status.paused': 'Paused',
      'status.done': 'Done',
      'status.error': 'Error',
      'status.canceled': 'Cancelled',
      'kind.movie': 'movie',
      'kind.series': 'series',
      'pl.groups': ['group', 'groups'],
      'pl.files': ['file', 'files'],
      'pl.records': ['record', 'records'],
      'pl.tasks': ['task', 'tasks'],
      'group.files': 'Files · {n}',
      'file.video': 'video',
      'file.subs': 'subtitles',
      'file.realResHint': 'really in the file: {w}×{h}',
      'file.sourcePage': 'open the source page',
      'file.expiredHint': 'Expired link? Take a fresh one on the page and send the task again —',
      'kpi.unknownSizes': 'size unknown: {n}',
      'act.pause': 'Pause',
      'act.resume': 'Resume',
      'act.cancel': 'Cancel',
      'act.retry': 'Retry',
      'act.delete': 'Delete',
      'act.sureCancel': 'Really cancel?',
      'act.sureDelete': 'Really delete?',
      'top.pauseAll': 'Pause all',
      'top.resumeAll': 'Resume all',
      'top.retryFailed': 'Retry failed',
      'top.cancelAll': 'Cancel all',
      'top.clearDone': 'Clear completed',
      'act.sureClear': 'Really clear?',
      'top.add': 'Add by link',
      'queue.emptyTitle': 'The queue is empty',
      'queue.emptyText': 'Send a task from the browser extension or add a direct link.',
      'history.searchPh': 'Search by file name…',
      'history.filterAria': 'Filter by status',
      'history.fAll': 'All',
      'history.fDone': 'Done',
      'history.fCanceled': 'Cancelled',
      'history.colFile': 'File',
      'history.colStatus': 'Status',
      'history.colSize': 'Size',
      'history.colDate': 'Completed',
      'history.colAct': 'Actions',
      'history.modeAria': 'History section',
      'history.modeFiles': 'Files',
      'history.modeMango': 'Mango',
      'history.count': '{shown} of {total}',
      'history.notFound': 'Nothing found for “{q}”',
      'history.empty': 'No records',
      'history.deleteRec': 'Delete record',
      'history.shownFirst': 'Showing first {n} records — refine the search',
      'modal.title': 'Add by link',
      'modal.close': 'Close',
      'modal.url': 'Direct link (mp4 / m3u8 / vtt)',
      'modal.urlErr': 'Enter a direct link to a file.',
      'modal.urlHint': 'Normally the browser extension sends tasks here by itself — use this form only when you already have a direct file link.',
      'modal.name': 'File name',
      'modal.namePh': 'movie (2024).mp4',
      'modal.nameHint': 'Optional. Empty — taken from the link.',
      'modal.referer': 'Referer',
      'modal.refererHint': 'Optional. Sent with requests to the CDN.',
      'modal.cancel': 'Cancel',
      'modal.add': 'Add to queue',
      'toast.addedN': 'Added to the queue: {n}',
      'toast.pausedAll': 'Paused: {n} {tasks}',
      'toast.noActive': 'No active downloads',
      'toast.resumedAll': 'Resumed: {n} {tasks}',
      'toast.noPaused': 'Nothing is paused',
      'toast.retriedFailed': 'Failed tasks requeued: {n}',
      'toast.noFailed': 'No failed tasks',
      'toast.canceledAll': 'Cancelled: {n} {tasks}',
      'toast.clearedQueue': 'Removed from the queue: {n} {tasks} (records kept in history)',
      'toast.noDoneGroups': 'No completed tasks in the queue',
      'toast.groupPaused': '“{title}” — paused',
      'toast.groupResumed': '“{title}” — resumed',
      'toast.groupCanceled': '“{title}” — cancelled: {n} {files}',
      'toast.groupRetried': '“{title}” — back in the queue',
      'toast.groupDeleted': '“{title}” — removed from the list (files on disk remain)',
      'toast.noMatching': 'No matching tasks in the group',
      'toast.recDeleted': 'Record deleted (files on disk remain)',
      'toast.recRetried': 'Back in the queue',
      'toast.saved': 'Saved',
      'toast.reverted': 'Reverted to saved values',
      'toast.netErr': 'Connection error: {msg}',
      'toast.netOk': 'Connection restored',
      'toast.actionErr': 'Failed: {msg}',
      'settings.title': 'Settings',
      'set.interface': 'Interface',
      'set.lang': 'Interface language',
      'set.langHint': 'Applies immediately, the choice is remembered.',
      'set.downloads': 'Downloads',
      'set.dir': 'Download folder on the server',
      'set.dirHint': 'Absolute path where files land before being sorted into the library.',
      'set.simul': 'Simultaneous downloads',
      'set.range116': 'From 1 to 16',
      'set.retries': 'Attempts per task',
      'set.range150': 'From 1 to 50',
      'set.delay': 'Delay between attempts, sec',
      'set.overwrite': 'Overwrite finished files on re-download (no “ (1)” suffix)',
      'set.library': 'Media library',
      'set.libDir': 'Library folder',
      'set.libHint': 'Empty — download into the downloads folder; otherwise files are sorted into the library by categories.',
      'set.cats': 'Categories → library folders',
      'set.catsHint': 'One line per category: <code>section = folder</code>, e.g. <code>films = Movies</code>. The key <code>default</code> catches everything not listed.',
      'set.mango': 'Manga',
      'set.mangoDir': 'Manga folder',
      'set.mangoHint': 'Empty — a “mango” subfolder inside the downloads folder.',
      'set.chromium': 'Chromium path',
      'set.chromiumHint': 'Empty — auto-detect. Used only for com-x.life pages (DleGuard); MangaDex and MangaLib go through their APIs.',
      'nav.mango': 'Mango',
      'sub.mango': 'Titles from com-x.life, MangaDex and MangaLib',
      'mango.source': 'Source',
      'mango.add': 'Add',
      'mango.launching': 'Opening the page…',
      'mango.urlHint': 'MangaDex and MangaLib go through their APIs; com-x.life opens in headless Chromium only while parsing. No extension or cookies needed.',
      'mango.language': 'Language',
      'mango.external': 'on site',
      'mango.unavailable': 'unavailable',
      'mango.discard': 'Discard',
      'mango.new': 'New',
      'mango.all': 'All',
      'mango.selectNew': 'New only',
      'mango.none': 'None',
      'mango.chapters': 'Chapters: {n}, already downloaded: {d}',
      'mango.downloaded': 'already downloaded',
      'mango.emptyList': 'No chapters for this language',
      'mango.jobLine': '{done} of {total} chapters · failed {failed}',
      'mango.folder': 'Folder: {dir}',
      'mango.selectedCount': 'Selected: {n} {chapters}',
      'mango.downloadN': 'Download {n} {chapters}',
      'mango.volumesTitle': 'Volumes · {n} {chapters}',
      'mango.volumeName': 'Volume {n}',
      'mango.next': 'next: {label}',
      'mango.inHistory': 'in history',
      'mango.cancelSeries': 'Cancel title',
      'mango.deleteVolume': 'Delete volume',
      'mango.deleted': 'deleted',
      'mango.alreadyActive': 'This title is already downloading — wait for it or cancel it first',
      'mango.historyEmptyTitle': 'No manga downloaded yet',
      'mango.historyEmptyText': 'Downloaded chapters will appear here, grouped by title.',
      'mango.footHint': 'Cover.png in the title folder is yours to add; already downloaded chapters are skipped.',
      'mango.emptyTitle': 'No manga downloads yet',
      'mango.emptyText': 'Paste a title link above and press Add.',
      'toast.mangoStarted': 'Manga queued: {n} {chapters}',
      'toast.mangoAll': 'Everything selected is already downloaded',
      'toast.mangoEmpty': 'Select at least one chapter',
      'toast.mangoCanceled': 'Manga download cancelled',
      'toast.mangoPaused': 'Manga paused',
      'toast.mangoResumed': 'Manga resumed',
      'toast.mangoDeleted': 'Deleted volumes: {n}',
      'toast.mangoVolumeDeleted': 'Volume {n} deleted',
      'pl.chapters': ['chapter', 'chapters'],
      'set.tpl': 'Name templates',
      'set.tplFilm': 'Name template: movies',
      'set.tplSeries': 'Name template: series',
      'set.tplSubs': 'Name template: subtitles',
      'set.tplExamples': 'Preview examples: movie — “Minions” (2015); series — “The Shining” (1997), 3 episodes.',
      'set.phTitle': 'Template placeholders',
      'set.phHint': 'Click a placeholder to insert it into the last edited template.',
      'set.slashHint': '“/” in a template creates a subfolder. The extension (.mp4 / .vtt) is appended automatically.',
      'ph.title': 'Title on the site (localized)',
      'ph.orig_title': 'Original title (best variant)',
      'ph.quality': 'Quality, e.g. 1080p',
      'ph.voiceover': 'Voiceover / dubbing',
      'ph.year': 'Year',
      'ph.year_part': '“ (2015)” or empty',
      'ph.season': 'Season title (as on the site)',
      'ph.season_id': 'Season number, no padding (1, 2, …)',
      'ph.episode': 'Episode title (as on the site)',
      'ph.episode_id': 'Episode number, no padding',
      'ph.sxxexx': '“ S1E2” or empty',
      'ph.season_folder': '“Season 1” or empty',
      'ph.movie_id': 'Movie ID on the site',
      'ph.subtitle_lang': 'Subtitle language code (rus, en)',
      'set.footNote': 'Settings are stored on the server; “Simultaneous downloads” applies immediately.',
      'set.revert': 'Revert',
      'set.save': 'Save',
      'units.speed': '{v}/s',
      'untitled': 'Untitled'
    },
    ru: {
      'app.title': 'idk downloader',
      'nav.queue': 'Очередь',
      'nav.history': 'История',
      'nav.settings': 'Настройки',
      'nav.aria': 'Основная навигация',
      'lang.aria': 'Язык интерфейса',
      'auth.prompt': 'Сервер требует токен доступа. Введите его:',
      'auth.denied': 'Нет доступа (неверный токен)',
      'server.title': 'Сервер',
      'server.free': 'свободно {v}',
      'server.total': 'из {total} · занято {used}',
      'server.need': 'нужно ≈{v}',
      'server.needHint': 'Столько места ещё понадобится очереди: незаконченные задачи минус уже скачанное. Задачи без известного веса считаются по среднему, а если истории нет — как {v}.',
      'server.meta': 'v{version} · ffmpeg: {ffmpeg}',
      'server.ffmpegYes': 'есть',
      'server.ffmpegNo': 'нет',
      'sub.queue': '{n} {groups} · скачивается {dl}',
      'sub.history': '{n} {records}',
      'sub.settings': 'Загрузки, медиатека и шаблоны имён',
      'kpi.downloading': 'Скачивается',
      'kpi.queued': 'В очереди',
      'kpi.done': 'Готово',
      'kpi.left': 'Осталось',
      'kpi.slots': 'слотов занято {dl} из {max}',
      'kpi.pausedPart': 'пауза {p}',
      'kpi.errPart': 'ошибок {e}',
      'kpi.waitSlot': 'ожидают свободного слота',
      'kpi.inHistory': 'в истории: {n}',
      'kpi.freeOnServer': 'свободно {v} на сервере',
      'kpi.spaceWarn': 'может не хватить места!',
      'status.queued': 'В очереди',
      'status.downloading': 'Скачивается',
      'status.paused': 'Пауза',
      'status.done': 'Готово',
      'status.error': 'Ошибка',
      'status.canceled': 'Отменена',
      'kind.movie': 'фильм',
      'kind.series': 'сериал',
      'pl.groups': ['группа', 'группы', 'групп'],
      'pl.files': ['файл', 'файла', 'файлов'],
      'pl.records': ['запись', 'записи', 'записей'],
      'pl.tasks': ['задача', 'задачи', 'задач'],
      'group.files': 'Файлы · {n}',
      'file.video': 'видео',
      'file.subs': 'субтитры',
      'file.realResHint': 'в файле на самом деле: {w}×{h}',
      'file.sourcePage': 'открыть страницу-источник',
      'file.expiredHint': 'Ссылка протухла? Возьмите свежую на странице и отправьте задачу заново —',
      'kpi.unknownSizes': 'вес неизвестен: {n}',
      'act.pause': 'Пауза',
      'act.resume': 'Продолжить',
      'act.cancel': 'Отменить',
      'act.retry': 'Повторить',
      'act.delete': 'Удалить',
      'act.sureCancel': 'Точно отменить?',
      'act.sureDelete': 'Точно удалить?',
      'top.pauseAll': 'Остановить все',
      'top.resumeAll': 'Возобновить все',
      'top.retryFailed': 'Повторить сбойные',
      'top.cancelAll': 'Отменить все',
      'top.clearDone': 'Очистить завершённые',
      'act.sureClear': 'Точно очистить?',
      'top.add': 'Добавить по ссылке',
      'queue.emptyTitle': 'Очередь пуста',
      'queue.emptyText': 'Отправьте задачу из расширения браузера или добавьте прямую ссылку.',
      'history.searchPh': 'Поиск по имени файла…',
      'history.filterAria': 'Фильтр по статусу',
      'history.fAll': 'Все',
      'history.fDone': 'Готово',
      'history.fCanceled': 'Отменена',
      'history.colFile': 'Файл',
      'history.colStatus': 'Статус',
      'history.colSize': 'Размер',
      'history.colDate': 'Завершено',
      'history.colAct': 'Действия',
      'history.modeAria': 'Раздел истории',
      'history.modeFiles': 'Файлы',
      'history.modeMango': 'Манго',
      'history.count': '{shown} из {total}',
      'history.notFound': 'Ничего не найдено по запросу «{q}»',
      'history.empty': 'Записей нет',
      'history.deleteRec': 'Удалить запись',
      'history.shownFirst': 'Показаны первые {n} записей — уточните поиск',
      'modal.title': 'Добавить по ссылке',
      'modal.close': 'Закрыть',
      'modal.url': 'Прямая ссылка (mp4 / m3u8 / vtt)',
      'modal.urlErr': 'Укажите прямую ссылку на файл.',
      'modal.urlHint': 'Обычно расширение браузера отправляет задачи само — эта форма нужна, только если у вас уже есть прямая ссылка на файл.',
      'modal.name': 'Имя файла',
      'modal.namePh': 'фильм (2024).mp4',
      'modal.nameHint': 'Необязательно. Пусто — имя из ссылки.',
      'modal.referer': 'Referer',
      'modal.refererHint': 'Необязательно. Подставляется в запросы к CDN.',
      'modal.cancel': 'Отмена',
      'modal.add': 'Добавить в очередь',
      'toast.addedN': 'Добавлено в очередь: {n}',
      'toast.pausedAll': 'Остановлено: {n} {tasks}',
      'toast.noActive': 'Активных загрузок нет',
      'toast.resumedAll': 'Возобновлено: {n} {tasks}',
      'toast.noPaused': 'На паузе ничего нет',
      'toast.retriedFailed': 'Сбойные задачи возвращены в очередь: {n}',
      'toast.noFailed': 'Сбойных задач нет',
      'toast.canceledAll': 'Отменено: {n} {tasks}',
      'toast.clearedQueue': 'Убрано из очереди: {n} {tasks} (записи в истории остались)',
      'toast.noDoneGroups': 'Завершённых задач в очереди нет',
      'toast.groupPaused': '«{title}» — остановлено',
      'toast.groupResumed': '«{title}» — возобновлено',
      'toast.groupCanceled': '«{title}» — отменено: {n} {files}',
      'toast.groupRetried': '«{title}» — возвращено в очередь',
      'toast.groupDeleted': '«{title}» — убрано из списка (файлы на диске остались)',
      'toast.noMatching': 'В группе нет подходящих задач',
      'toast.recDeleted': 'Запись удалена (файлы на диске остались)',
      'toast.recRetried': 'Возвращено в очередь',
      'toast.saved': 'Сохранено',
      'toast.reverted': 'Возвращены сохранённые значения',
      'toast.netErr': 'Ошибка связи: {msg}',
      'toast.netOk': 'Связь восстановлена',
      'toast.actionErr': 'Не удалось: {msg}',
      'settings.title': 'Настройки',
      'set.interface': 'Интерфейс',
      'set.lang': 'Язык интерфейса',
      'set.langHint': 'Применяется сразу, выбор запоминается.',
      'set.downloads': 'Загрузки',
      'set.dir': 'Папка загрузок на сервере',
      'set.dirHint': 'Абсолютный путь, куда сохраняются файлы до разборки в медиатеку.',
      'set.simul': 'Одновременных загрузок',
      'set.range116': 'От 1 до 16',
      'set.retries': 'Попыток на задачу',
      'set.range150': 'От 1 до 50',
      'set.delay': 'Пауза между попытками, сек',
      'set.overwrite': 'Перезаписывать готовые файлы при повторной загрузке (без « (1)»)',
      'set.library': 'Медиатека',
      'set.libDir': 'Папка медиатеки',
      'set.libHint': 'Пусто — качать в папку загрузок; иначе файлы раскладываются в медиатеку по категориям.',
      'set.cats': 'Категории → папки медиатеки',
      'set.catsHint': 'Одна строка на категорию: <code>раздел = папка</code>, например <code>films = Фильмы</code>. Ключ <code>default</code> — папка для всего неперечисленного.',
      'set.mango': 'Манга',
      'set.mangoDir': 'Папка манги',
      'set.mangoHint': 'Пусто — подпапка «mango» в папке загрузок.',
      'set.chromium': 'Путь к Chromium',
      'set.chromiumHint': 'Пусто — найти автоматически. Нужен только для com-x.life (DleGuard); MangaDex и MangaLib идут через API.',
      'nav.mango': 'Манго',
      'sub.mango': 'Тайтлы с com-x.life, MangaDex и MangaLib',
      'mango.source': 'Источник',
      'mango.add': 'Добавить',
      'mango.launching': 'Открываю страницу…',
      'mango.urlHint': 'MangaDex и MangaLib идут через API; com-x.life открывается в безголовом Chromium только на время разбора. Ни расширения, ни cookies не нужно.',
      'mango.language': 'Язык',
      'mango.external': 'на сайте',
      'mango.unavailable': 'недоступно',
      'mango.discard': 'Сбросить',
      'mango.new': 'Новая',
      'mango.all': 'Все',
      'mango.selectNew': 'Только новые',
      'mango.none': 'Снять всё',
      'mango.chapters': 'Глав: {n}, уже скачано: {d}',
      'mango.downloaded': 'уже есть',
      'mango.emptyList': 'На этом языке глав нет',
      'mango.jobLine': '{done} из {total} глав · провалено {failed}',
      'mango.folder': 'Папка: {dir}',
      'mango.selectedCount': 'Выбрано: {n} {chapters}',
      'mango.downloadN': 'Скачать {n} {chapters}',
      'mango.volumesTitle': 'Тома · {n} {chapters}',
      'mango.volumeName': 'Том {n}',
      'mango.next': 'следующая: {label}',
      'mango.inHistory': 'в истории',
      'mango.cancelSeries': 'Отменить произведение',
      'mango.deleteVolume': 'Удалить том',
      'mango.deleted': 'удалено',
      'mango.alreadyActive': 'Это произведение уже качается — дождитесь окончания или отмените задание',
      'mango.historyEmptyTitle': 'Скачанной манги ещё нет',
      'mango.historyEmptyText': 'Скачанные главы появятся здесь, сгруппированные по тайтлам.',
      'mango.footHint': 'Cover.png в папку тайтла кладёте сами; уже скачанные главы пропускаются.',
      'mango.emptyTitle': 'Загрузок манги ещё не было',
      'mango.emptyText': 'Вставьте ссылку на тайтл выше и нажмите «Добавить».',
      'toast.mangoStarted': 'Манга в очереди: {n} {chapters}',
      'toast.mangoAll': 'Всё выбранное уже скачано',
      'toast.mangoEmpty': 'Выберите хотя бы одну главу',
      'toast.mangoCanceled': 'Загрузка манги отменена',
      'toast.mangoPaused': 'Манга на паузе',
      'toast.mangoResumed': 'Манга продолжает качаться',
      'toast.mangoDeleted': 'Удалено томов: {n}',
      'toast.mangoVolumeDeleted': 'Том {n} удалён',
      'pl.chapters': ['глава', 'главы', 'глав'],
      'set.tpl': 'Шаблоны имён',
      'set.tplFilm': 'Шаблон имени: фильмы',
      'set.tplSeries': 'Шаблон имени: сериалы',
      'set.tplSubs': 'Шаблон имени: субтитры',
      'set.tplExamples': 'Примеры для предпросмотра: фильм — «Minions» (2015); сериал — «The Shining» (1997), 3 серии.',
      'set.phTitle': 'Плейсхолдеры шаблонов',
      'set.phHint': 'Нажмите на плейсхолдер, чтобы вставить его в последний редактируемый шаблон.',
      'set.slashHint': '«/» в шаблоне создаёт подпапку. Расширение (.mp4 / .vtt) добавляется автоматически.',
      'ph.title': 'Название на сайте (локализованное)',
      'ph.orig_title': 'Оригинальное название (лучший вариант)',
      'ph.quality': 'Качество, напр. 1080p',
      'ph.voiceover': 'Озвучка / дубляж',
      'ph.year': 'Год',
      'ph.year_part': '« (2015)» или пусто',
      'ph.season': 'Название сезона (как на сайте)',
      'ph.season_id': 'Номер сезона без нуля (1, 2, …)',
      'ph.episode': 'Название серии (как на сайте)',
      'ph.episode_id': 'Номер серии без нуля',
      'ph.sxxexx': '« S1E2» или пусто',
      'ph.season_folder': '«Season 1» или пусто',
      'ph.movie_id': 'ID фильма на сайте',
      'ph.subtitle_lang': 'Код языка субтитров (rus, en)',
      'set.footNote': 'Настройки хранятся на сервере; «Одновременных загрузок» применяется сразу.',
      'set.revert': 'Вернуть сохранённые',
      'set.save': 'Сохранить',
      'units.speed': '{v}/с',
      'untitled': 'Без названия'
    }
  }
};

var PLACEHOLDERS = [
  '%title%', '%orig_title%', '%quality%', '%voiceover%', '%year%', '%year_part%',
  '%season%', '%season_id%', '%episode%', '%episode_id%', '%sxxexx%',
  '%season_folder%', '%movie_id%', '%subtitle_lang%'
];

/* ---------------- helpers ---------------- */

function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function t(key, params) {
  var d = I18N.dict[state.lang] || I18N.dict.en;
  var v = d[key];
  if (v == null) v = I18N.dict.en[key];
  if (v == null) return key;
  if (typeof v === 'string' && params) {
    v = v.replace(/\{(\w+)\}/g, function (m, k) {
      return params[k] != null ? String(params[k]) : m;
    });
  }
  return v;
}

function tp(key, n) {
  var forms = t(key);
  if (!forms || !forms.length) return '';
  var rule = I18N.plural[state.lang] || I18N.plural.en;
  var idx = rule(n);
  if (idx > forms.length - 1) idx = forms.length - 1;
  return forms[idx];
}

/* двуязычные значения вида { ru: '…', en: '…' } */
function L(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  return x[state.lang] || x.en || '';
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '?';
  var units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var value = Number(bytes);
  var i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1) + ' ' + units[i];
}

function formatSpeed(bps) {
  if (!bps || bps <= 0) return '—';
  return t('units.speed', { v: formatBytes(bps) });
}

function formatDate(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  function p(n) { return String(n).padStart(2, '0'); }
  var hm = p(d.getHours()) + ':' + p(d.getMinutes());
  if (state.lang === 'ru') {
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + hm;
  }
  var months = I18N.months[state.lang] || I18N.months.en;
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ', ' + hm;
}

function clampInt(v, min, max, def) {
  var n = parseInt(v, 10);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function tailOf(filename) {
  var parts = String(filename || '').split('/');
  return parts[parts.length - 1] || String(filename || '');
}

/* ---------------- api ---------------- */

var TOKEN_KEY = 'idk_token';
var LEGACY_TOKEN_KEY = 'hdzg_token'; // ключ до переименования проекта — читается, только если нового нет
var token = '';
try {
  token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || '';
} catch (e) { /* приватный режим */ }

async function api(path, options) {
  var opts = options || {};
  var headers = Object.assign({}, opts.headers || {});
  if (token) headers['X-Auth-Token'] = token;
  if (opts.body) headers['Content-Type'] = 'application/json';

  var response = await fetch(path, Object.assign({}, opts, { headers: headers }));

  if (response.status === 401) {
    var entered = prompt(t('auth.prompt'));
    if (entered) {
      token = entered.trim();
      try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* не критично */ }
      return api(path, options);
    }
    throw new Error(t('auth.denied'));
  }

  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.error || 'HTTP ' + response.status);
  return data;
}

/* ---------------- icons ---------------- */

var ICONS = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  pause: '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/>',
  cancel: '<circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>',
  retry: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>',
  film: '<rect x="3" y="4" width="18" height="16"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/>',
  captions: '<rect x="3" y="5" width="18" height="14"/><line x1="7" y1="15" x2="11" y2="15"/><line x1="14" y1="15" x2="17" y2="15"/><line x1="7" y1="10" x2="9" y2="10"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
};

function icon(name) {
  return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">' +
    (ICONS[name] || '') + '</svg>';
}

/* ---------------- state ---------------- */

var FINISHED_STATUSES = ['done', 'canceled'];
/* приоритет статуса группы: живой процесс важнее, ошибка — сразу за ним */
var GROUP_STATUS_PRIORITY = ['downloading', 'error', 'paused', 'queued', 'canceled', 'done'];

var state = {
  lang: 'en',
  tasks: [],
  groups: [],
  stats: { queued: 0, downloading: 0, paused: 0, done: 0, error: 0, canceled: 0 },
  server: null,
  settings: null,
  collapsed: {},
  armed: {},
  historyFilter: 'all',
  historySearch: '',
  settingsDirty: false,
  netError: '',
  adding: false,
  mango: { series: null, selection: {}, jobs: [], details: {}, detailsPending: {}, stats: { chapters: 0 }, collapsed: {}, expanded: {}, loading: false, langBusy: false },
  historyMode: 'files',
  mangoHistory: [],
  mangoHistoryAt: 0
};

var speedCache = new Map();

/* мгновенная скорость — сервер её не отдаёт, считаем по дельте receivedBytes */
function updateSpeeds(tasks) {
  var now = Date.now();
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    if (task.status !== 'downloading') {
      speedCache.delete(task.id);
      continue;
    }
    var previous = speedCache.get(task.id);
    if (previous && now > previous.time) {
      var instant = ((task.receivedBytes - previous.bytes) * 1000) / (now - previous.time);
      task.speed = Math.max(0, instant * 0.4 + (previous.speed || instant) * 0.6);
    } else {
      task.speed = previous ? previous.speed || 0 : 0;
    }
    speedCache.set(task.id, { bytes: task.receivedBytes, time: now, speed: task.speed || 0 });
  }
}

function loadLang() {
  state.lang = 'en';
  try {
    var v = localStorage.getItem('idk-lang');
    if (v && I18N.dict[v]) state.lang = v;
  } catch (e) { /* file:// / приватный режим — остаёмся на английском */ }
}

function setLang(code) {
  if (!I18N.dict[code]) return;
  state.lang = code;
  try { localStorage.setItem('idk-lang', code); } catch (e) { /* не критично */ }
  applyI18n();
  renderAll();
}

/* ---------------- i18n: применение к DOM ---------------- */

function renderLangSwitch() {
  var box = $('lang-switch');
  if (!box) return;
  box.innerHTML = I18N.langs.map(function (l) {
    return '<button type="button" class="lang-btn' + (l.code === state.lang ? ' active' : '') +
      '" data-lang="' + l.code + '" title="' + escapeHtml(l.name) + '">' + escapeHtml(l.label) + '</button>';
  }).join('');
}

function renderChips() {
  var box = $('ph-list');
  if (!box) return;
  box.innerHTML = PLACEHOLDERS.map(function (ph) {
    return '<button type="button" class="ph-chip" data-ph="' + escapeHtml(ph) +
      '" title="' + escapeHtml(t('ph.' + ph.replace(/%/g, ''))) + '">' + escapeHtml(ph) + '</button>';
  }).join('');
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  renderLangSwitch();
  renderChips();
  var sel = $('set-lang');
  if (sel) sel.value = state.lang;
  updateTplPreviews();
}

/* ---------------- name templates: preview ---------------- */

var TPL_FIELDS = [
  { input: 'set-tpl-film', out: 'prev-film', kind: 'movie', fileType: 'video', def: 'filename_template_film', ext: '.mp4' },
  { input: 'set-tpl-series', out: 'prev-series', kind: 'series', fileType: 'video', def: 'filename_template_series', ext: '.mp4' },
  { input: 'set-tpl-subs', out: 'prev-subs', kind: 'subs', fileType: 'subtitle', def: 'filename_template_subtitle', ext: '.vtt' }
];

var MEDIA_EXT = ['.mp4', '.mkv', '.m3u8', '.avi', '.mov', '.webm', '.flv', '.ts', '.m4v', '.mpg', '.mpeg'];

/* повторяет ensureExtension() сервера, чтобы предпросмотр не врал */
function ensureExtPreview(rel, fileType) {
  var wanted = fileType === 'subtitle' ? '.vtt' : '.mp4';
  var dot = rel.lastIndexOf('.');
  var slash = rel.lastIndexOf('/');
  var ext = dot > slash ? rel.slice(dot).toLowerCase() : '';
  if (ext === wanted) return rel;
  if (fileType === 'subtitle') {
    if (ext === '.srt') return rel;
    /* хвост «.rus» — код языка, а не расширение: просто дописываем .vtt */
    if (ext && MEDIA_EXT.indexOf(ext) === -1) return rel + wanted;
    return (ext ? rel.slice(0, -ext.length) : rel) + wanted;
  }
  if (ext) return rel.slice(0, -ext.length) + wanted;
  return rel + wanted;
}

/* примеры: фильм — Minions (2015), сериал — The Shining (1997), 3 серии.
   Значения токенов — как в tokenValues() сервера (util.js). */
function previewTokens(kind, ep) {
  var series = kind === 'series';
  var seasonId = series ? '1' : '';
  var episodeId = series ? String(ep || 1) : '';
  var year = series ? '1997' : '2015';
  var tokens = {};
  tokens['%title%'] = series ? L({ ru: 'Сияние', en: 'The Shining' }) : L({ ru: 'Миньоны', en: 'Minions' });
  tokens['%orig_title%'] = series ? 'The Shining' : 'Minions';
  tokens['%quality%'] = '1080p';
  tokens['%voiceover%'] = L({ ru: 'Дубляж', en: 'Dub' });
  tokens['%year%'] = year;
  tokens['%year_part%'] = ' (' + year + ')';
  tokens['%season%'] = series ? L({ ru: '1 сезон', en: 'Season 1' }) : '';
  tokens['%season_id%'] = seasonId;
  tokens['%episode%'] = series ? L({ ru: (ep || 1) + ' серия', en: 'Episode ' + (ep || 1) }) : '';
  tokens['%episode_id%'] = episodeId;
  tokens['%sxxexx%'] = seasonId && episodeId ? ' S' + seasonId + 'E' + episodeId : '';
  tokens['%season_folder%'] = seasonId ? 'Season ' + seasonId : '';
  tokens['%movie_id%'] = series ? '171717' : '28165';
  tokens['%subtitle_lang%'] = 'rus';
  tokens['%subtitle_lang_raw%'] = L({ ru: 'Русский', en: 'Russian' });
  return tokens;
}

function applyTplPreview(tpl, tokens, fileType) {
  var result = String(tpl || '');
  Object.keys(tokens).forEach(function (k) { result = result.split(k).join(tokens[k]); });
  result = result.replace(/%[a-zA-Z_]+%/g, '');
  var segments = result
    .split(/[\\/]+/)
    .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
    .filter(Boolean);
  if (!segments.length) segments.push('file');
  return ensureExtPreview(segments.join('/'), fileType);
}

function updateTplPreviews() {
  TPL_FIELDS.forEach(function (fd) {
    var inp = $(fd.input), out = $(fd.out);
    if (!inp || !out) return;
    var tpl = inp.value.trim() || (state.settings ? state.settings[fd.def] : '') || '';
    var rows = [];
    if (fd.kind === 'series') {
      [1, 2, 3].forEach(function (ep) {
        rows.push({ tag: 'series', path: applyTplPreview(tpl, previewTokens('series', ep), fd.fileType) });
      });
    } else if (fd.kind === 'subs') {
      rows.push({ tag: 'movie', path: applyTplPreview(tpl, previewTokens('movie'), fd.fileType) });
      rows.push({ tag: 'series', path: applyTplPreview(tpl, previewTokens('series', 1), fd.fileType) });
    } else {
      rows.push({ tag: 'movie', path: applyTplPreview(tpl, previewTokens('movie'), fd.fileType) });
    }
    out.innerHTML = rows.map(function (r) {
      return '<div class="tp-row"><span class="tp-tag">' + escapeHtml(t('kind.' + r.tag)) + '</span>' +
        '<code class="tp-path" title="' + escapeHtml(r.path) + '">' + escapeHtml(r.path) + '</code></div>';
    }).join('');
  });
}

var lastTplId = null;

function insertPlaceholder(tok) {
  var el = $(lastTplId) || $('set-tpl-film');
  if (!el) return;
  var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
  el.value = el.value.slice(0, start) + tok + el.value.slice(end);
  var pos = start + tok.length;
  el.focus();
  try { el.setSelectionRange(pos, pos); } catch (e) { /* не критично */ }
  updateTplPreviews();
}

/* ---------------- settings form ---------------- */

function fillSettingsForm() {
  var s = state.settings;
  if (!s) return;
  $('set-dir').value = s.download_dir || '';
  $('set-max-concurrent').value = s.max_concurrent;
  $('set-max-attempts').value = s.max_attempts;
  $('set-delay-s').value = Math.max(1, Math.round(Number(s.retry_delay_ms) / 1000));
  $('set-overwrite').checked = s.overwrite_existing === '1';
  $('set-library').value = s.library_dir || '';
  $('set-categories').value = s.library_categories || '';
  $('set-mango-dir').value = s.mango_dir || '';
  $('set-chromium').value = s.chromium_path || '';
  $('set-tpl-film').value = s.filename_template_film || '';
  $('set-tpl-series').value = s.filename_template_series || '';
  $('set-tpl-subs').value = s.filename_template_subtitle || '';
  $('set-lang').value = state.lang;
  updateTplPreviews();
}

async function saveSettings() {
  var body = {
    download_dir: $('set-dir').value.trim(),
    max_concurrent: Number($('set-max-concurrent').value),
    max_attempts: Number($('set-max-attempts').value),
    retry_delay_ms: Math.round(clampInt($('set-delay-s').value, 1, 3600, 15) * 1000),
    overwrite_existing: $('set-overwrite').checked,
    library_dir: $('set-library').value.trim(),
    library_categories: $('set-categories').value,
    mango_dir: $('set-mango-dir').value.trim(),
    chromium_path: $('set-chromium').value.trim(),
    filename_template_film: $('set-tpl-film').value.trim(),
    filename_template_series: $('set-tpl-series').value.trim(),
    filename_template_subtitle: $('set-tpl-subs').value.trim()
  };
  try {
    await api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
    state.settingsDirty = false;
    toast(t('toast.saved'), 'success');
    await refresh();
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
}

/* ---------------- grouping (как в прежней морде) ---------------- */

function categoryFolders() {
  var folders = new Set();
  var raw = state.settings ? state.settings.library_categories : '';
  String(raw || '').split('\n').forEach(function (line) {
    var separator = line.indexOf('=');
    if (separator === -1) return;
    var name = line.slice(separator + 1).trim();
    if (name) folders.add(name);
  });
  return folders;
}

/** Название фильма — первая папка в имени файла, без папки категории. */
function movieFolderFromFilename(task, categories) {
  var parts = String(task.filename || '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  if (categories.has(parts[0])) parts.shift();
  return parts.length >= 2 ? parts[0] : null;
}

/**
 * Группирует задачи: фильм/сериал → серия (или фильм) → файлы (видео + субтитры).
 * Порядок групп — как их отдаёт сервер (активные сверху).
 */
function groupTasks(tasks) {
  var groups = new Map();
  var categories = categoryFolders();

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var movieKey = task.movieId ? 'm:' + task.movieId : 't:' + (task.title || task.origTitle || task.id);
    var itemKey = movieKey + '|s:' + (task.season == null ? '' : task.season) + '|e:' + (task.episode == null ? '' : task.episode);

    if (!groups.has(movieKey)) {
      var folder = movieFolderFromFilename(task, categories);
      var title = folder ||
        (task.origTitle || task.title || String(task.filename || '') || task.url) +
        (task.year ? ' (' + task.year + ')' : '');
      groups.set(movieKey, { key: movieKey, title: title, items: new Map() });
    }

    var group = groups.get(movieKey);
    if (!group.items.has(itemKey)) {
      group.items.set(itemKey, {
        key: itemKey,
        season: task.season == null ? null : task.season,
        episode: task.episode == null ? null : task.episode,
        episodeTitle: task.episodeTitle == null ? null : task.episodeTitle,
        files: []
      });
    }
    group.items.get(itemKey).files.push(task);
  }

  return Array.from(groups.values()).map(function (group) {
    return { key: group.key, title: group.title, items: Array.from(group.items.values()) };
  });
}

function groupFiles(g) {
  var out = [];
  g.items.forEach(function (it) { it.files.forEach(function (f) { out.push(f); }); });
  return out;
}

/* в списке очереди показываем всё, кроме убранных кнопкой «Очистить завершённые»
   (queueHidden): завершённые остаются видимыми, пока их не уберут вручную */
function visibleFiles(g) {
  return groupFiles(g).filter(function (f) { return !f.queueHidden; });
}

function visibleGroups() {
  return state.groups.filter(function (g) { return visibleFiles(g).length > 0; });
}

function groupStatusOf(files) {
  for (var i = 0; i < GROUP_STATUS_PRIORITY.length; i++) {
    var s = GROUP_STATUS_PRIORITY[i];
    if (files.some(function (f) { return f.status === s; })) return s;
  }
  return 'done';
}

function groupTotals(files) {
  var size = 0, received = 0, speed = 0;
  files.forEach(function (f) {
    received += f.receivedBytes || 0;
    if (f.totalBytes > 0) size += f.totalBytes;
    if (f.status === 'downloading') speed += f.speed || 0;
  });
  var pct = size > 0 ? Math.min(100, Math.round(received / size * 100)) : 0;
  return { size: size, received: received, speed: speed, pct: pct };
}

function taskDisplayName(task) {
  var parts = [];
  if (task.season || task.episode) {
    parts.push('S' + (task.season || '?') + 'E' + (task.episode || '?'));
  }
  if (task.fileType === 'subtitle') {
    var lang = task.subtitleLangCode || task.subtitleLang;
    parts.push(t('file.subs') + (lang ? ' (' + lang + ')' : ''));
  } else {
    parts.push(t('file.video') + (task.quality ? ' · ' + qualityWithReal(task) : ''));
  }
  if (task.episodeTitle) parts.push(task.episodeTitle);
  return parts.join(' · ');
}

/**
 * Что заявлено и что внутри: «1080p → 720p».
 * Разрешение считает клиент при пробе (см. client-extension/media-probe.js),
 * сравнение с подписью — здесь, чтобы бейдж не появлялся, когда всё честно.
 */
function claimedHeight(label) {
  var m = /^(\d+)\s*([pkк])/i.exec(String(label || '').trim());
  if (!m) return null;
  var value = Number(m[1]);
  return /p/i.test(m[2]) ? value : value * 540; // «4K» и прочие K-подписи
}

function realResolutionText(task) {
  if (!task.realHeight) return '';
  var claimed = claimedHeight(task.quality);
  if (claimed && Math.abs(task.realHeight - claimed) <= claimed * 0.05) return '';
  return task.realHeight + 'p';
}

function qualityWithReal(task) {
  var real = realResolutionText(task);
  if (!task.quality) return real;
  return real ? task.quality + ' → ' + real : task.quality;
}

/**
 * Страница, с которой прилетела задача: расширение кладёт её в referer
 * (например, rezka.fi/films/…html). По ней можно заново взять ссылку,
 * когда старая протухла. Если referer — тот же хост, что и файл, это не
 * страница, а сам CDN: не ссылаемся.
 */
function sourceUrl(task) {
  var referer = String(task.referer || '').trim();
  if (!/^https?:\/\//i.test(referer)) return null;
  try {
    if (new URL(referer).host === new URL(task.url).host) return null;
  } catch (e) {
    return null;
  }
  return referer;
}

function sourceLink(task, text) {
  var src = sourceUrl(task);
  if (!src) return '';
  return '<a class="src-link" href="' + escapeHtml(src) + '" target="_blank" rel="noreferrer">' +
    escapeHtml(text) + '</a>';
}

/** Ошибка похожа на протухшую подписанную ссылку (403/404/410…)? */
function looksExpired(task) {
  return !!sourceUrl(task) && /\b4\d\d\b/.test(String(task.error || ''));
}

function expiredHintHtml(task) {
  if (!looksExpired(task)) return '';
  return '<div class="cf-hint">' + icon('info') +
    '<span>' + escapeHtml(t('file.expiredHint')) + ' ' +
    sourceLink(task, t('file.sourcePage')) + '</span></div>';
}

/* ---------------- two-click arming ---------------- */

function arm(key) {
  disarm(key);
  state.armed[key] = window.setTimeout(function () {
    delete state.armed[key];
    renderAll();
  }, 4000);
}

function disarm(key) {
  if (state.armed[key]) {
    clearTimeout(state.armed[key]);
    delete state.armed[key];
  }
}

function isArmed(key) {
  return !!state.armed[key];
}

/* ---------------- toast ---------------- */

function toast(msg, type) {
  var ty = type || 'info';
  var ic = ty === 'success' ? 'check' : (ty === 'error' ? 'alert' : 'info');
  var el = document.createElement('div');
  el.className = 'toast toast-' + ty;
  el.innerHTML = icon(ic) + '<span>' + escapeHtml(msg) + '</span>';
  var box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { el.classList.add('show'); });
  });
  window.setTimeout(function () {
    el.classList.remove('show');
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 220);
  }, 3200);
}

/* ---------------- render: routing shell ---------------- */

function currentRoute() {
  var h = (window.location.hash || '').replace(/^#\/?/, '');
  if (h.indexOf('history') === 0) return 'history';
  if (h.indexOf('mango') === 0) return 'mango';
  if (h.indexOf('settings') === 0) return 'settings';
  return 'queue';
}

function applyRoute() {
  var r = currentRoute();
  ['queue', 'history', 'mango', 'settings'].forEach(function (v) {
    $('view-' + v).classList.toggle('active', v === r);
  });
  document.querySelectorAll('.nav-item').forEach(function (a) {
    a.classList.toggle('active', a.dataset.nav === r);
  });
  window.scrollTo(0, 0);
  renderAll();
}

function renderAll() {
  renderTopbar();
  renderQueue();
  renderHistory();
  renderMango();
  renderKpi();
  renderSidebar();
}

/* ---------------- render: topbar ---------------- */

function tbBtn(global, icoName, label, cls) {
  return '<button class="btn ' + (cls || '') + '" type="button" data-global="' + global + '">' +
    icon(icoName) + '<span>' + escapeHtml(label) + '</span></button>';
}

function renderTopbar() {
  var route = currentRoute();
  $('page-title').textContent = t('nav.' + route);

  var act = $('topbar-actions');
  var topbar = act.parentNode;
  if (route === 'queue') {
    var armedCancelAll = isArmed('cancel-all');
    var armedClearDone = isArmed('clear-done');
    topbar.classList.add('has-actions');
    act.innerHTML =
      tbBtn('pause-all', 'pause', t('top.pauseAll')) +
      tbBtn('resume-all', 'play', t('top.resumeAll')) +
      tbBtn('retry-failed', 'retry', t('top.retryFailed')) +
      tbBtn('cancel-all', 'cancel', armedCancelAll ? t('act.sureCancel') : t('top.cancelAll'), armedCancelAll ? 'btn-armed' : '') +
      tbBtn('clear-done', 'check', armedClearDone ? t('act.sureClear') : t('top.clearDone'), armedClearDone ? 'btn-armed' : '') +
      '<div class="topbar-sep"></div>' +
      tbBtn('add', 'plus', t('top.add'), 'btn-primary');
  } else {
    topbar.classList.remove('has-actions');
    act.innerHTML = '';
  }

  var sub = $('page-sub');
  if (state.netError) {
    sub.classList.add('net-err');
    sub.textContent = t('toast.netErr', { msg: state.netError });
    return;
  }
  sub.classList.remove('net-err');
  if (route === 'queue') {
    var n = visibleGroups().length;
    sub.textContent = t('sub.queue', { n: n, groups: tp('pl.groups', n), dl: state.stats.downloading });
  } else if (route === 'history') {
    var recs = state.stats.done + state.stats.canceled;
    sub.textContent = t('sub.history', { n: recs, records: tp('pl.records', recs) });
  } else if (route === 'mango') {
    sub.textContent = '';
  } else {
    sub.textContent = t('sub.settings');
  }
}

/* ---------------- render: mango ---------------- */

function mangoChapterLabel(chapter) {
  return chapter.title ? chapter.number + ' - ' + chapter.title : String(chapter.number);
}

function mgVolumeGroups(chapters) {
  var map = {};
  chapters.forEach(function (c) {
    var key = String(c.volume);
    if (!map[key]) map[key] = [];
    map[key].push(c);
  });
  return Object.keys(map)
    .sort(function (a, b) { return (parseFloat(a) || 0) - (parseFloat(b) || 0); })
    .map(function (v) { return { volume: v, chapters: map[v] }; });
}

function mgApplyIndeterminate(root) {
  root.querySelectorAll('[data-indeterminate="1"]').forEach(function (el) {
    el.indeterminate = true;
  });
}

function mgChapterPill(chapter) {
  if (chapter.external) {
    return '<span class="mg-pill mg-pill-canceled">' + escapeHtml(t('mango.external')) + '</span>';
  }
  if (chapter.unavailable) {
    return '<span class="mg-pill mg-pill-error">' + escapeHtml(t('mango.unavailable')) + '</span>';
  }
  if (chapter.pending) {
    return '<span class="mg-pill mg-pill-queued">' + escapeHtml(t('status.queued')) + '</span>';
  }
  if (chapter.downloaded) {
    return '<span class="mg-pill mg-pill-done">' + escapeHtml(t('mango.downloaded')) + '</span>';
  }
  return '<span class="mg-pill mg-pill-new">' + escapeHtml(t('mango.new')) + '</span>';
}

var MG_JOB_PILL = {
  running: ['mg-pill-downloading', 'status.downloading'],
  paused: ['mg-pill-paused', 'status.paused'],
  done: ['mg-pill-done', 'status.done'],
  canceled: ['mg-pill-canceled', 'status.canceled'],
  error: ['mg-pill-error', 'status.error']
};

var MG_CHAPTER_PILL = {
  queued: ['mg-pill-queued', 'status.queued'],
  downloading: ['mg-pill-downloading', 'status.downloading'],
  done: ['mg-pill-done', 'status.done'],
  skipped: ['mg-pill-done', 'mango.downloaded'],
  failed: ['mg-pill-error', 'status.error'],
  canceled: ['mg-pill-canceled', 'status.canceled'],
  deleted: ['mg-pill-canceled', 'mango.deleted']
};

function mgPill(map, key) {
  var m = map[key] || map.queued || map.running;
  return '<span class="mg-pill ' + m[0] + '">' + escapeHtml(t(m[1])) + '</span>';
}

function mgSelectionRow(chapter) {
  var disabled = chapter.pending || chapter.external || chapter.unavailable;
  var title = mangoChapterLabel(chapter);
  if (chapter.group) title += ' · ' + chapter.group;
  return '<div class="mg-ch-row">' +
    '<input type="checkbox" data-chapter="' + escapeHtml(chapter.id) + '"' +
      (state.mango.selection[chapter.id] ? ' checked' : '') +
      (disabled ? ' disabled' : '') + '>' +
    '<span class="mg-ch-name" title="' + escapeHtml(title) + '">' +
      escapeHtml(mangoChapterLabel(chapter)) + '</span>' +
    '<span class="mg-ch-status">' + mgChapterPill(chapter) + '</span>' +
    '</div>';
}

function mgJobRow(chapter) {
  var progress = '';
  if (chapter.status === 'downloading' && chapter.pagesTotal) {
    var pct = Math.round((chapter.pagesDone / chapter.pagesTotal) * 100);
    progress = '<span class="mg-q-prog">' +
      '<span class="mg-mini-prog"><span class="mg-mini-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="mg-mini-pct">' + pct + '%</span>' +
      '</span>';
  }
  return '<div class="mg-ch-row mg-q-row">' +
    '<span class="mg-ch-name" title="' + escapeHtml(chapter.label) + '">' +
      escapeHtml(chapter.label) + '</span>' +
    progress +
    '<span class="mg-ch-status">' + mgPill(MG_CHAPTER_PILL, chapter.status) + '</span>' +
    '</div>';
}

// Сворачиваемые тома; scope разделяет выбор, задания и историю.
// Тома по умолчанию свёрнуты (expanded[key] === true — раскрыт).
function mgVolumesHtml(scope, chapters, selectable, rowFn, deleteSeriesKey) {
  var html = '';
  mgVolumeGroups(chapters).forEach(function (group) {
    var key = scope + ':' + group.volume;
    var collapsed = state.mango.expanded[key] !== true;
    html += '<div class="mg-vol' + (collapsed ? ' mg-collapsed' : '') + '">';
    html += '<div class="mg-vol-head" data-vol-toggle="' + escapeHtml(key) + '">' +
      '<span class="mg-vol-chev" aria-hidden="true"></span>';
    if (selectable) {
      var selected = group.chapters.filter(function (c) {
        return state.mango.selection[c.id];
      }).length;
      html += '<input type="checkbox" class="mg-vol-cb" data-vol-check="' + escapeHtml(key) + '"' +
        (selected === group.chapters.length ? ' checked' : '') +
        (selected > 0 && selected < group.chapters.length ? ' data-indeterminate="1"' : '') +
        ' aria-label="' + escapeHtml(t('mango.volumeName', { n: group.volume })) + '">';
    }
    html += '<span class="mg-vol-name">' + escapeHtml(t('mango.volumeName', { n: group.volume })) + '</span>';
    if (selectable || deleteSeriesKey) {
      html += '<span class="mg-vol-actions">';
      if (selectable) {
        html += '<button type="button" class="mg-vol-btn" data-vol-all="' + escapeHtml(key) + '">' +
          escapeHtml(t('mango.all')) + '</button>' +
          '<button type="button" class="mg-vol-btn" data-vol-none="' + escapeHtml(key) + '">' +
          escapeHtml(t('mango.none')) + '</button>';
      }
      if (deleteSeriesKey) {
        var delKey = 'mg-vol-del:' + deleteSeriesKey + ':' + group.volume;
        var delArmed = isArmed(delKey);
        html += '<button type="button" class="mg-vol-btn mg-vol-btn-danger' +
          (delArmed ? ' mg-vol-btn-armed' : '') + '" data-del-vol="' + escapeHtml(group.volume) +
          '" data-del-series="' + escapeHtml(deleteSeriesKey) + '">' +
          escapeHtml(delArmed ? t('act.sureDelete') : t('act.delete')) + '</button>';
      }
      html += '</span>';
    }
    html += '<span class="mg-vol-count">' + group.chapters.length + ' ' +
        escapeHtml(tp('pl.chapters', group.chapters.length)) + '</span>' +
      '</div><div class="mg-vol-rows">';
    group.chapters.forEach(function (chapter) { html += rowFn(chapter); });
    html += '</div></div>';
  });
  return html;
}

function mgJobHtml(job) {
  var title = job.year ? job.title + ' [' + job.year + ']' : job.title;
  var finished = job.done + job.skipped;
  var pct = job.total ? Math.round((finished / job.total) * 100) : 0;
  var stateClass = job.status === 'running' || job.status === 'paused'
    ? 'mg-prog-state-' + job.status
    : 'mg-prog-state-' + job.status;
  var armedCancel = isArmed('mg-cancel:' + job.seriesKey);
  var armedDelete = isArmed('mg-delete:' + job.seriesKey);

  var metaParts = [];
  if (job.sourceLabel) metaParts.push(job.sourceLabel);
  if (job.language) metaParts.push(String(job.language).toUpperCase());
  metaParts.push(t('mango.folder', { dir: job.dir }));

  var actions = '';
  if (job.status === 'running') {
    actions += '<button class="mg-act-btn" type="button" data-pause-series="' +
      escapeHtml(job.seriesKey) + '">' + escapeHtml(t('act.pause')) + '</button>';
  } else if (job.status === 'paused') {
    actions += '<button class="mg-act-btn" type="button" data-resume-series="' +
      escapeHtml(job.seriesKey) + '">' + escapeHtml(t('act.resume')) + '</button>';
  }
  if (job.status === 'running' || job.status === 'paused') {
    actions += '<button class="mg-act-btn mg-act-danger' + (armedCancel ? ' mg-act-armed' : '') +
      '" type="button" data-cancel-series="' + escapeHtml(job.seriesKey) + '">' +
      escapeHtml(armedCancel ? t('act.sureCancel') : t('mango.cancelSeries')) + '</button>';
  }
  actions += '<button class="mg-act-btn mg-act-danger' + (armedDelete ? ' mg-act-armed' : '') +
    '" type="button" data-delete-series="' + escapeHtml(job.seriesKey) + '">' +
    escapeHtml(armedDelete ? t('act.sureDelete') : t('act.delete')) + '</button>';

  var html = '<article class="mg-card mg-group">' +
    '<div class="mg-group-head">' +
      '<div class="mg-group-id">' +
        '<div class="mg-group-title">' +
          '<span class="mg-group-name">' + escapeHtml(title) + '</span>' +
          mgPill(MG_JOB_PILL, job.status) +
        '</div>' +
        '<div class="mg-group-meta">' + escapeHtml(metaParts.join(' · ')) + '</div>' +
      '</div>' +
      '<div class="mg-group-prog ' + stateClass + '">' +
        '<div class="mg-prog-top">' +
          '<span class="mg-prog-pct">' + pct + '%</span>' +
          '<span class="mg-prog-right">' + escapeHtml(t('mango.jobLine', {
            done: finished, total: job.total, failed: job.failed.length
          })) + '</span>' +
        '</div>' +
        '<div class="mg-prog-bar"><span class="mg-prog-fill" style="width:' + pct + '%"></span></div>' +
      '</div>' +
      '<div class="mg-group-actions">' + actions + '</div>' +
    '</div>';

  var chapters = job.chapters ||
    (state.mango.details[job.id] && state.mango.details[job.id].chapters) || [];
  if (chapters.length) {
    var allKey = 'job' + job.id + ':all';
    var allCollapsed = !!state.mango.collapsed[allKey];
    var canDelete = job.status !== 'running' && job.status !== 'paused';
    html += '<div class="mg-volumes-wrap">' +
      '<button class="mg-files-toggle' + (allCollapsed ? ' mg-collapsed' : '') +
        '" type="button" data-job-all="' + escapeHtml(allKey) + '" aria-expanded="' +
        String(!allCollapsed) + '">' +
        escapeHtml(t('mango.volumesTitle', {
          n: chapters.length,
          chapters: tp('pl.chapters', chapters.length)
        })) +
      '</button>' +
      '<div class="mg-vol-scroll"' + (allCollapsed ? ' hidden' : '') + '>' +
        mgVolumesHtml('job' + job.id, chapters, false, mgJobRow, canDelete ? job.seriesKey : null) +
      '</div></div>';
  }
  return html + '</article>';
}

function mgLanguageName(code) {
  var ui = state.lang === 'ru' ? 'ru' : 'en';
  try {
    var names = new Intl.DisplayNames([ui], { type: 'language' });
    return names.of(String(code)) || String(code);
  } catch (e) {
    return String(code);
  }
}

// Языковые чипы MangaDex. Набор языков приходит с сервера
// (availableTranslatedLanguages), поэтому ru/en здесь не зашиты.
function mgRenderLanguages() {
  var box = $('mango-langs');
  if (!box) return;
  var series = state.mango.series;
  var langs = (series && Array.isArray(series.languages)) ? series.languages : [];
  if (!series || series.source !== 'mangadex' || !langs.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  box.hidden = false;
  var html = '<span class="mg-langs-label">' + escapeHtml(t('mango.language')) + '</span>' +
    '<span class="mg-langs-list">';
  langs.forEach(function (code) {
    var active = code === series.language;
    html += '<button type="button" class="mg-lang-chip' + (active ? ' is-active' : '') + '"' +
      ' data-lang="' + escapeHtml(code) + '"' +
      ' title="' + escapeHtml(mgLanguageName(code)) + '"' +
      ' aria-pressed="' + (active ? 'true' : 'false') + '"' +
      (state.mango.langBusy ? ' disabled' : '') + '>' +
      escapeHtml(String(code).toUpperCase()) + '</button>';
  });
  html += '</span>';
  box.innerHTML = html;
}

function renderMango() {
  var m = state.mango;
  var seriesBox = $('mango-series');
  if (!seriesBox) return;

  var jobs = m.jobs || [];
  var running = jobs.filter(function (job) { return job.status === 'running'; });
  var paused = jobs.filter(function (job) { return job.status === 'paused'; });

  // KPI: скачивается / в очереди / готово (из истории).
  var active = running[0] || paused[0] || null;
  $('mg-kpi-down-v').textContent = String(running.length);
  if (active && active.current) {
    var pagePct = active.current.pagesTotal
      ? Math.round((active.current.pagesDone / active.current.pagesTotal) * 100)
      : 0;
    $('mg-kpi-down-s').textContent = active.title + ' · ' + active.current.label +
      (active.current.pagesTotal ? ' — ' + pagePct + '%' : '');
  } else {
    $('mg-kpi-down-s').textContent = '—';
  }

  var queued = 0;
  var nextLabel = '';
  running.concat(paused).forEach(function (job) {
    queued += Math.max(0, job.total - job.done - job.skipped - job.failed.length);
    if (!nextLabel && job.chapters) {
      var next = job.chapters.filter(function (c) { return c.status === 'queued'; })[0];
      if (next) nextLabel = next.label;
    }
  });
  $('mg-kpi-queued-v').textContent = String(queued);
  $('mg-kpi-queued-s').textContent = nextLabel
    ? t('mango.next', { label: nextLabel })
    : '—';

  $('mg-kpi-done-v').textContent = String((m.stats && m.stats.chapters) || 0);
  $('mg-kpi-done-s').textContent = t('mango.inHistory');

  // Карточка выбора.
  if (m.series) {
    seriesBox.hidden = false;
    $('mango-series-title').textContent = m.series.year
      ? m.series.title + ' [' + m.series.year + ']'
      : m.series.title;
    var downloaded = m.series.chapters.filter(function (c) { return c.downloaded; }).length;
    var metaParts = [];
    if (m.series.sourceLabel) metaParts.push(m.series.sourceLabel);
    metaParts.push(t('mango.chapters', {
      n: m.series.chapters.length,
      d: downloaded
    }));
    $('mango-series-meta').textContent = metaParts.join(' · ');
    mgRenderLanguages();

    var selected = m.series.chapters.filter(function (c) {
      return m.selection[c.id];
    }).length;
    var countText = t('mango.selectedCount', {
      n: selected,
      chapters: tp('pl.chapters', selected)
    });
    $('mango-sel-count').textContent = countText;
    $('mango-sel-count-foot').textContent = countText;
    $('mango-download').textContent = t('mango.downloadN', {
      n: selected,
      chapters: tp('pl.chapters', selected)
    });
    $('mango-download').disabled = selected === 0;
    $('mango-vol-title').textContent = t('mango.volumesTitle', {
      n: m.series.chapters.length,
      chapters: tp('pl.chapters', m.series.chapters.length)
    });

    // Список перерисовываем только когда он реально изменился: иначе
    // чекбокс пересоздаётся под курсором на каждом секундном опросе.
    var key = m.series.url + '|' + (m.series.source || '') + '|' + (m.series.language || '') +
      '|' + m.series.chapters.map(function (c) {
        return c.id + (c.downloaded ? '1' : '0') + (m.selection[c.id] ? 's' : '') +
          (c.external ? 'e' : '') + (c.unavailable ? 'u' : '') + (c.pending ? 'p' : '');
      }).join(',');
    var list = $('mango-chapters');
    if (list.dataset.key !== key) {
      list.dataset.key = key;
      list.innerHTML = mgVolumesHtml(
        'sel',
        m.series.chapters,
        true,
        mgSelectionRow,
        m.series.seriesKey,
      ) || '<div class="mg-empty">' + escapeHtml(t('mango.emptyList')) + '</div>';
      mgApplyIndeterminate(list);
    }

    var collapsedAll = !!m.collapsed['sel:all'];
    $('mango-vol-toggle').classList.toggle('mg-collapsed', collapsedAll);
    $('mango-vol-toggle').setAttribute('aria-expanded', String(!collapsedAll));
    list.hidden = collapsedAll;
  } else {
    seriesBox.hidden = true;
    mgRenderLanguages();
  }

  // Карточки заданий (по одной на тайтл-задание).
  $('mango-jobs').innerHTML = jobs.map(mgJobHtml).join('');
  $('mango-empty').hidden = !!m.series || jobs.length > 0;
}

/* ---------------- mango: действия ---------------- */

async function refreshMangoJobs() {
  try {
    var data = await api('/api/mango/jobs');
    state.mango.jobs = data.jobs || [];
    state.mango.stats = data.stats || { chapters: 0 };
    ensureMangoDetails(state.mango.jobs);
    renderMango();
  } catch (e) { /* сетевую ошибку покажет основной опрос */ }
}

// Завершённые задания не таскают главы в секундном опросе — догружаем
// полный список один раз и запоминаем, чтобы карточка оставалась раскрытой.
function ensureMangoDetails(jobs) {
  jobs.forEach(function (job) {
    if (job.chapters && job.chapters.length) {
      state.mango.details[job.id] = { chapters: job.chapters, status: job.status };
      return;
    }
    var cached = state.mango.details[job.id];
    if (cached && cached.status === job.status) return;
    if (state.mango.detailsPending[job.id]) return;
    state.mango.detailsPending[job.id] = true;
    api('/api/mango/jobs/' + job.id)
      .then(function (data) {
        state.mango.details[job.id] = {
          chapters: (data.job && data.job.chapters) || [],
          status: job.status
        };
        renderMango();
      })
      .catch(function () { /* карточка останется без глав */ })
      .finally(function () {
        delete state.mango.detailsPending[job.id];
      });
  });
}

async function refreshMangoHistory(force) {
  var now = Date.now();
  if (!force && now - state.mangoHistoryAt < 3000) return;
  state.mangoHistoryAt = now;
  try {
    var data = await api('/api/mango/history?limit=1000');
    state.mangoHistory = data.chapters || [];
    if (state.historyMode === 'mango') renderMangoHistory();
  } catch (e) { /* историю обновим при следующем заходе */ }
}

async function deleteMangoVolume(seriesKey, volume) {
  try {
    await api(
      '/api/mango/series/' + encodeURIComponent(seriesKey) +
        '/volume/' + encodeURIComponent(volume) + '/delete',
      { method: 'POST' },
    );
    toast(t('toast.mangoVolumeDeleted', { n: volume }), 'success');
    // После удаления томов меняются статусы глав в завершённых карточках.
    state.mango.details = {};
    state.mango.detailsPending = {};
    await refreshMangoJobs();
    await refreshMangoHistory(true);
    if (state.mango.series) await refreshMangoSeries();
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
}

async function refreshMangoSeries() {
  if (!state.mango.series) return;
  try {
    var data = await api('/api/mango/resolve', {
      method: 'POST',
      body: JSON.stringify({
        url: state.mango.series.url,
        language: state.mango.series.language,
      }),
    });
    if (data.active) {
      state.mango.series = null;
      state.mango.selection = {};
    } else {
      var keep = {};
      data.chapters.forEach(function (c) {
        if (!c.downloaded && !c.pending && !c.external && !c.unavailable &&
            state.mango.selection[c.id]) keep[c.id] = true;
      });
      state.mango.series = data;
      state.mango.selection = keep;
    }
    $('mango-chapters').dataset.key = '';
    renderMango();
  } catch (e) { /* тихо: карточка останется прежней */ }
}

function mangoSelectionIds() {
  return Object.keys(state.mango.selection).filter(function (id) {
    return state.mango.selection[id];
  });
}

function mgRerenderSelection() {
  $('mango-chapters').dataset.key = '';
  renderMango();
}

function setMangoSelection(predicate) {
  var series = state.mango.series;
  if (!series) return;
  state.mango.selection = {};
  series.chapters.forEach(function (c) {
    if (!c.pending && !c.external && !c.unavailable && predicate(c)) {
      state.mango.selection[c.id] = true;
    }
  });
  mgRerenderSelection();
}

function clearMangoSelectionCard() {
  state.mango.series = null;
  state.mango.selection = {};
  $('mango-chapters').dataset.key = '';
  renderMango();
}

async function onMangoResolve(e) {
  if (e) e.preventDefault();
  var url = $('mango-url').value.trim();
  if (!url) return;
  var button = $('mango-resolve');
  button.disabled = true;
  button.textContent = t('mango.loading');
  try {
    var data = await api('/api/mango/resolve', {
      method: 'POST',
      body: JSON.stringify({ url: url })
    });
    state.mango.series = data;
    state.mango.selection = {};
    if (data.active) {
      // Уже качается: не даём добавить второй раз, карточку не открываем.
      state.mango.series = null;
      toast(t('mango.alreadyActive'), 'error');
      $('mango-url').value = '';
      $('mango-chapters').dataset.key = '';
      renderMango();
      return;
    }
    data.chapters.forEach(function (c) {
      if (!c.downloaded && !c.pending && !c.external && !c.unavailable) {
        state.mango.selection[c.id] = true;
      }
    });
    $('mango-url').value = '';
    $('mango-chapters').dataset.key = '';
    renderMango();
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  } finally {
    button.disabled = false;
    button.textContent = t('mango.add');
  }
}

async function onMangoLanguage(code) {
  var series = state.mango.series;
  if (!series || !code || code === series.language || state.mango.langBusy) return;
  state.mango.langBusy = true;
  renderMango();
  try {
    var data = await api('/api/mango/resolve', {
      method: 'POST',
      body: JSON.stringify({ url: series.url, language: code }),
    });
    if (data.active) {
      state.mango.series = null;
      state.mango.selection = {};
      toast(t('mango.alreadyActive'), 'error');
    } else {
      state.mango.series = data;
      state.mango.selection = {};
      data.chapters.forEach(function (c) {
        if (!c.downloaded && !c.pending && !c.external && !c.unavailable) {
          state.mango.selection[c.id] = true;
        }
      });
    }
    $('mango-chapters').dataset.key = '';
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  } finally {
    state.mango.langBusy = false;
    renderMango();
  }
}

async function onMangoDownload() {
  var series = state.mango.series;
  if (!series) return;
  var ids = mangoSelectionIds();
  if (!ids.length) {
    toast(t('toast.mangoEmpty'), 'error');
    return;
  }
  try {
    var result = await api('/api/mango/download', {
      method: 'POST',
      body: JSON.stringify({
        url: series.url,
        chapters: ids,
        language: series.language,
      })
    });
    if (result.job) {
      toast(t('toast.mangoStarted', {
        n: result.job.total,
        chapters: tp('pl.chapters', result.job.total)
      }), 'success');
      // Поставили в очередь — карточка выбора больше не нужна.
      clearMangoSelectionCard();
    } else {
      toast(t('toast.mangoAll'), 'info');
    }
    await refreshMangoJobs();
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
}

async function onMangoCancelSeries(seriesKey) {
  try {
    var result = await api('/api/mango/series/' + encodeURIComponent(seriesKey) + '/cancel', {
      method: 'POST'
    });
    if (result.canceled) toast(t('toast.mangoCanceled'), 'success');
    await refreshMangoJobs();
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
}

async function onMangoSeriesAction(seriesKey, action) {
  try {
    var result = await api('/api/mango/series/' + encodeURIComponent(seriesKey) + '/' + action, {
      method: 'POST'
    });
    if (action === 'pause' && result.paused) toast(t('toast.mangoPaused'), 'info');
    if (action === 'resume' && result.resumed) toast(t('toast.mangoResumed'), 'success');
    if (action === 'delete') {
      toast(t('toast.mangoDeleted', { n: result.deleted || 0 }), 'success');
    }
    await refreshMangoJobs();
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
}

function mgVolumeChapters(volumeKey) {
  var series = state.mango.series;
  if (!series) return [];
  var volume = volumeKey.split(':').slice(1).join(':');
  return series.chapters.filter(function (c) { return String(c.volume) === volume; });
}

function mgSelectVolume(volumeKey, select) {
  mgVolumeChapters(volumeKey).forEach(function (c) {
    if (select && !c.pending && !c.external && !c.unavailable) {
      state.mango.selection[c.id] = true;
    } else if (!select) {
      delete state.mango.selection[c.id];
    }
  });
  mgRerenderSelection();
}

/* ---------------- render: sidebar widget ---------------- */

function renderSidebar() {
  var srv = state.server;
  if (!srv) return;
  var free = srv.freeSpace, total = srv.totalSpace;
  var need = srv.needBytes || 0;
  var short = srv.spaceEnough === false;

  // Место — по папке, куда файлы реально пишутся (медиатека, если настроена);
  // «нужно» — сколько ещё понадобится всей незаконченной очереди.
  var freeText = free != null ? t('server.free', { v: formatBytes(free) }) : '—';
  if (need > 0) freeText += ' · ' + t('server.need', { v: formatBytes(need) });
  $('sw-free').textContent = freeText;
  $('sw-free').classList.toggle('bad', short);
  $('sw-free').title = t('server.needHint', { v: formatBytes(srv.placeholderBytes || 0) });

  if (free != null && total) {
    var usedPct = Math.min(100, Math.max(0, (total - free) / total * 100));
    $('sw-bar-fill').style.width = usedPct.toFixed(2) + '%';
    $('sw-bar-fill').classList.toggle('bad', short);
    $('sw-total').textContent = t('server.total', { total: formatBytes(total), used: formatBytes(total - free) });
  } else {
    $('sw-bar-fill').style.width = '0%';
    $('sw-bar-fill').classList.remove('bad');
    $('sw-total').textContent = '—';
  }
  $('sw-folder').textContent = srv.saveDir || srv.downloadDir || '—';
  $('sw-meta').textContent = t('server.meta', {
    version: srv.version,
    ffmpeg: srv.ffmpeg ? t('server.ffmpegYes') : t('server.ffmpegNo')
  });
  $('sw-dot').classList.toggle('bad', !srv.ffmpeg);
}

/* ---------------- render: KPI ---------------- */

function renderKpi() {
  var st = state.stats;
  var maxSlots = state.settings ? clampInt(state.settings.max_concurrent, 1, 16, 2) : 2;

  $('kpi-downloading').textContent = String(st.downloading);
  $('kpi-downloading-sub').textContent = t('kpi.slots', { dl: st.downloading, max: maxSlots });

  $('kpi-queued').textContent = String(st.queued);
  var qsub;
  if (st.error > 0 && st.paused > 0) qsub = t('kpi.pausedPart', { p: st.paused }) + ' · <span class="err-text">' + t('kpi.errPart', { e: st.error }) + '</span>';
  else if (st.error > 0) qsub = '<span class="err-text">' + t('kpi.errPart', { e: st.error }) + '</span>';
  else if (st.paused > 0) qsub = t('kpi.pausedPart', { p: st.paused });
  else qsub = t('kpi.waitSlot');
  $('kpi-queued-sub').innerHTML = qsub;

  $('kpi-done').textContent = String(st.done);
  $('kpi-done-sub').textContent = t('kpi.inHistory', { n: st.done + st.canceled });

  // «Осталось» и «нужно места» считает сервер (estimate.js) по всем
  // незаконченным задачам — включая те, что ещё ждут своей очереди.
  var srv = state.server || {};
  var need = srv.needBytes || 0;
  var unknown = srv.needUnknown || 0;
  $('kpi-left').textContent = (need > 0 || unknown > 0) ? '≈ ' + formatBytes(need) : '—';

  var subs = [];
  subs.push(srv.freeSpace != null ? t('kpi.freeOnServer', { v: formatBytes(srv.freeSpace) }) : '—');
  if (unknown > 0) subs.push(t('kpi.unknownSizes', { n: unknown }));
  var leftSub = subs.join(' · ');
  var subEl = $('kpi-left-sub');
  if (srv.spaceEnough === false) {
    subEl.classList.add('wrap'); // иначе «места может не хватить» режется многоточием
    subEl.innerHTML = '<span class="err-text">' + escapeHtml(leftSub + ' · ' + t('kpi.spaceWarn')) + '</span>';
  } else {
    subEl.classList.remove('wrap');
    subEl.innerHTML = escapeHtml(leftSub);
  }
}

/* ---------------- render: queue ---------------- */

function actBtn(icoName, action, label, cls) {
  return '<button class="act-btn ' + (cls || '') + '" type="button" data-action="' + action + '">' +
    icon(icoName) + '<span>' + escapeHtml(label) + '</span></button>';
}

function groupActions(g) {
  var files = visibleFiles(g);
  var hasActive = files.some(function (f) { return f.status === 'downloading' || f.status === 'queued'; });
  var hasPaused = files.some(function (f) { return f.status === 'paused'; });
  var hasFailed = files.some(function (f) { return f.status === 'error' || f.status === 'canceled'; });
  var aC = isArmed('g:' + g.key + ':cancel');
  var aD = isArmed('g:' + g.key + ':delete');
  var btns = [];
  if (hasActive) btns.push(actBtn('pause', 'pause', t('act.pause'), ''));
  if (hasPaused) btns.push(actBtn('play', 'resume', t('act.resume'), 'act-accent'));
  if (hasActive || hasPaused) {
    btns.push(actBtn('cancel', 'cancel', aC ? t('act.sureCancel') : t('act.cancel'), aC ? 'act-armed' : 'act-danger'));
  }
  if (hasFailed) btns.push(actBtn('retry', 'retry', t('act.retry'), 'act-accent'));
  btns.push(actBtn('trash', 'delete', aD ? t('act.sureDelete') : t('act.delete'), aD ? 'act-armed' : 'act-danger'));
  return btns.join('');
}

function renderTaskRow(task) {
  var pct = task.totalBytes > 0 ? Math.min(100, Math.round((task.receivedBytes || 0) / task.totalBytes * 100)) : 0;
  var name = taskDisplayName(task);
  var sizeText = task.totalBytes > 0
    ? formatBytes(task.receivedBytes) + ' / ' + formatBytes(task.totalBytes)
    : (task.receivedBytes > 0 ? formatBytes(task.receivedBytes) : '—');
  var speedText = (task.status === 'downloading' && task.speed > 0) ? formatSpeed(task.speed) : '—';

  var tooltipParts = [String(task.filename || task.url || '')];
  if (task.realWidth && task.realHeight) {
    tooltipParts.push(t('file.realResHint', { w: task.realWidth, h: task.realHeight }));
  }
  if (task.error) tooltipParts.push(task.error);
  if (looksExpired(task)) tooltipParts.push(t('file.expiredHint') + ' ' + sourceUrl(task));
  var tooltip = tooltipParts.join('\n');

  // Имя — ссылка на страницу-источник: по ней берут свежую ссылку, когда
  // прежняя протухла (сервер сам резолвить не может, у него нет сессии сайта).
  var src = sourceUrl(task);
  var nameHtml = src
    ? '<a class="file-name file-name-link" href="' + escapeHtml(src) + '" target="_blank" rel="noreferrer" title="' +
        escapeHtml(tooltip) + '">' + escapeHtml(name) + '</a>'
    : '<span class="file-name" title="' + escapeHtml(tooltip) + '">' + escapeHtml(name) + '</span>';

  return '<div class="file-row f-' + task.status + '">' +
    '<span class="file-ico">' + icon(task.fileType === 'subtitle' ? 'captions' : 'film') + '</span>' +
    nameHtml +
    '<span class="file-status"><span class="pill pill-' + task.status + '">' + escapeHtml(t('status.' + task.status)) + '</span></span>' +
    '<div class="file-prog prog-state-' + task.status + '">' +
      '<div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="fp-pct">' + pct + '%</span>' +
    '</div>' +
    '<span class="file-size">' + escapeHtml(sizeText) + '</span>' +
    '<span class="file-speed' + (speedText === '—' ? ' idle' : '') + '">' + escapeHtml(speedText) + '</span>' +
  '</div>';
}

/** Страница-источник группы (первая задача, у которой она есть). */
function groupSourceUrl(g) {
  for (var i = 0; i < g.items.length; i++) {
    var files = g.items[i].files || [];
    for (var j = 0; j < files.length; j++) {
      var src = sourceUrl(files[j]);
      if (src) return src;
    }
  }
  return null;
}

function renderGroup(g) {
  var files = visibleFiles(g);
  var st = groupStatusOf(files);
  var tot = groupTotals(files);
  var collapsed = !!state.collapsed[g.key];
  var isSeries = g.items.some(function (it) { return it.season || it.episode; });
  var kindLabel = t(isSeries ? 'kind.series' : 'kind.movie');

  var errTask = null;
  for (var i = 0; i < files.length; i++) {
    if (files[i].status === 'error' && files[i].error) { errTask = files[i]; break; }
  }
  var errStrip = errTask
    ? '<div class="group-error">' + icon('alert') + '<span>' + escapeHtml(errTask.error) + '</span>' +
      (looksExpired(errTask)
        ? '<span class="group-error-hint">' + escapeHtml(t('file.expiredHint')) + ' ' +
          sourceLink(errTask, t('file.sourcePage')) + '</span>'
        : '') +
      '</div>'
    : '';

  var speedHtml = st === 'downloading' && tot.speed > 0
    ? '<span class="prog-speed">' + formatSpeed(tot.speed) + '</span> · '
    : '';
  var sizeRight = tot.size > 0
    ? formatBytes(tot.received) + ' / ' + formatBytes(tot.size)
    : (tot.received > 0 ? formatBytes(tot.received) : '—');

  var rows = [];
  g.items.forEach(function (it) { it.files.forEach(function (f) { rows.push(renderTaskRow(f)); }); });

  // Название фильма тоже ведёт на страницу-источник (удобно переотправить
  // задачу, когда ссылки протухли, — см. подсказку в ошибке).
  var groupSrc = groupSourceUrl(g);
  var titleHtml = groupSrc
    ? '<a class="group-name" href="' + escapeHtml(groupSrc) + '" target="_blank" rel="noreferrer" title="' +
        escapeHtml(g.title) + '">' + escapeHtml(g.title) + '</a>'
    : '<span class="group-name" title="' + escapeHtml(g.title) + '">' + escapeHtml(g.title) + '</span>';

  var head =
    '<div class="group-head">' +
      '<div class="group-id">' +
        '<div class="group-title">' +
          titleHtml +
        '</div>' +
        '<div class="group-meta">' +
          '<span>' + escapeHtml(kindLabel) + '</span><span class="dot-sep">•</span>' +
          '<span>' + files.length + ' ' + tp('pl.files', files.length) + '</span><span class="dot-sep">•</span>' +
          '<span>' + (tot.size > 0 ? formatBytes(tot.size) : '—') + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="pill pill-' + st + '">' + escapeHtml(t('status.' + st)) + '</span>' +
      '<div class="group-prog prog-state-' + st + '">' +
        '<div class="prog-top">' +
          '<span class="prog-pct">' + (tot.size > 0 ? tot.pct + '%' : '—') + '</span>' +
          '<span class="prog-right">' + speedHtml + escapeHtml(sizeRight) + '</span>' +
        '</div>' +
        '<div class="prog-bar"><div class="prog-fill" style="width:' + tot.pct + '%"></div></div>' +
      '</div>' +
      '<div class="group-actions">' + groupActions(g) + '</div>' +
    '</div>';

  var filesHtml =
    '<div class="group-files-wrap">' +
      '<button class="files-toggle" type="button" data-action="toggle">' +
        icon('chevron') + '<span>' + escapeHtml(t('group.files', { n: files.length })) + '</span>' +
      '</button>' +
      '<div class="group-files">' + rows.join('') + '</div>' +
    '</div>';

  return '<div class="card group' + (collapsed ? ' collapsed' : '') + '" data-group="' + escapeHtml(g.key) + '">' +
    head + errStrip + filesHtml + '</div>';
}

function renderQueue() {
  var list = $('queue-list');
  var empty = $('queue-empty');
  var groups = visibleGroups();
  if (!groups.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = groups.map(renderGroup).join('');
}

/* ---------------- render: history ---------------- */

var HISTORY_RENDER_LIMIT = 500;

function historyRows() {
  var q = state.historySearch.trim().toLowerCase();
  var filter = state.historyFilter;
  var rows = state.tasks.filter(function (task) {
    if (FINISHED_STATUSES.indexOf(task.status) === -1) return false;
    if (filter !== 'all' && task.status !== filter) return false;
    if (!q) return true;
    var haystack = [task.filename, task.title, task.origTitle].filter(Boolean).join(' ').toLowerCase();
    return haystack.indexOf(q) !== -1;
  });
  rows.sort(function (a, b) {
    return (b.finishedAt || b.createdAt || b.id) - (a.finishedAt || a.createdAt || a.id);
  });
  return rows;
}

/* ---------------- render: mango history ---------------- */

function mgHistoryGroups(rows) {
  var groups = {};
  rows.forEach(function (row) {
    var key = row.series_key;
    if (!groups[key]) {
      groups[key] = { key: key, title: row.series_title, year: row.year, chapters: [] };
    }
    groups[key].chapters.push(row);
  });
  return Object.keys(groups).map(function (key) { return groups[key]; });
}

function mgHistoryRow(entry) {
  return '<div class="mg-ch-row mg-q-row">' +
    '<span class="mg-ch-name" title="' + escapeHtml(entry.label) + '">' +
      escapeHtml(entry.label) + '</span>' +
    '<span class="mg-h-date">' + escapeHtml(formatDate(entry.created_at)) + '</span>' +
    '<span class="mg-ch-status"><span class="mg-pill mg-pill-done">' +
      escapeHtml(t('status.done')) + '</span></span>' +
    '</div>';
}

function renderMangoHistory() {
  var box = $('mango-history');
  var empty = $('mango-history-empty');
  if (!box) return;
  var groups = mgHistoryGroups(state.mangoHistory);
  empty.hidden = groups.length > 0;

  box.innerHTML = groups.map(function (group) {
    var chapters = group.chapters.slice().sort(function (a, b) {
      return (parseFloat(a.volume) || 0) - (parseFloat(b.volume) || 0) ||
        (parseFloat(a.number) || 0) - (parseFloat(b.number) || 0);
    });
    var last = chapters.reduce(function (max, c) {
      return Math.max(max, c.created_at || 0);
    }, 0);
    var title = group.title
      ? (group.year ? group.title + ' [' + group.year + ']' : group.title)
      : group.key;
    var entries = chapters.map(function (c) {
      var lang = c.language && String(c.language).toLowerCase() !== 'ru'
        ? ' [' + c.language + ']'
        : '';
      return {
        id: String(c.chapter_id),
        label: c.number + lang + (c.title ? ' - ' + c.title : ''),
        volume: c.volume,
        number: c.number,
        title: c.title,
        language: c.language,
        status: 'done',
        created_at: c.created_at,
      };
    });
    return '<article class="mg-card mg-group">' +
      '<div class="mg-group-head">' +
        '<div class="mg-group-id">' +
          '<div class="mg-group-title"><span class="mg-group-name">' +
            escapeHtml(title) + '</span></div>' +
          '<div class="mg-group-meta">' + chapters.length + ' ' +
            escapeHtml(tp('pl.chapters', chapters.length)) + ' · ' +
            escapeHtml(formatDate(last)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="mg-volumes-wrap"><div class="mg-vol-scroll">' +
        mgVolumesHtml('hist' + group.key, entries, false, mgHistoryRow, group.key) +
      '</div></div>' +
    '</article>';
  }).join('');
}

function renderHistory() {
  var mangoMode = state.historyMode === 'mango';
  $('history-files').hidden = mangoMode;
  $('history-mango').hidden = !mangoMode;
  document.querySelectorAll('#history-mode .seg-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-hmode') === state.historyMode);
  });
  if (mangoMode) {
    renderMangoHistory();
    return;
  }

  var rows = historyRows();
  var shown = rows.slice(0, HISTORY_RENDER_LIMIT);
  var tb = $('history-tbody');
  if (!rows.length) {
    var msg = state.historySearch.trim()
      ? t('history.notFound', { q: state.historySearch.trim() })
      : t('history.empty');
    tb.innerHTML = '<tr><td colspan="5" class="td-empty">' + escapeHtml(msg) + '</td></tr>';
  } else {
    var html = shown.map(function (task) {
      var name = tailOf(task.filename || task.url);
      var full = String(task.filename || task.url || '');
      var isSub = task.fileType === 'subtitle';
      var armedDel = isArmed('h:' + task.id + ':delete');
      var size = task.totalBytes > 0 ? task.totalBytes : (task.receivedBytes > 0 ? task.receivedBytes : null);
      var src = sourceUrl(task);
      var nameHtml = src
        ? '<a class="cf-name cf-name-link" href="' + escapeHtml(src) + '" target="_blank" rel="noreferrer" title="' +
            escapeHtml(full) + '">' + escapeHtml(name) + '</a>'
        : '<div class="cf-name" title="' + escapeHtml(full) + '">' + escapeHtml(name) + '</div>';
      return '<tr data-rec="' + task.id + '">' +
        '<td><div class="cell-file">' +
          '<span class="file-ico">' + icon(isSub ? 'captions' : 'film') + '</span>' +
          '<div class="cf-text">' +
            nameHtml +
            (!isSub && task.quality ? '<div class="cf-note">' + escapeHtml(qualityWithReal(task)) + '</div>' : '') +
            (task.error ? '<div class="cf-err">' + icon('alert') + '<span>' + escapeHtml(task.error) + '</span></div>' : '') +
            expiredHintHtml(task) +
          '</div>' +
        '</div></td>' +
        '<td><span class="pill pill-' + task.status + '">' + escapeHtml(t('status.' + task.status)) + '</span></td>' +
        '<td class="td-num">' + (size ? formatBytes(size) : '—') + '</td>' +
        '<td class="td-date">' + formatDate(task.finishedAt) + '</td>' +
        '<td class="td-act">' +
          '<button class="act-btn act-accent" type="button" data-haction="retry">' + icon('retry') + '<span>' + escapeHtml(t('act.retry')) + '</span></button>' +
          '<button class="act-btn ' + (armedDel ? 'act-armed' : 'act-danger') + '" type="button" data-haction="delete">' +
            icon('trash') + '<span>' + escapeHtml(armedDel ? t('act.sureDelete') : t('history.deleteRec')) + '</span></button>' +
        '</td>' +
      '</tr>';
    }).join('');
    if (rows.length > shown.length) {
      html += '<tr><td colspan="5" class="td-empty">' + escapeHtml(t('history.shownFirst', { n: shown.length })) + '</td></tr>';
    }
    tb.innerHTML = html;
  }
  $('history-count').textContent = t('history.count', { shown: rows.length, total: state.stats.done + state.stats.canceled });
}

/* ---------------- actions ---------------- */

async function runTaskAction(ids, action) {
  for (var i = 0; i < ids.length; i++) {
    await api('/api/tasks/' + ids[i] + '/' + action, { method: 'POST' });
  }
}

async function groupAction(g, action) {
  var files = visibleFiles(g);
  var ids;
  if (action === 'pause') ids = files.filter(function (f) { return f.status === 'downloading' || f.status === 'queued'; }).map(function (f) { return f.id; });
  else if (action === 'resume') ids = files.filter(function (f) { return f.status === 'paused' || f.status === 'error'; }).map(function (f) { return f.id; });
  else if (action === 'cancel') ids = files.filter(function (f) { return ['downloading', 'queued', 'paused'].indexOf(f.status) !== -1; }).map(function (f) { return f.id; });
  else if (action === 'retry') ids = files.filter(function (f) { return f.status === 'error' || f.status === 'canceled'; }).map(function (f) { return f.id; });
  else if (action === 'delete') ids = files.map(function (f) { return f.id; });
  else return;

  if (!ids.length && action !== 'delete') {
    toast(t('toast.noMatching'), 'info');
    return;
  }

  try {
    if (action === 'delete') {
      /* только убираем записи из списка; файлы на диске остаются (без ?file=1) */
      for (var i = 0; i < ids.length; i++) {
        await api('/api/tasks/' + ids[i], { method: 'DELETE' });
      }
      toast(t('toast.groupDeleted', { title: g.title }), 'success');
    } else {
      await runTaskAction(ids, action);
      var n = ids.length;
      if (action === 'pause') toast(t('toast.groupPaused', { title: g.title }), 'success');
      else if (action === 'resume') toast(t('toast.groupResumed', { title: g.title }), 'success');
      else if (action === 'cancel') toast(t('toast.groupCanceled', { title: g.title, n: n, files: tp('pl.files', n) }), 'success');
      else if (action === 'retry') toast(t('toast.groupRetried', { title: g.title }), 'success');
    }
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function pauseAll() {
  try {
    var data = await api('/api/tasks/pause-all', { method: 'POST' });
    if (data.paused) toast(t('toast.pausedAll', { n: data.paused, tasks: tp('pl.tasks', data.paused) }), 'success');
    else toast(t('toast.noActive'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function cancelAll() {
  try {
    var data = await api('/api/tasks/cancel-all', { method: 'POST' });
    if (data.canceled) toast(t('toast.canceledAll', { n: data.canceled, tasks: tp('pl.tasks', data.canceled) }), 'success');
    else toast(t('toast.noActive'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

/* «Очистить завершённые»: убирает готовые/отменённые из списка очереди;
   записи остаются в Истории, файлы на диске не трогаются */
async function hideFinished() {
  try {
    var data = await api('/api/tasks/hide-finished', {
      method: 'POST',
      body: JSON.stringify({ statuses: ['done', 'canceled'] })
    });
    if (data.hidden) toast(t('toast.clearedQueue', { n: data.hidden, tasks: tp('pl.tasks', data.hidden) }), 'success');
    else toast(t('toast.noDoneGroups'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function resumeAll() {
  try {
    var data = await api('/api/tasks/resume-all', { method: 'POST' });
    if (data.resumed) toast(t('toast.resumedAll', { n: data.resumed, tasks: tp('pl.tasks', data.resumed) }), 'success');
    else toast(t('toast.noPaused'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function retryFailed() {
  try {
    var data = await api('/api/tasks/retry-failed', { method: 'POST' });
    if (data.retried) toast(t('toast.retriedFailed', { n: data.retried }), 'success');
    else toast(t('toast.noFailed'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

/* «Повторить» в истории: та же задача возвращается в очередь,
   дублей не создаётся; повторный клик по уже обработанной строке
   блокируется классом is-disabled до следующего рендера. */
async function retryHistoryRecord(task, btn) {
  if (btn) btn.classList.add('is-disabled');
  try {
    await api('/api/tasks/' + task.id + '/retry', { method: 'POST' });
    toast(t('toast.recRetried'), 'success');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function deleteHistoryRecord(task) {
  try {
    await api('/api/tasks/' + task.id, { method: 'DELETE' });
    toast(t('toast.recDeleted'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

/* ---------------- modal: добавить по ссылке ---------------- */

function openModal() {
  var o = $('modal-overlay');
  o.hidden = false;
  requestAnimationFrame(function () { o.classList.add('open'); });
  window.setTimeout(function () { $('f-url').focus(); }, 60);
}

function closeModal() {
  var o = $('modal-overlay');
  o.classList.remove('open');
  window.setTimeout(function () { o.hidden = true; }, 170);
  $('add-form').reset();
  var f = $('f-url').closest('.field');
  if (f) f.classList.remove('is-invalid');
}

async function onAddSubmit(e) {
  e.preventDefault();
  if (state.adding) return;
  var urlInput = $('f-url');
  var url = urlInput.value.trim();
  var field = urlInput.closest('.field');
  var errEl = $('f-url-error');
  if (!url) {
    errEl.textContent = t('modal.urlErr');
    field.classList.add('is-invalid');
    urlInput.focus();
    return;
  }
  field.classList.remove('is-invalid');

  var body = { url: url };
  var name = $('f-name').value.trim();
  var referer = $('f-referer').value.trim();
  if (name) body.filename = name;
  if (referer) body.referer = referer;

  state.adding = true;
  try {
    var res = await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    toast(t('toast.addedN', { n: res.created }), 'success');
    await refresh();
  } catch (err) {
    /* текст ошибки сервера показываем как есть (он приходит с сервера) */
    errEl.textContent = err.message;
    field.classList.add('is-invalid');
  } finally {
    state.adding = false;
  }
}

/* ---------------- polling ---------------- */

async function refresh() {
  try {
    var data = await api('/api/state?limit=1000');
    var wasError = state.netError;
    state.server = data.server;
    state.stats = data.stats;
    state.settings = data.settings;
    state.tasks = data.tasks;
    state.groups = groupTasks(data.tasks);
    updateSpeeds(data.tasks);
    state.netError = '';
    if (wasError) toast(t('toast.netOk'), 'success');
    if (!state.settingsDirty) fillSettingsForm();
    // Задания манги опрашиваем только когда они нужны: на вкладке
    // «Манга» или пока есть живое задание (прогресс идёт в фоне).
    if (currentRoute() === 'mango' || state.mango.jobs.some(function (job) {
      return job.status === 'running';
    })) {
      refreshMangoJobs();
    }
    if (currentRoute() === 'history' && state.historyMode === 'mango') {
      refreshMangoHistory();
    }
    renderAll();
  } catch (err) {
    if (!state.netError) toast(t('toast.netErr', { msg: err.message }), 'error');
    state.netError = err.message;
    renderTopbar();
  }
}

/* ---------------- events ---------------- */

function bindEvents() {
  window.addEventListener('hashchange', applyRoute);

  $('lang-switch').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang]');
    if (!b) return;
    setLang(b.getAttribute('data-lang'));
  });

  $('topbar-actions').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-global]');
    if (!btn) return;
    var a = btn.dataset.global;
    if (a === 'add') openModal();
    else if (a === 'pause-all') pauseAll();
    else if (a === 'resume-all') resumeAll();
    else if (a === 'retry-failed') retryFailed();
    else if (a === 'cancel-all' || a === 'clear-done') {
      if (isArmed(a)) {
        disarm(a);
        if (a === 'cancel-all') cancelAll();
        else hideFinished();
      } else {
        arm(a);
        renderTopbar();
      }
    }
  });

  $('queue-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var card = btn.closest('[data-group]');
    if (!card) return;
    var key = card.dataset.group;
    var g = null;
    for (var i = 0; i < state.groups.length; i++) {
      if (state.groups[i].key === key) { g = state.groups[i]; break; }
    }
    if (!g) return;
    var a = btn.dataset.action;

    if (a === 'toggle') {
      state.collapsed[g.key] = !state.collapsed[g.key];
      renderQueue();
      return;
    }
    if (a === 'cancel' || a === 'delete') {
      var armKey = 'g:' + g.key + ':' + a;
      if (isArmed(armKey)) {
        disarm(armKey);
        groupAction(g, a);
      } else {
        arm(armKey);
        renderQueue();
      }
      return;
    }
    if (a === 'pause' || a === 'resume' || a === 'retry') groupAction(g, a);
  });

  $('queue-empty-add').addEventListener('click', openModal);

  $('history-filter').addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    state.historyFilter = b.dataset.filter;
    $('history-filter').querySelectorAll('.seg-btn').forEach(function (x) {
      x.classList.toggle('active', x === b);
    });
    renderHistory();
  });

  $('history-search').addEventListener('input', function () {
    state.historySearch = $('history-search').value;
    renderHistory();
  });

  $('history-tbody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-haction]');
    if (!btn || btn.classList.contains('is-disabled')) return;
    var tr = btn.closest('tr[data-rec]');
    if (!tr) return;
    var id = Number(tr.dataset.rec);
    var task = null;
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) { task = state.tasks[i]; break; }
    }
    if (!task) return;
    if (btn.dataset.haction === 'retry') {
      retryHistoryRecord(task, btn);
    } else {
      var key = 'h:' + id + ':delete';
      if (isArmed(key)) {
        disarm(key);
        btn.classList.add('is-disabled');
        deleteHistoryRecord(task);
      } else {
        arm(key);
        renderHistory();
      }
    }
  });

  $('settings-form').addEventListener('submit', function (e) {
    e.preventDefault();
    saveSettings();
  });

  $('settings-form').addEventListener('input', function (e) {
    if (e.target.id === 'set-lang') return;
    state.settingsDirty = true;
  });

  $('settings-revert').addEventListener('click', function () {
    state.settingsDirty = false;
    fillSettingsForm();
    toast(t('toast.reverted'), 'info');
  });

  $('set-lang').addEventListener('change', function () {
    setLang($('set-lang').value);
  });

  TPL_FIELDS.forEach(function (fd) {
    var el = $(fd.input);
    if (!el) return;
    el.addEventListener('focus', function () { lastTplId = fd.input; });
    el.addEventListener('input', updateTplPreviews);
  });

  $('ph-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ph]');
    if (!b) return;
    insertPlaceholder(b.getAttribute('data-ph'));
  });

  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', function (e) {
    if (e.target === $('modal-overlay')) closeModal();
  });
  $('add-form').addEventListener('submit', onAddSubmit);

  $('mango-form').addEventListener('submit', onMangoResolve);
  $('mango-langs').addEventListener('click', function (e) {
    var chip = e.target.closest('[data-lang]');
    if (!chip) return;
    onMangoLanguage(chip.getAttribute('data-lang'));
  });
  $('mango-discard').addEventListener('click', clearMangoSelectionCard);
  $('mango-vol-toggle').addEventListener('click', function () {
    state.mango.collapsed['sel:all'] = !state.mango.collapsed['sel:all'];
    renderMango();
  });
  $('mango-chapters').addEventListener('change', function (e) {
    var volBox = e.target.closest('[data-vol-check]');
    if (volBox) {
      var volumeKey = volBox.getAttribute('data-vol-check');
      var inVolume = mgVolumeChapters(volumeKey);
      var allSelected = inVolume.length > 0 && inVolume.every(function (c) {
        return state.mango.selection[c.id];
      });
      mgSelectVolume(volumeKey, !allSelected);
      return;
    }
    var box = e.target.closest('[data-chapter]');
    if (!box) return;
    var id = box.getAttribute('data-chapter');
    if (box.checked) state.mango.selection[id] = true;
    else delete state.mango.selection[id];
    mgRerenderSelection();
  });

  function mgHandleVolumeDelete(e) {
    var btn = e.target.closest('[data-del-vol]');
    if (!btn) return false;
    var seriesKey = btn.getAttribute('data-del-series');
    var volume = btn.getAttribute('data-del-vol');
    var key = 'mg-vol-del:' + seriesKey + ':' + volume;
    if (isArmed(key)) {
      disarm(key);
      deleteMangoVolume(seriesKey, volume);
    } else {
      arm(key);
      $('mango-chapters').dataset.key = '';
      renderMango();
      if (state.historyMode === 'mango') renderMangoHistory();
    }
    return true;
  }

  function mgToggleVolume(e) {
    var head = e.target.closest('[data-vol-toggle]');
    if (!head || e.target.closest('input, button')) return;
    var key = head.getAttribute('data-vol-toggle');
    state.mango.expanded[key] = !state.mango.expanded[key];
    $('mango-chapters').dataset.key = '';
    renderMango();
    if (state.historyMode === 'mango') renderMangoHistory();
  }
  $('mango-chapters').addEventListener('click', function (e) {
    if (mgHandleVolumeDelete(e)) return;
    var volAll = e.target.closest('[data-vol-all]');
    if (volAll) {
      mgSelectVolume(volAll.getAttribute('data-vol-all'), true);
      return;
    }
    var volNone = e.target.closest('[data-vol-none]');
    if (volNone) {
      mgSelectVolume(volNone.getAttribute('data-vol-none'), false);
      return;
    }
    mgToggleVolume(e);
  });
  $('mango-jobs').addEventListener('click', function (e) {
    var jobAll = e.target.closest('[data-job-all]');
    if (jobAll) {
      var allKey = jobAll.getAttribute('data-job-all');
      state.mango.collapsed[allKey] = !state.mango.collapsed[allKey];
      renderMango();
      return;
    }
    var pause = e.target.closest('[data-pause-series]');
    if (pause) {
      onMangoSeriesAction(pause.getAttribute('data-pause-series'), 'pause');
      return;
    }
    var resume = e.target.closest('[data-resume-series]');
    if (resume) {
      onMangoSeriesAction(resume.getAttribute('data-resume-series'), 'resume');
      return;
    }
    var cancel = e.target.closest('[data-cancel-series]');
    if (cancel) {
      var key = cancel.getAttribute('data-cancel-series');
      if (isArmed('mg-cancel:' + key)) {
        disarm('mg-cancel:' + key);
        onMangoCancelSeries(key);
      } else {
        arm('mg-cancel:' + key);
        renderMango();
      }
      return;
    }
    var del = e.target.closest('[data-delete-series]');
    if (del) {
      var deleteKey = del.getAttribute('data-delete-series');
      if (isArmed('mg-delete:' + deleteKey)) {
        disarm('mg-delete:' + deleteKey);
        onMangoSeriesAction(deleteKey, 'delete');
      } else {
        arm('mg-delete:' + deleteKey);
        renderMango();
      }
      return;
    }
    if (mgHandleVolumeDelete(e)) return;
    mgToggleVolume(e);
  });
  $('mango-history').addEventListener('click', function (e) {
    if (mgHandleVolumeDelete(e)) return;
    mgToggleVolume(e);
  });
  $('history-mode').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-hmode]');
    if (!btn) return;
    state.historyMode = btn.getAttribute('data-hmode');
    if (state.historyMode === 'mango') refreshMangoHistory(true);
    renderHistory();
  });
  $('mango-select-all').addEventListener('click', function () {
    setMangoSelection(function () { return true; });
  });
  $('mango-select-new').addEventListener('click', function () {
    setMangoSelection(function (c) { return !c.downloaded; });
  });
  $('mango-select-none').addEventListener('click', function () {
    setMangoSelection(function () { return false; });
  });
  $('mango-download').addEventListener('click', onMangoDownload);
  $('f-url').addEventListener('input', function () {
    var f = $('f-url').closest('.field');
    if (f) f.classList.remove('is-invalid');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal-overlay').hidden) closeModal();
  });
}

/* ---------------- init ---------------- */

function init() {
  loadLang();
  bindEvents();
  applyI18n();
  applyRoute();
  refresh();
  window.setInterval(refresh, 1000);
}

init();
