---
id: UX-0001
title: Условия на Sequence Flow — игнорировать незначимые пробелы
priority: medium
status: partial
---

## Постановка

При сравнении условий на Sequence Flow (`bpmn:conditionExpression`) незначимые пробелы и переносы строк вне строковых литералов должны игнорироваться. Дополнительно — улучшить читаемость длинных/сложных expression при отображении.

## Контекст

- Пример MR: https://gitlab.example.com/example-group/example-service/-/merge_requests/4335/diffs
  ```
  было:                                   стало:
  ${                                      ${
    ( !execution.hasVariable("skip…") ||    !(execution.hasVariable("skip…") &&
      !skipRelatedSearch )   &&             skipRelatedSearch ) &&
    estates.hasAnyEstate…()               estates.hasAnyEstate…()
  }                                       }
  ```
- Затронутый файл: `bpmn-xml-comparator.js#normalizeExpression`.
- Осталось:
  - улучшить читаемость длинных/сложных expression при отображении.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-11 · — · (ветка `fix/backlog-autonomous-fixes`)

При сравнении `bpmn:conditionExpression` незначимые пробелы и переносы строк вне строковых литералов теперь игнорируются (`bpmn-xml-comparator.js#normalizeExpression`). Осталось: улучшить читаемость длинных/сложных expression при отображении.
