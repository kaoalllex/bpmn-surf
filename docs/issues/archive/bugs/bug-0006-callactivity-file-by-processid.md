---
id: BUG-0006
title: 'CallActivity: файл вызываемого процесса не находится по processId'
priority: medium
status: done
---

## Постановка

По `processId` не всегда резолвится BPMN-файл (`FactoringReject` и подобные). Само «проваливание» работает, баг — в резолве.

## Контекст

- Лог: `cannot find bpmn file path by process id: FactoringReject` (`process-file-index.js`).

## История работы

### 2026-06-14 · — · (ветка `refactor/call-activity-lazy-load`)

Сделано: резолв теперь по содержимому — blob-search по объявлению `<bpmn:process id="...">` (`call-activity-locator.js`), а не по эвристике «имя файла = processId», поэтому `FactoringReject` и подобные находятся. Старый индекс по имени файла (`ProcessFileIndex`) оставлен как fallback на случай недоступности blob-search.
