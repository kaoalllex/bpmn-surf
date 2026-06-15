---
id: UX-0001
title: Условия на Sequence Flow — игнорировать незначимые пробелы
priority: medium
status: done
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
- Затронутые файлы: `bpmn-xml-comparator.js#normalizeExpression` (сравнение), `condition-formatter.js` (отображение).

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-15 · claude-opus-4-8 · (ветка `feature/ux-0001-condition-readability`)

Доделана читаемость отображения condition expression в `ConditionFormatter`:
- весь пробельный материал вне строковых литералов (пробелы, табы, переносы строк) считается незначимым — форматтер сам строит отступы, исходная раскладка XML больше не протекает в вывод (раньше многострочные условия рендерились со встроенными `\n`/`\t`);
- скобка после `!` (и любого не-словного символа) распознаётся как группирующая, а не вызов функции — раньше `!(...)` ломала отступы;
- срез висящих пробелов в конце строк (`trimEnd` в `#flush`);
- значимые пробелы внутри строковых литералов сохраняются.
Покрыто юнит-тестами (`test/differ/bpmn/condition-formatter.test.js`). Задача закрыта.

### 2026-06-11 · — · (ветка `fix/backlog-autonomous-fixes`)

При сравнении `bpmn:conditionExpression` незначимые пробелы и переносы строк вне строковых литералов теперь игнорируются (`bpmn-xml-comparator.js#normalizeExpression`). Осталось: улучшить читаемость длинных/сложных expression при отображении.
