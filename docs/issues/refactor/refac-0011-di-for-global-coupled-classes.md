---
id: REFAC-0011
title: DI для классов, завязанных на fetch/localStorage/location — снять тест-долг
priority: low
status: open
---

## Постановка

Несколько классов несут реальную логику, но завязаны на глобали
(`fetch`/`localStorage`/`sessionStorage`/`location`) напрямую, без инъекции
коллабораторов — поэтому не покрыты юнит-тестами и числятся в
`UNTESTED_BY_DESIGN` (`test/structure/source-layout.test.js`):

- `master-commit-manager.js` — `fetch` + `localStorage` + `DOMParser` + `Date.now()`
  внутри методов; кэш-инвалидация багоопасна (ср. [BUG-0008]). Относится к
  «обречённому» DOM-пути ([REFAC-0008]) — возможно, уйдёт вместе с ним, тогда тест
  не нужен.
- key-building в `handler-navigator.js` / `call-activity-navigator.js`
  (`#getHandlerKey` и аналог) — чистая логика построения namespaced-ключа из BO,
  зеркалит уже покрытые `HandlerLocator`/`CallActivityLocator`, но приватна и
  завязана на overlay/DOM.

Образец для подражания — `MergedMrCommitResolver`: все side-effect-коллабораторы
(`loadContent`, `domScraper`, `masterCommitManager`) инъектируются через
конструктор, тест обходится без `fetch`/`localStorage`.

Предложение: для не-«обречённых» классов вынести side-effects в инъектируемые
коллабораторы (или выделить чистую функцию построения ключа), покрыть тестами и
убрать запись из `UNTESTED_BY_DESIGN`. Поведение не меняется.

## Контекст

- `PageReloader` уже покрыт контрактным тестом счётчика попыток
  (`test/content/page-reloader.test.js`) без рефакторинга — `location.reload`
  в jsdom no-op, проверяется наблюдаемый счётчик в `sessionStorage`.
- Связано с [REFAC-0008] (удаление DOM-резолва коммитов) — определяет судьбу
  `MasterCommitManager`.
- Структурный тест `source-layout.test.js` следит, чтобы список
  `UNTESTED_BY_DESIGN` не «протух»: добавив тест, нужно убрать запись оттуда.

## История работы
