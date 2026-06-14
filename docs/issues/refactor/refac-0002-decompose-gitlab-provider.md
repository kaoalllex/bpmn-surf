---
id: REFAC-0002
title: Декомпозировать gitlab-repo-provider.js по ответственностям
priority: medium
status: open
---

## Постановка

Разбить `gitlab-repo-provider.js` (564 строки — самый большой модуль проекта) по
ответственностям, снизив связанность и подготовив будущее удаление
DOM-эвристического пути (см. `[REFAC-0001]`).

Класс `GitLabRepoProvider` сейчас совмещает как минимум 4 роли + инфраструктуру:

1. **Парсинг URL/путей** — `init` (group/name/host из URL), `initChangeInfo`
   (iid и API-URL ручной нарезкой строк), `extractBranchCommitIdAndFilePath*`
   (commit id и путь файла регэкспами по `href`).
2. **DOM-скрейпинг** (привязан к разметке GitLab, самая хрупкая часть) —
   `findSelectedFilePath` (legacy + rapid diffs), `getChangeBranchNames`,
   `#findDiffHeadSha`, `#extractBranchCommitIdByDocSelectorCase1/2`,
   DOM-проверка в `#isMrMerged`.
3. **HTTP/API-вызовы** — `#getProjectId`, загрузка MR-инфо, `#getMrLastCommitId`,
   atom-фид коммитов master.
4. **Эвристический резолв target-коммита смерженного MR** — `getTargetCommitId`,
   `#isMrMerged`, `#findTargetBranchPreviousCommitId`,
   `#findTargetBranchCommitIdByTitle`, `#loadFilteredByTitleMasterCommitEntries`
   (+ `MasterCommitManager`).

Плюс: generic-утилита `SingleEntryCache` живёт прямо в этом файле, и в классе
дублируются 3–4 ad-hoc-кэша (init, MR-инфо, target-commit, filteredByTitle),
каждый со своей парой `#cache/#cacheKey`.

## Контекст

Прежняя формулировка REFAC-0002 («упростить/декомпозировать `main.js`, выделить
сервисы») **выполнена** коммитами «Refac 2»: `main.js` ужат до 9-строчной точки
входа, логика разъехалась по `app.js`, провайдерам (UI/API), differ'ам и
компараторам. Задача переформулирована на оставшийся крупнейший модуль.

Связь с `[REFAC-0001]` (done) определяет полезный разрез:

- `GitLabApiRepoProvider` (`gitlab-api-repo-provider.js`) теперь **наследуется**
  от `GitLabRepoProvider` и переиспользует «остающиеся» (keeper) DOM/URL-части
  (резолв project id, детект страницы MR/blob, поиск выбранного файла, парсинг
  URL ветки), переопределяя резолв параметров MR через GitLab MR API.
- Эвристический резолв коммитов (роль 4) и часть DOM-скрейпинга — кандидаты на
  **полное удаление** после отладки API-пути (отдельная задача из TODO
  `[REFAC-0001]`).

Поэтому декомпозиция разделяет «остающееся» (общая база для обоих провайдеров) и
«обречённое» (DOM-эвристика), чтобы будущий снос DOM-пути стал удалением
модулей, а не правкой внутри большого класса.

### Принятый дизайн (согласовано с пользователем 2026-06-14)

Две развилки решены в пользу более чистого end-state:

- **Базовый класс.** Вводится `GitLabRepoProviderBase` с keeper-логикой; от него
  наследуются и `GitLabRepoProvider` (DOM/эвристика), и `GitLabApiRepoProvider`
  (API). Это убирает запах «API-провайдер наследует DOM-провайдер» (его признаёт
  сам docstring `gitlab-api-repo-provider.js`).
- **Глубина — полная:** 4 новых модуля + тонкий базовый класс.

Целевая иерархия:

```
RepoProvider (repo-provider.js, без изменений)
 └ GitLabRepoProviderBase (gitlab-repo-provider-base.js, NEW) — keepers
     ├ GitLabRepoProvider (gitlab-repo-provider.js) — DOM/эвристический путь (doomed)
     └ GitLabApiRepoProvider (gitlab-api-repo-provider.js) — API-путь
```

Коллабораторы (композиция):

| Модуль (файл) | Класс | Роль | Судьба |
|---|---|---|---|
| `single-entry-cache.js` | `SingleEntryCache` | generic «последнее значение по ключу» | keeper |
| `gitlab-url-parser.js` | `GitLabUrlParser` | **чистый** парсинг URL/путей (без DOM/сети) | keeper |
| `gitlab-dom-scraper.js` | `GitLabDomScraper` | все чтения DOM страницы GitLab | keeper* |
| `merged-mr-commit-resolver.js` | `MergedMrCommitResolver` | эвристика резолва target-коммита смерженного MR | **doomed** |
| `master-commit-manager.js` | `MasterCommitManager` | существует; используется резолвером | doomed |

\* `GitLabDomScraper` — keeper в целом (его `findSelectedFilePath`/ref-selector
нужны и API-пути), но часть методов (`getMergeRequestBranchNames`,
`findDiffHeadSha`, `isMergedByBadge`) зовёт только DOM-провайдер/резолвер — они
уйдут вместе с DOM-путём.

Связи: `[REFAC-0001]` (API-провайдер и план удаления DOM-пути),
`[REFAC-0004]` (нейтрализация DTO и абстракция загрузчика контента).

## План реализации (для следующей сессии)

Рефакторинг **строго поведение-сохраняющий**: публичный интерфейс `RepoProvider`
не меняется, `App`/differ-страница/`repo-provider-factory.js`/`FallbackRepoProvider`
не трогаются (кроме, возможно, порядка в manifest). Контракт безопасности — все
существующие тесты остаются зелёными без правок их ожиданий.

### Распределение текущих членов `GitLabRepoProvider` → новые места

| Сейчас (в `GitLabRepoProvider`) | Куда переезжает |
|---|---|
| `class SingleEntryCache` | → `single-entry-cache.js` |
| `isAvailable`, `init` (+ init-кэш), `getProjectInfo`, `getChangeInfo`, `isChangeViewActive`, `getBranchFileType`, `findSelectedFilePath`, `extractBranchCommitIdAndFilePath`, `#getProjectId` | → **`GitLabRepoProviderBase`** (keepers) |
| `#findSelectedFilePathLegacy/InRapidDiffs`, `#extractRapidDiffFilePath`, `#findDataPathElements` | → `GitLabDomScraper.findSelectedFilePath()` (+ приватные) |
| `#extractBranchCommitIdByDocSelectorCase1/2` | → `GitLabDomScraper.findBranchCommitIdText()` |
| `getChangeBranchNames` (DOM `detail-page-description`) | → `GitLabDomScraper.getMergeRequestBranchNames()`; DOM-провайдер делегирует |
| `#findDiffHeadSha` | → `GitLabDomScraper.findDiffHeadSha()` |
| `#extractBranchCommitIdAndFilePathByRegex` | → `GitLabUrlParser.extractBranchCommitIdAndFilePath(href, projectName, hint)` |
| URL-нарезка в `init`/`initChangeInfo` | → `GitLabUrlParser.parseProject(href)` / `extractMrIid(href)` / `buildMrApiUrl(projectInfo, iid)` |
| `initChangeInfo` (+ MR-инфо-кэш), `getSourceCommitId`, `#getMrLastCommitId` | → остаются в **`GitLabRepoProvider`** (DOM-путь) |
| `getTargetCommitId` (+ target-кэш) | → делегирует в `MergedMrCommitResolver` |
| `#isMrMerged`, `#findTargetBranchPreviousCommitId`, `#findTargetBranchCommitIdByTitle`, `#loadFilteredByTitleMasterCommitEntries` (+ кэш), поле `#masterCommitManager` | → `MergedMrCommitResolver` |

### Контракты новых модулей

**`GitLabUrlParser`** (чистый, без DOM/сети — поэтому легко юнит-тестировать):
- `parseProject(href)` → `{ url, hostUrl, groupName, name }` или `null`
- `extractMrIid(href)` → `string|null` (объединяет дублирующиеся `#extractIid`
  DOM- и API-провайдеров)
- `buildMrApiUrl(projectInfo, iid)` → `string` (логика из `initChangeInfo`)
- `isMrDiffPage(href)` → `boolean`
- `getBranchFileType(href)` → `FileType|null`
- `extractBranchCommitIdAndFilePath(href, projectName, branchCommitIdHint)` →
  `{ branchCommitId, filePath }|null`

**`GitLabDomScraper`** (только чтение DOM; тестируется на jsdom-разметке, как уже
делает `gitlab-repo-provider.test.js`):
- `findSelectedFilePath()` (+ приватные legacy/rapid-diffs хелперы)
- `findBranchCommitIdText()` (ref-selector case1/case2)
- `getMergeRequestBranchNames()` → `MergeRequestBranchNames|null`
- `findDiffHeadSha()` → `string|null`
- `isMergedByBadge()` → `boolean`

**`MergedMrCommitResolver`** (вся эвристика роли 4 в одном месте):
- ctor: `(projectInfo, domScraper, masterCommitManager, loadContent)`
- `resolveTargetCommitId(sourceCommitId, changeTitle, targetBranchName, mrInfoUrl)`
  → `string` — переносит ветвление merged/opened из `getTargetCommitId`, держит
  target-commit-кэш и `#filteredByTitleMasterCommitEntries`-кэш
- приватные: `#isMerged(mrInfoUrl)` (бейдж через `domScraper.isMergedByBadge()` +
  API через `loadContent(mrInfoUrl)`), `#findPreviousCommitId`,
  `#findCommitIdByTitle`, `#loadFilteredEntries`

**`GitLabRepoProviderBase`**:
- ctor принимает `loadContent = loadFileContent` (DI для тестов; API-провайдер уже
  так делает), создаёт `projectInfo`, `mergeRequestInfo`, `urlParser`,
  `domScraper` (поля **не** `#`, чтобы подклассы имели доступ — как уже сделаны
  `projectInfo`/`mergeRequestInfo`), init-кэш через `SingleEntryCache`
- содержит keeper-методы из таблицы выше; `init()` = резолв project id
  (`#getProjectId` через `loadContent`) с кэшем — ровно как сейчас

**`GitLabApiRepoProvider`** (после правки):
- `extends GitLabRepoProviderBase` (вместо `GitLabRepoProvider`)
- удалить собственные `#extractIid`/`#isMrDiffPage` → использовать
  `this.urlParser`
- сохранить `#loadMr`/`#mr`/`#mrCacheKey`, override `init` (super.init + проба
  API), `initChangeInfo`, `getChangeBranchNames`, `getSourceCommitId`,
  `getTargetCommitId`

### Поэтапно (каждый этап — отдельный коммит, `npm test` зелёный после каждого)

0. Зафиксировать зелёный baseline `npm test`.
1. **SingleEntryCache** → `single-entry-cache.js`; перевести init/MR-инфо/target
   кэши на него. Поведение идентично.
2. **GitLabUrlParser** — вынести чистую URL-логику; заменить инлайн-парсинг в
   обоих провайдерах (включая дубль `#extractIid`/`#isMrDiffPage`). + юнит-тесты.
3. **GitLabDomScraper** — вынести все DOM-чтения; провайдер делегирует.
   Существующие DOM-тесты остаются (бьют публичный API провайдера).
4. **MergedMrCommitResolver** — вынести эвристику из `GitLabRepoProvider`.
   + юнит-тесты (нужны стабы `fetch`/`localStorage`/`Date.now` — см. риски).
5. **GitLabRepoProviderBase** — ввести базу с keeper-методами; `GitLabRepoProvider`
   → DOM/эвристика поверх базы; `GitLabApiRepoProvider` → `extends` базу. Прогон
   тестов + ручной smoke (открытый MR на self-managed и на gitlab.com,
   смерженный MR, blob-страница).

### Сопутствующие правки (обязательны)

- **`manifest.json`** (`content_scripts`): добавить 5 файлов в правильном порядке
  — `single-entry-cache.js`, `gitlab-url-parser.js`, `gitlab-dom-scraper.js`
  (без зависимостей → до базы); `merged-mr-commit-resolver.js` (после
  `master-commit-manager.js`); `gitlab-repo-provider-base.js` (после
  `repo-provider.js` и трёх утилит, **до** `gitlab-repo-provider.js`).
  ⚠️ Порядок `content_scripts` — guarded-изменение: **согласовать с пользователем
  до правки** (правило CLAUDE.md / `docs/conventions.md`).
- **`test/support/scope.js`**: те же файлы в `SCOPE_FILES` (тот же относительный
  порядок) + классы в `EXPORTED_NAMES` (`SingleEntryCache`, `GitLabUrlParser`,
  `GitLabDomScraper`, `MergedMrCommitResolver`, `GitLabRepoProviderBase`).
- **Тесты**: новые `*.test.js` на каждый вынесенный модуль (стиль —
  `test-design-preferences`: много мелких, публичный API). Существующие
  `gitlab-repo-provider.test.js` / `gitlab-api-repo-provider.test.js` /
  `fallback-repo-provider.test.js` остаются зелёными без правки ожиданий.
- **`docs/architecture.md`**: обновить таблицу ключевых файлов (новые модули +
  новое описание `gitlab-repo-provider.js`) и схему иерархии провайдеров.

### Риски / на что смотреть

- **`super.init()` API-провайдера**: после ввода базы `super.init()` должен
  делать ровно то же, что текущий `GitLabRepoProvider.init` (резолв project id +
  кэш). API-проба остаётся в override'е.
- **Зависимость по порядку вызовов**: `MergedMrCommitResolver.#isMerged` читает
  `mrInfoUrl` (сейчас `mergeRequestInfo.infoUrl`, ставится в `initChangeInfo`).
  Проверить, что в потоке `App` `initChangeInfo` вызывается до `getTargetCommitId`,
  и пробросить `mrInfoUrl` в `resolveTargetCommitId`.
- **jsdom в тестах резолвера**: `MasterCommitManager` использует `localStorage`,
  `fetch`, `Date.now()` — в юнит-тестах резолвера их стабить/инжектить.
- **Доступ подклассов к коллабораторам**: `urlParser`/`domScraper` на базе —
  обычные поля (не `#`), т.к. в JS нет `protected`; это согласуется с тем, что
  `projectInfo`/`mergeRequestInfo` уже публичные поля.
- **Глобальный scope `<script>`**: новые файлы не должны само-исполнять код на
  загрузке (в отличие от `bpmn-differ.js`/`dmn-differ.js`) — только декларации
  классов.

### Промпт для старта новой сессии

> Реализуй REFAC-0002 по плану из `docs/issues/refactor/refac-0002-decompose-gitlab-provider.md`.
> Дизайн уже согласован (общая база `GitLabRepoProviderBase` + полная
> декомпозиция на 4 модуля). Действуй поэтапно (этапы 1→5), после каждого —
> `npm test`. Порядок `content_scripts` в `manifest.json` меняешь только после
> явного подтверждения пользователя. Поведение `RepoProvider` не меняется;
> существующие тесты должны остаться зелёными. По завершении — MR и запись в
> «Историю работы».

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->
