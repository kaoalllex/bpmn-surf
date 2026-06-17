---
id: BUG-0013
title: Поиск хендлера не находит источник на инстансах с Advanced Search (Elasticsearch)
priority: high
status: done
---

## Постановка

В режиме просмотра BPMN-схемы на `gitlab.example.com` переход к хендлеру service-таски
не находит источник, хотя таска объявлена корректно:

```
handler source not found for topic 'ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage'
```

Это **отдельная** причина от [BUG-0012] (склейка ref/path): после фикса BUG-0012 в
запрос уходит чистый SHA (`ref=a4084af3387695c4182c04522b6fa644bb033d78`), но Search
API всё равно возвращает пусто.

## Контекст

Воспроизведение:
- Схема: `…/example-project/example-repo/-/blob/a4084af3387695c4182c04522b6fa644bb033d78/business/module-a/src/main/resources/bpmn/agreement/AgreementPreApprove.bpmn`
- Таска `CreateSigningDocumentInStorage`, хендлер объявлен ровно тем способом, который
  ищет `#searchSubscriptionLocation` (литеральная строка топика в аннотации):

  ```kotlin
  @Component("ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage")
  @ExternalTaskSubscription("ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage")
  class CreateSigningDocumentInStorageTask
  ```

Код локатора (`handler-locator.js`) ищет двумя термами:
1. `#searchSubscriptionLocation` → `ExternalTaskSubscription("<topic>")` (литерал с кавычками/скобками);
2. fallback `#searchExternalTaskBeanLocation` → `class <Topic-с-заглавной>` (для этого
   проекта заведомо мимо — класс называется `<Шаг>Task`, а не как топик).

### Что проверено

Эксперимент на тестовом проекте gitlab.com (`dev.example/bpmn-diff-test`, id 57703231),
файл с такой же аннотацией на дефолтной ветке, тот же Search API:

| Терм | ref | Результат |
|------|-----|-----------|
| `ExternalTaskSubscription("<topic>")` (кавычки+скобки) | `main` | **1** найден |
| `ExternalTaskSubscription("<topic>")` | commit SHA | **1** найден |
| `ExternalTaskSubscription("<topic>")` | — (default) | **1** найден |
| bare `<topic>` | `main` / SHA / — | **1** найден |
| `class CreateSigningDocInStorageTask` | `main` | **1** найден |
| `class <topic-as-class>` (наш fallback) | `main` | 0 (ожидаемо) |

Вывод: на инстансе с **basic search** (Gitaly `git grep`, как у gitlab.com тестового
проекта) логика локатора **корректна** — литерал с пунктуацией, ref по SHA и bare-топик
находят файл. Раз на example тот же запрос даёт `200` + `[]`, у example другой бэкенд —
**Advanced Search (Elasticsearch)**, а у него:
- `ref` для blob-поиска **игнорируется**, индексируется только дефолтная ветка;
- строка запроса парсится иначе (`"` = phrase, `(` `)` — служебные) → литерал
  `ExternalTaskSubscription("…")` может не матчиться.

### Root cause (подтверждено на example)

**Подтверждено: кандидат A** — пунктуация ломает запрос в ES. Терм с `"`/`()` не
находит, хотя файл в индексе есть; bare-строка топика находит. Лечится переходом на
bare-поиск строки топика (только идентификатор, без спецсимволов) + фильтрация
результатов по handler-файлам, чей сниппет содержит `ExternalTaskSubscription`/топик.

(Кандидат B — ES индексирует только дефолтную ветку — отпал: bare-поиск находит хендлер
и с ref, и без. Параллельно подтвердилось, что ES реально индексирует только `master`
[в ответе `"ref":"master"` при запросе без ref], но хендлер там есть, так что для
просмотра это не блокер.)

### Диагностика для подтверждения (выполнить в браузере с сессией example)

scope=blobs, проект 118208, топик `ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage`:

- D1 bare-топик, без ref: `…/api/v4/projects/118208/search?scope=blobs&search=ModuleA_Agreement_PreApprove_CreateSigningDocumentInStorage`
- D2 bare-топик, ref=SHA схемы: `…&ref=a4084af3387695c4182c04522b6fa644bb033d78&search=ModuleA_…_CreateSigningDocumentInStorage`
- D3 кавычки+скобки, без ref: `…&search=ExternalTaskSubscription("ModuleA_…_CreateSigningDocumentInStorage")`

Интерпретация:
- D1 непусто, D3 пусто → **кандидат A** (пунктуация). Фикс — bare-поиск топика.
- D1 непусто, D3 непусто, D2 пусто → ref-параметр ломает ES-запрос → не слать ref (или
  не слать, когда это SHA).
- D1 пусто → **кандидат B** (нет в индексе дефолтной ветки) → решение шире.

### Как чинить (сделано)

Инстанс-независимый фикс — в `#searchSubscriptionLocation` ищется **bare-строка топика**
вместо `ExternalTaskSubscription("<topic>")`: идентификатор без спецсимволов дружелюбен и
к basic, и к ES, а отсев ложных совпадений уже делается (фильтр по handler-файлам +
предпочтение сниппета с `ExternalTaskSubscription`). Отправку `ref` оставили: на ES она
игнорируется (всё равно ищется master), на basic-search инстансах корректно скоупит.
Затронутый файл: `src/differ/navigation/handler-locator.js`.

Связано: [BUG-0012] (склейка ref/path — починена, дала чистый ref, после чего проявился
этот баг), [REFAC-0012] (эвристики в `HandlerLocator`).

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись. Новые записи сверху. -->

- **Opus 4.8 · 2026-06-17 · fix/bug-0012-ref-path-merged-in-blob-url-parse** —
  Расследование + фикс. Подтверждено, что хендлер объявлен корректно
  (`@ExternalTaskSubscription("<topic>")`), а логика локатора работает на basic-search
  (проверено на gitlab.com тестовом проекте — все термы находят файл). Диагностика
  D1–D3 на example (пользователь прогнал в браузере) подтвердила **кандидат A**: bare-топик
  находит хендлер (с ref и без), а терм с `"`/`()` даёт `[]`. Фикс: `#searchSubscriptionLocation`
  теперь ищет bare-строку топика (`handler-locator.js:384-396`). `npm test` — 765 pass.
  status=done.
