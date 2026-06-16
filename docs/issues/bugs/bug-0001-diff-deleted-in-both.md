---
id: BUG-0001
title: Ошибка диффа для файла, удалённого и в MR, и в master
priority: high
status: open
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
