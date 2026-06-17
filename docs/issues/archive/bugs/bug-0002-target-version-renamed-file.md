---
id: BUG-0002
title: Не находим target-версию при переименовании файла схемы
priority: high
status: done
---

## Постановка

Схему переименовали — в master такого имени нет, дифф не строится.

## Контекст

- MR: https://gitlab.example.com/example-group/example-service/-/merge_requests/4119/diffs?commit_id=a34a768619d0efd47a331ea94df3653cd0c9dfde#aaaf91f17e455f9dd71767bf9d2c5ac5d5df2350

### Корень проблемы

Через весь поток данных протаскивается **один** `filePath`, и он используется для обеих сторон диффа:

1. `findSelectedFilePath()` (`gitlab-dom-scraper.js`) возвращает путь, как он показан на странице diffs MR — это **`new_path`** (новое имя).
2. `app.js#addDiffButton` (`app.js:134`) кладёт его в `params.filePath` → `DiffParamsBuilder` → `DifferParams.filePath`.
3. `DifferParams.rawFileUrl(ref)` (`differ-params.js:43`) строит URL `…/-/raw/<ref>/<filePath>` — **с тем же `filePath` для обоих ref**.
4. `DiagramVersions` (`diagram-versions.js:20-25`):
   - `loadMrXml()` → `…/-/raw/<head_sha>/<new_path>` → **OK** (в source-ветке файл с новым именем есть);
   - `loadBranchXml()` → `…/-/raw/<base_sha>/<new_path>` → **404**, т.к. в target-коммите файл лежит под `old_path`.

Итог: `branchXml = null`, `mrXml ≠ null`. Срабатывает не «оба отсутствуют», а ветка UX-0003 «target отсутствует» → новая версия показывается как новый файл, **дифф не строится**.

Инфо о переименовании уже доступна, но для схем не используется: MR changes API (`old_path`/`new_path`/`renamed_file`, паттерн — `handler-locator.js:318-358`, `extractHandlerFileChanges`) и rapid-diffs DOM `data-file-data` (`gitlab-dom-scraper.js:197`).

## План реализации

**Выбранный подход (вариант A + ленивый резолв на клике).** Резолвить `old_path` через MR changes API в провайдере и протаскивать в дифер отдельный нейтральный `targetFilePath` (по умолчанию = `filePath`). Когда переименования нет — поведение **байт-в-байт прежнее**, меняется только rename-случай. Дифер остаётся платформо-нейтральным. `getTargetFilePath` вызывается **лениво в обработчике клика** по кнопке (не на hot-path `mouseup`).

Альтернативы и причины отказа: **B** (только DOM `data-file-data`) — работает лишь на rapid diffs (gitlab.com), заявленный MR на self-managed gitlab.example.com с legacy-разметкой не чинит; **C** (ленивый retry на дифере при 404) — тащит GitLab-специфичный вызов `/changes` в нейтральное ядро дифера; **D** (гибрид A+B) — избыточно сейчас.

### Шаги

1. **Pure-функция извлечения переименований** — `gitlab-repo-provider-base.js`, статический `extractRenameMap(changesResponse)` (зеркало `extractHandlerFileChanges`): из `changes[]` собирает `Map(new_path → old_path)` только для записей-переименований (`renamed_file`, либо `new_path !== old_path` и не `new_file`/`deleted_file`).

2. **Метод провайдера** — `GitLabRepoProviderBase.getTargetFilePath(filePath)`:
   - `iid = urlParser.extractMrIid(...)`; нет iid → вернуть `filePath` (branch-view, без запроса);
   - тянет `/api/v4/projects/{id}/merge_requests/{iid}/changes` через `this.loadContent` (кэш по URL, как `#mr`/`#commits`);
   - возвращает `renameMap.get(filePath) || filePath`; любая ошибка → `filePath` (безопасный дефолт = текущее поведение).
   - В интерфейс `repo-provider.js` добавить дефолт `getTargetFilePath(filePath) → filePath` (`FallbackRepoProvider` делегирует автоматически).

3. **Резолв на клике** — `app.js#openDiffer` (или click-обёртка в `#addButton`): только для `UI_BUTTON_TYPE.DIFF` сделать `const targetFilePath = await this.#repoProvider.getTargetFilePath(params.filePath)` и подмешать в params перед `openDiffer`. Hot-path `mouseup` не трогается.

4. **Протаскивание пути target-стороны:**
   - `DifferParams`: `this.targetFilePath = params.targetFilePath || this.filePath;` + `rawFileUrl(ref, filePath = this.filePath)`. `toNestedDifferParams` — без переноса (дефолт = `filePath`, поведение вложенного дифера прежнее).
   - `DiagramVersions.loadBranchXml()` → `#loadXml(targetRef, params.targetFilePath)`; `loadMrXml()` без изменений.

5. **Тесты** (мелкие, публичный API): `extractRenameMap` (rename / new / deleted / без переименования); `getTargetFilePath` (old_path при rename; filePath без rename / без iid / при ошибке; один fetch — кэш; через DI `loadContent`); `DifferParams.targetFilePath` дефолт + `rawFileUrl(ref, path)`; `DiagramVersions.loadBranchXml` использует `targetFilePath`; дефолт интерфейса.

6. **Доки:** обновить таблицу в `architecture.md` (DifferParams/DiagramVersions/база/поток app.js), запись в «Историю работы» ниже, `status: in-progress` на время работы.

### Замечания

- Новых файлов нет (функция — статик на существующей базе) → реестры/`manifest.json` не трогаем.
- `/changes` формально deprecated, но работает на нашем GitLab и уже используется в `handler-locator` — берём его для единообразия; на больших MR это один кэшируемый запрос на клик.
- Имя для скачивания target-версии останется новым (`fileName`); при желании потом — отдельный `targetFileName` (вне scope этого фикса).

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0002-target-version-renamed-file`

Доработка по замечанию (ранее помечено «вне scope»): при переименовании показывать имя файла, соответствующее стороне, и использовать его при скачивании.

- `differ-params.js`: поле `targetFileName` = basename(`targetFilePath`) (дефолт = `fileName`).
- `diagram-versions.js`: `download(content, branchName, fileName=params.fileName)` — имя передаётся вызывающей стороной.
- `bpmn-differ-view.js` / `dmn-differ-view.js`: `setFileName(name)` обновляет имя в заголовке (хранится ссылка на span).
- `bpmn-differ.js` / `dmn-differ.js`: в `#showMr` → `fileName`, в `#showBranch` / `#showAbsentSide(target)` → `targetFileName`; скачивание target-стороны — с `targetFileName`. Без переименования имена совпадают → поведение прежнее.
- Тесты (+2): `DifferParams.targetFileName` (дефолт + basename при переименовании). Все 704 зелёные.

### 2026-06-17 · claude-opus-4-8 · ветка `fix/bug-0002-target-version-renamed-file`

Реализован выбранный подход (вариант A + ленивый резолв на клике):

- `gitlab-repo-provider-base.js`: статик `extractRenameMap(changesResponse)` (Map `new_path → old_path` только для переименований) + метод `getTargetFilePath(filePath)` (резолв через MR `/changes` API, кэш по URL в `#renameMaps`; нет iid / нет переименования / ошибка → `filePath`).
- `repo-provider.js`: дефолт интерфейса `getTargetFilePath(filePath) → filePath` (identity). `FallbackRepoProvider`: явная делегация активному провайдеру (у него нет авто-Proxy — все методы делегируются вручную).
- `app.js#openDiffer`: для `UI_BUTTON_TYPE.DIFF` лениво резолвит `targetFilePath` на клике (вне hot-path `mouseup`) и подмешивает в params только при отличии от `filePath`.
- `differ-params.js`: поле `targetFilePath` (дефолт = `filePath`) + `rawFileUrl(ref, filePath=this.filePath)`. `toNestedDifferParams` без изменений.
- `diagram-versions.js`: `loadBranchXml()` грузит target по `params.targetFilePath`; `loadMrXml()` — по `filePath`.

Тесты (+12, все 702 зелёные): `extractRenameMap` (rename / без флага / new+deleted+unchanged / пустой ответ), `getTargetFilePath` (old_path при rename; filePath без rename / без iid без запроса / при ошибке; один fetch — кэш), `DifferParams` (`targetFilePath` дефолт + explicit; `rawFileUrl(ref, path)`).

Отклонение от плана: отдельный юнит-тест `DiagramVersions.loadBranchXml` не добавлен — класс в `UNTESTED_BY_DESIGN` (завязан на глобальный `loadFileContent` без DI), а его новое поведение полностью определяется протестированным `DifferParams.rawFileUrl(ref, filePath)`. DI-рефактор `DiagramVersions` вне scope минимального фикса.
