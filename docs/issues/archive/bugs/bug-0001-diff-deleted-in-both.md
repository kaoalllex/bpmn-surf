---
id: BUG-0001
title: Ошибка диффа для файла, удалённого и в MR, и в master
priority: high
status: done
---

## Постановка

MR закрыт, но определяется некорректно, и файл удалён в обеих ветках → попытка загрузить из master падает с 404, дифф не строится.

## Контекст

- MR: https://gitlab.example.com/example-group/example-service/-/merge_requests/3082/diffs#b0f241e6a57a97ab996588742c2f9197941f9250 (файл `assignMeetingTasks.bpmn`)
- Симптомы: лог `MR is not merged. Target commit id is target branch name: master`; затем:
  ```
  404 (Not Found) — loading mr bpmn xml
  404 (Not Found) — showing branch bpmn xml file
  Uncaught (in promise) Error: branchBpmnXml is undefined
      at requireDefined (utils.js:56:15)
      at showBpmnBranch (bpmn-differ.js:582:5)
      at showBpmnDiff (bpmn-differ.js:2007:15)
  ```
- Связано с задачей про удалённые/новые схемы → [UX-0003]; **реализовывать совместно** —
  в [UX-0003] лежит подробный план (включая случай «обе стороны отсутствуют») и результаты
  исследования кодовой базы по точкам с файлами/строками.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-16 · claude-opus-4-8 · ветка `feature/ux-0003-absent-schemas`

Решено совместно с [UX-0003] (общий код пути «одна/обе стороны отсутствуют»). При обеих пустых
сторонах оркестраторы (`bpmn-differ.js`, `dmn-differ.js`) вместо раннего `return` с пустым белым
экраном вызывают `view.showEmptyState('File not found in either version')` — заглушка `DifferEmptyState`
внутри canvas-ячейки (тулбар с Close/Download остаётся доступным). Краша на `requireDefined` нет
(ранний выход срабатывает раньше). Подробности реализации и список файлов — в истории [UX-0003].

Тесты `npm test` зелёные. DOM-проверка обеих пустых сторон — по ручному чеклисту.
