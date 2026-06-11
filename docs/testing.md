# Тестирование

## Юнит-тесты

Есть юнит-тесты на изолированные классы differ-страницы. Запуск: **`npm test`** (~0.5 сек, прогонять после любых изменений в покрытых файлах и обязательно перед каждым push — см. docs/git-workflow.md). Раннер — встроенный `node:test`; единственная dev-зависимость — `jsdom` (DOM/DOMParser для Node) — в расширение **не попадает**, `manifest.json` не затрагивается.

Отдельного файла-отчёта нет: `node:test` печатает упавшие проверки (assertion diff + стек) прямо в вывод прогона. Не перезапускай тесты, чтобы «посмотреть ошибку» — детали уже есть в выводе предыдущего запуска, читай их оттуда. Повторный прогон оправдан только после изменений в коде/тестах.

Устройство (`test/`):
- `test/support/scope.js` — vm-харнесс: исполняет прод-файлы в одном jsdom vm-контексте в порядке `loadScripts` (имитация общего глобального scope differ-страницы), **не изменяя прод-код**. Чтобы протестировать новый класс: добавь его файл в `SCOPE_FILES` и имя в `EXPORTED_NAMES`. Файлы с side effects при загрузке (`bpmn-differ.js`, `dmn-differ.js` — авто-вызов `main()`) в харнесс добавлять нельзя.
- `test/fixtures/` — пары BPMN/DMN XML (golden-тесты компараторов: `base.bpmn` + варианты) и `dmn-table.html` (разметка таблицы dmn-js для `DmnDiffPainter`). Новый случай сравнения = новая фикстура-вариант + короткий тест.
- Объекты из vm-контекста имеют прототипы своего realm'а: перед `assert.deepEqual` оборачивай массивы в `Array.from`, Map — в `mapToObject` из scope.js.
- Тесты фиксируют **текущее** поведение, включая причуды (например, дублирование property group при изменении атрибута — см. комментарий в `bpmn-xml-comparator.test.js`). Менять ожидания можно только вместе с осознанным изменением поведения.

Покрыто: `ConditionFormatter`, `FileTypeDetector`, `DifferParams`, `BpmnXmlComparator`, `DmnXmlComparator`, `DmnDiffPainter`, чистые функции `utils.js`.

## CI

CI-пайплайна пока нет (см. docs/git-workflow.md, раздел «CI») — единственная защита от красных тестов в master — локальный прогон перед push.

## Ручная проверка

Интеграционных автотестов нет. Проверка — ручная: загрузить распакованное расширение через `chrome://extensions` (Developer mode → Load unpacked) и проверить на странице GitLab MR / файла. Перед коммитом мысленно проверить, что порядок скриптов и поведение не сломаны.

- Быстрая проверка синтаксиса: `for f in *.js; do node --check "$f"; done`
- После изменений в общих классах differ-страницы (`differ-params.js`, `diagram-versions.js`, `branch-indicator.js`, `diff-type.js`, `utils.js`) **обязательно проверить и BPMN-, и DMN-diff**
- Чеклист differ-страницы: подсветка diff'ов, switch branch, highlight on/off, таблица изменений + клик по строке, условия sequenceFlow в панели свойств, zoom/pan/fit, hide properties, download, dive-in в Call Activity, branch-only режим (без MR)
