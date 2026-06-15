---
id: REFAC-0010
title: Общая база differ'ов — убрать параллельное дублирование BPMN/DMN
priority: medium
status: open
---

## Постановка

`bpmn-differ.js`/`dmn-differ.js` и `bpmn-differ-view.js`/`dmn-differ-view.js` —
параллельные структуры с общими концепциями (загрузка двух версий, индикатор
ветки, switch branch, download, message-bootstrap, layout header'а), но делят
только листовые классы (`DifferParams`, `DiagramVersions`, `BranchIndicator`,
`DiffType`), не общую базу оркестратора/вью.

Симптом недостающей абстракции: документация (`CLAUDE.md`, `docs/testing.md`,
`docs/conventions.md`) вынуждена многократно повторять «меняя общие классы,
проверяй и BPMN-, и DMN-differ» — ручная дисциплина заменяет то, что должен
гарантировать общий базовый класс / шаблонный метод.

Предложение: выделить базовый `DifferBase` (общий поток `show()`: bootstrap,
загрузка версий, switch/ download, индикатор ветки) и `DifferViewBase` (общий
layout/header/footer), оставив в наследниках только специфику рендера диаграммы
(bpmn-js modeler vs. dmn-js viewer) и сравнения. Это снизит дублирование и риск
«поправил один, забыл второй».

Поведение не меняется. Делать маленькими шагами; на каждом — проверять оба типа
diff'а вручную по чеклисту (`docs/testing.md`).

## Контекст

- Затронуто: `src/differ/bpmn/bpmn-differ.js`, `src/differ/dmn/dmn-differ.js`,
  `src/differ/bpmn/bpmn-differ-view.js`, `src/differ/dmn/dmn-differ-view.js`.
- Связано с [REFAC-0009] (разгрузка `BpmnDiffer`) — естественный предшествующий
  или совместный шаг.
- Структурный тест `test/structure/message-id.test.js` уже фиксирует совпадение
  message-id между scope'ами; общая база сократит и эту поверхность.

## История работы
