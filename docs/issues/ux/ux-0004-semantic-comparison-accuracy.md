---
id: UX-0004
title: Точность семантического сравнения и подсветки свойств
priority: medium
status: open
---

## Постановка

Устранить накопленные edge cases компараторов:

- Подсвечивать изменение кода ошибки (`bpmn:error`): сейчас изменение не подсвечивается.
- `failedJobRetryTimeCycle` относится к двум группам, поддержана одна (маппинг `camunda:failedJobRetryTimeCycle` на `Multi-instance` закомментирован).
- Подобрать корректный заголовок группы панели свойств для `bpmn:startEvent/isInterrupting`.
- Сравнивать DMN outputs по id, а не по label — сейчас по label, т.к. в html нет атрибута id у outputs.

## Контекст

- Изменение кода ошибки (`bpmn:error`). Пример MR: https://gitlab.example.com/example-project/example-repo/-/merge_requests/795. Код: `bpmn-xml-comparator.js` (маппинг свойств → группа `Error`).
- `failedJobRetryTimeCycle`: код `bpmn-xml-comparator.js`.
- Заголовок группы для `bpmn:startEvent/isInterrupting`: код `bpmn-xml-comparator.js`.
- DMN outputs по id вместо label: код `dmn-xml-comparator.js#compareOutputs`.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->
