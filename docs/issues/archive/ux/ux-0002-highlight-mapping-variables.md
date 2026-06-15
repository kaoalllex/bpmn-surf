---
id: UX-0002
title: Подсветка конкретных переменных при изменениях в маппинге
priority: medium
status: done
---

## Постановка

При изменении In/Out mappings выделять конкретные добавленные/удалённые/изменённые переменные, а не всю группу в панели свойств.

## Контекст

- Сейчас при изменении In/Out mappings выделяется вся группа в панели свойств.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-15 · claude-opus-4-8 · ветка `feature/ux-0002-highlight-mapping-variables`

Поэлементная подсветка изменённых записей в списочных группах панели свойств (In/Out mappings, Inputs/Outputs) поверх существующей подсветки заголовка группы.

- `bpmn-xml-comparator.js`: `compare()` дополнительно отдаёт `nodeIdToMappingChanges` (id → Map(группа → `[{label, changed}]`)); извлечение записей из прямых потомков `bpmn:extensionElements`, матч по `target` (mappings) / `name` (inputs/outputs), `changed` различает «изменено» (есть в обеих, различается) и «добавлено/удалено» (только в показываемой версии). Записи `businessKey`/`variables="all"` пропускаются (они в других группах панели).
- `properties-panel-highlighter.js`: `setDiffData` принимает 3-й аргумент; заголовок группы красится как раньше, дополнительно красятся конкретные записи (changed→синий, added→зелёный/MR, removed→красный/target по `isTargetBranchShownFunc`); фолбэк на подсветку только группы, если запись не сопоставлена.
- Тесты: `bpmn-xml-comparator-camunda.test.js` (+5), `properties-panel-highlighter.test.js` (+6), расширена фикстура `properties-panel.html`. `npm test` — 587 зелёных.
