# Тестирование

## Юнит-тесты

Есть юнит-тесты на изолированные классы differ-страницы. Запуск: **`npm test`** (~0.5 сек, прогонять после любых изменений в покрытых файлах и обязательно перед каждым push — см. docs/git-workflow.md). Раннер — встроенный `node:test`; единственная dev-зависимость — `jsdom` (DOM/DOMParser для Node) — в расширение **не попадает**, `manifest.json` не затрагивается.

Отдельного файла-отчёта нет: `node:test` печатает упавшие проверки (assertion diff + стек) прямо в вывод прогона. Не перезапускай тесты, чтобы «посмотреть ошибку» — детали уже есть в выводе предыдущего запуска, читай их оттуда. Повторный прогон оправдан только после изменений в коде/тестах.

Устройство (`test/`):
- Раскладка тестов **зеркалит `src/`**: тест для `src/<путь>/<имя>.js` лежит в `test/<путь>/<имя>.test.js` (напр. `src/differ/bpmn/bpmn-xml-comparator.js` → `test/differ/bpmn/bpmn-xml-comparator.test.js`). Один файл-кода ↔ один (или несколько) файл-теста по тому же пути — где искать/куда класть тест, выводится из пути исходника без догадок. Общая инфраструктура (`support/`, `fixtures/`) — в корне `test/`, не зеркалится. Раннер находит тесты на любой вложенности через glob `test/**/*.test.js`.
- Подключение харнесса — каноничной формой `require('#scope')` (subpath import из `package.json#imports`, резолвится в `test/support/scope.js`), а не относительным путём: импорт одинаков на любой глубине дерева. Фикстуры читаются хелпером `fixture(name)` из `scope.js` — путь к ним от расположения теста не зависит.
- `test/support/scope.js` — vm-харнесс: исполняет прод-файлы в одном jsdom vm-контексте в порядке `loadScripts` (имитация общего глобального scope differ-страницы), **не изменяя прод-код**. Чтобы протестировать новый класс: добавь его файл в `SCOPE_FILES` и имя в `EXPORTED_NAMES`. Файлы с side effects при загрузке (`bpmn-differ.js`, `dmn-differ.js` — авто-вызов `main()`) в харнесс добавлять нельзя.
- `test/fixtures/` — пары BPMN/DMN XML (golden-тесты компараторов: `base.bpmn` + варианты; `camunda-base.bpmn` — база для точечных вариантов через string replace прямо в тесте), `dmn-table.html` (разметка таблицы dmn-js для `DmnDiffPainter`) и `properties-panel.html` (разметка bio-properties-panel для `PropertiesPanelHighlighter`). Новый случай сравнения = новая фикстура-вариант (или replace-вариант от `camunda-base.bpmn`) + короткий тест.
- Объекты из vm-контекста имеют прототипы своего realm'а: перед `assert.deepEqual` оборачивай массивы в `Array.from`, Map — в `mapToObject` из scope.js.
- В DOM-тестах все элементы, которые код ищет через `doWithAttempts`, должны заранее присутствовать в фикстуре: при отсутствии элемента код уйдёт в ретраи с задержками (~1.5 сек) — тест станет медленным. Сценарии «элемент не найден» строй так, чтобы до DOM-поиска дело не доходило.
- Отладочный приём: `scope.js` можно `require`-ить из одноразового node-скрипта вне тестов, чтобы прогнать компаратор на реальной паре схем и посмотреть полный diff-результат (так сверяется ожидаемое поведение перед фиксацией его в тестах).
- Тесты фиксируют **текущее** поведение, включая причуды. Менять ожидания можно только вместе с осознанным изменением поведения.

Покрыто: `ConditionFormatter`, `FileTypeDetector`, `DifferParams`, `BpmnXmlComparator` (включая маппинг диффов на группы панели свойств и задокументированные слепые зоны: retarget стрелок, перевязка incoming/outgoing, атрибут `default`), `PropertiesPanelHighlighter`, `DmnXmlComparator`, `DmnDiffPainter`, `GitLabRepoProvider.findSelectedFilePath` (legacy-разметка `[data-path]` и rapid diffs `<diff-file>`), `GitLabRepoProviderBase` (init + резолв project id с кэшем), `GitLabUrlParser`, `GitLabDomScraper`, `MergedMrCommitResolver` (резолв с инъекцией коллабораторов — без `fetch`/`localStorage`), `SingleEntryCache`, `GitLabApiRepoProvider`, `GitLabUIRepoProvider.addButton` (контейнеры кнопки для self-managed и gitlab.com), чистые функции `utils.js`.

DOM-разметку GitLab в тестах провайдеров (`gitlab-repo-provider.test.js`, `gitlab-ui-repo-provider.test.js`) строим прямо в тесте маленькими хелперами — она тривиальна и параметризуется; фикстуры-файлы держим только для сложных сторонних DOM (`dmn-table.html`, `properties-panel.html`).

## CI

CI-пайплайна пока нет (см. docs/git-workflow.md, раздел «CI») — единственная защита от красных тестов в master — локальный прогон перед push.

## Ручная проверка

Интеграционных автотестов нет. Проверка — ручная: загрузить распакованное расширение через `chrome://extensions` (Developer mode → Load unpacked) и проверить на странице GitLab MR / файла. Перед коммитом мысленно проверить, что порядок скриптов и поведение не сломаны.

- Быстрая проверка синтаксиса: `for f in *.js; do node --check "$f"; done`
- После изменений в общих классах differ-страницы (`differ-params.js`, `diagram-versions.js`, `branch-indicator.js`, `diff-type.js`, `utils.js`) **обязательно проверить и BPMN-, и DMN-diff**
- Чеклист differ-страницы: подсветка diff'ов, switch branch, highlight on/off, таблица изменений + клик по строке, условия sequenceFlow в панели свойств, zoom/pan/fit, hide properties, download, dive-in в Call Activity, branch-only режим (без MR)
