---
id: BUG-0012
title: В режиме просмотра ref склеивается с путём → поиск хендлера не находит источник
priority: high
status: done
---

## Постановка

В режиме **просмотра** BPMN-схемы (страница `/-/blob/<SHA>/<path>`, не diff MR) при
переходе к хендлеру service-таски поиск исходника падает:

```
handler source not found for topic 'ModuleA_Agreement_PreApprove_GenerateAdditionalAgreementToCreditAgreement'
```

Сама диаграмма при этом открывается нормально — баг проявляется только на навигации к хендлеру.

## Контекст

Воспроизведение:
- Схема: `https://gitlab.example.com/example-project/example-repo/-/blob/a4084af3387695c4182c04522b6fa644bb033d78/business/module-a/src/main/resources/bpmn/agreement/AgreementPreApprove.bpmn`
- Таска: `GenerateAdditionalAgreementToCreditAgreement`.

В лог уходит Search API запрос, где `ref` = **SHA + путь к каталогу схемы**, а не чистый SHA:

```
GET /api/v4/projects/118208/search?scope=blobs
    &ref=a4084af3387695c4182c04522b6fa644bb033d78%2Fbusiness%2Fmodule-a%2Fsrc%2Fmain%2Fresources%2Fbpmn%2Fagreement
    &search=class%20ModuleA_Agreement_PreApprove_GenerateAdditionalAgreementToCreditAgreement
```

Ответ — `200` и тело `[]`: GitLab берёт `ref` буквально как имя ветки/коммита, такого ref нет → ничего не найдено.

### Root cause

Неверный разбор blob-URL в `GitLabUrlParser.extractBranchCommitIdAndFilePath`
(`src/content/providers/gitlab/gitlab-url-parser.js:121-144`). Совпали три условия:

1. **DOM-подсказка пуста.** `branchCommitIdHint` берётся из
   `domScraper.findBranchCommitIdText()` (`gitlab-repo-provider-base.js:148`). На
   странице файла, открытого по голому коммиту, селектор ref не сматчился → `null`.
2. **Первичный regex не сработал.** Он анкорится на имя проекта:
   `` `\/-\/blob\/([0-9a-zA-Z-_./]+)\/(${projectName}\/.*)` `` (`projectName = "example-repo"`).
   Repo-relative путь файла (`business/module-a/src/…`) не содержит `example-repo/`,
   поэтому regex не матчится. Эта эвристика в принципе работает, только если верхний
   каталог совпадает с именем проекта — у этого модуля он другой.
3. **Fallback жадно съел путь.** Без подсказки `branchCommitId` собирается из
   альтернатив, последняя из которых — catch-all `[0-9a-zA-Z-_./]+` (включает `/`),
   жадная: `` `\/-\/blob\/(master|develop|feature\/…|bugfix\/…|[0-9a-zA-Z-_./]+)\/(.*)` ``.
   Группа захватила всё до последнего `/`:
   `branchCommitId = a4084…/business/…/agreement`, `filePath = AgreementPreApprove.bpmn`.

**Почему просмотр всё-таки работает, а поиск нет.** Испорченный `targetRef`
используется двумя несовместимыми способами:
- Загрузка диаграммы: `rawFileUrl` = `${projectUrl}/-/raw/${ref}/${filePath}`
  (`differ-params.js:52`). Конкатенация **восстанавливает полный путь**, а endpoint
  `/-/raw/` сам разделяет ref и path (распознаёт 40-символьный SHA) → схема грузится.
- Поиск хендлера: `#searchBlobs` шлёт `ref` отдельным query-параметром
  (`handler-locator.js:444-446`). Он берётся буквально, путь внутри ref не
  отрезается → `[]`.

### Как чинить

Минимальный фикс, не зависящий от хрупкого DOM, — добавить в fallback-альтернацию
**явный шаблон коммит-SHA перед catch-all**, чтобы hex-SHA захватывался точно и не
«вытягивал» путь (`gitlab-url-parser.js:128`):

```js
branchCommitId = 'master|develop|feature\/[0-9a-zA-Z-_.]+|bugfix\/[0-9a-zA-Z-_.]+|[0-9a-fA-F]{7,40}|[0-9a-zA-Z-_./]+';
```

Альтернация в JS пробуется слева направо: для URL с коммитом сматчится
`[0-9a-fA-F]{7,40}` на сам SHA, а `filePath` получит полный путь. Случай веток с `/`
в имени по-прежнему опирается на DOM-подсказку (отдельная неоднозначность, из одного
URL не разрешается).

Проверка: класс покрыт юнит-тестами — сначала падающий тест на URL с SHA и глубоким
путём (без `projectName` в нём), затем правка regex, затем `npm test`.

Затронутый файл: `src/content/providers/gitlab/gitlab-url-parser.js`.

Связано: эвристика `projectName` в первичном regex (п.2) — отдельное латентное хрупкое
место; общий аудит таких мест вынесен в [REFAC-0012].

### Дальнейшее (followup)

SHA-фикс выше — **точечный**: он закрывает только blob-URL по голому коммиту. Сама
схема разбора остаётся угадыванием — альтернация захардкожена на `master|develop|
feature/…|bugfix/…` и не знает про `main`, `release/*`, `hotfix/*` и любые кастомные
имена веток (для них снова сработает жадный catch-all и путь «утянется» в ref). Это не
формат коммитов, а заплатка под слэш-в-имени-ветки, и она хрупкая.

Надёжный путь (вынесен в [REFAC-0012], не делается в рамках BUG-0012):
- брать `ref` из **детерминированного источника** (GitLab API / явный DOM-атрибут
  страницы), а не угадывать из URL;
- если без эвристики никак — **валидировать инвариант** результата (ref обязан быть
  hex-SHA или существующей веткой/тегом, `filePath` непустой) и **явно логировать**
  (`console.warn` с входным URL) при нарушении, чтобы причина была видна сразу, а не
  выводилась из сетевого лога.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись. Новые записи сверху. -->

- **Opus 4.8 · 2026-06-17 · fix/bug-0012-ref-path-merged-in-blob-url-parse** — В fallback-альтернацию
  `extractBranchCommitIdAndFilePath` добавлен явный шаблон hex-SHA (`[0-9a-fA-F]{7,40}`) перед жадным
  catch-all (`gitlab-url-parser.js:128-130`). Теперь для blob-URL по коммиту с глубоким путём (без
  `projectName` в нём и без DOM-подсказки) ref матчится точно на SHA, а `filePath` получает полный путь —
  Search API получает чистый ref. Добавлен падающий→зелёный юнит-тест. `npm test` — 765 pass. status=done.
