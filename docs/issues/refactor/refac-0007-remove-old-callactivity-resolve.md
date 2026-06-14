---
id: REFAC-0007
title: Удалить старый механизм резолва CallActivity-схемы
priority: low
status: open
---

## Постановка

После того как blob-search-резолв (`CallActivityLocator`, ветка `refactor/call-activity-lazy-load`, 2026-06-14) подтвердит надёжность на практике — удалить fallback на старый механизм резолва CallActivity-схемы.

## Контекст

Удалить:

- файл `process-file-index.js` (`ProcessFileIndex`), его конструирование и поле в `bpmn-differ.js`;
- fallback-ветку в `CallActivityLocator`;
- localStorage-кэш;
- эвристики суффикса `Process` / капитализации имени и глубокий парсинг всех `.bpmn`.

Тогда же убрать `process-file-index.js` из `manifest.json` и `utils.js#loadScripts`.

Связано с [BUG-0006].

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->
