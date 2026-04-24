# Project Context: BPMN Diff for GitLab

## Purpose
Chrome Extension (Manifest V3) для **визуального сравнения BPMN 2.0 и DMN диаграмм** внутри **GitLab merge requests**.

## Core Functionality
- Detects BPMN/DMN files in GitLab MRs or branch views
- Loads two versions of a diagram (MR branch vs. target branch)
- Renders them with visual highlighting of semantic differences
- Supports comparing with local files

## Architecture

```
Entry Point → App → Providers → Differs → UI
   (main.js)   |      |          |         |
               |      |          |         └─ bpmn-differ.js / dmn-differ.js
               |      |          └─ GitLabRepoProvider (data)
               |      └─ GitLabUIRepoProvider (buttons)
               └─ Dependencies (moddle, reloader, detector)
```

## Key Files

| File | Purpose |
|------|---------|
| `main.js` | Entry point, initializes the App |
| `app.js` | Main application class, orchestrates workflow |
| `bpmn-differ.js` | BPMN diff logic, rendering, highlighting (~2000 lines) |
| `dmn-differ.js` | DMN diff logic, table/DRD visualization |
| `gitlab-repo-provider.js` | GitLab API integration, commit/branch resolution |
| `gitlab-ui-repo-provider.js` | UI button injection, file selection |
| `repo-provider.js` | Base interface for repo providers |
| `ui-repo-provider.js` | Base interface for UI providers |
| `models.js` | DTOs: `FileType`, `ProjectInfo`, `MergeRequestInfo` |
| `utils.js` | Shared helpers: DOM, HTTP, XML parsing, script loading |
| `config.js` | Constants (e.g., `MASTER_BRANCH_NAME`) |
| `file-type-detector.js` | File extension detection |
| `camunda-bpmn-moddle-manager.js` | Camunda moddle loading/caching |
| `master-commit-manager.js` | Master branch commit history with localStorage cache |
| `page-reloader.js` | Page reload protection (max 3 attempts) |
| `styles.css` | UI styles for diff highlighting |

## External Libraries (`libs/`)

- **bpmn-js** — BPMN viewer/modeler
- **dmn-js** — DMN viewer (DRD, decision tables)
- **bpmn-js-properties-panel** — Properties panel for BPMN
- **camunda-bpmn-moddle** — Camunda-specific BPMN metadata

⚠️ **Critical**: `libs/` is external API — **DO NOT MODIFY**.

## Technical Constraints

| Constraint | Description |
|------------|-------------|
| ⚠️ `libs/` | External API — **DO NOT MODIFY** |
| ⚠️ `manifest.json` | Do not change without explicit request |
| ⚠️ No TypeScript | Plain JavaScript (ES6+) only |
| ⚠️ No frameworks | No React, Vue, Angular, etc. |
| ⚠️ No build step | Vanilla JS, no bundlers |
| ⚠️ Chrome MV3 | Target Manifest V3 for extension APIs |
| ⚠️ Backward compatibility | Preserve existing behavior and UX |
| ⚠️ Incremental changes | Small, reviewable diffs |

## Agent Rules

### Agents MAY:
- Refactor existing project files for clarity and maintainability
- Improve internal structure and naming
- Reduce duplication
- Simplify logic
- Improve separation of concerns
- Suggest small, focused improvements

All changes must:
- Preserve existing behavior
- Preserve public-facing UI and user flow
- Keep backward compatibility

### Agents MUST NOT:
- Change extension behavior or UX without explicit request
- Introduce new dependencies
- Modify `manifest.json` unless explicitly instructed
- Touch `libs/` directory
- Rewrite the project architecture wholesale
- Refactor global variables without careful analysis (they store critical state)
- Change the order of script loading in `manifest.json` (dependencies matter)
- Introduce build tools, bundlers, or frameworks

### Refactoring Guidelines

When refactoring:
1. **One concern per change**
2. Keep diffs small and focused
3. Do not mix refactoring with feature changes
4. If unsure — explain assumptions before changing code

If behavior might change:
- Stop
- Explain the risk
- Ask for confirmation

## LSP Integration

LSP включён для этого проекта (`.lsp.json` настроен, `typescript-language-server` доступен).

### Доступные операции LSP

Агенты должны использовать LSP-инструмент для анализа кода:

| Операция | Когда использовать |
|----------|-------------------|
| `goToDefinition` | Узнать, где определена функция/класс/переменная |
| `findReferences` | Найти все использования символа |
| `hover` | Получить информацию о типе/сигнатуре функции |
| `documentSymbol` | Изучить структуру файла (классы, функции) |
| `workspaceSymbol` | Найти символ по имени во всём проекте |
| `diagnostics` | Проверить файл на ошибки |
| `codeActions` | Найти доступные рефакторинги/исправления |

### Анализ внешних библиотек

Для изучения API внешних библиотек (`libs/`, npm-пакеты):

1. **bpmn-js, dmn-js**: Используйте `workspaceSymbol` для поиска классов/методов
2. **Неизвестный API**: Используйте `hover` для получения сигнатур и типов
3. **Поиск примеров**: Используйте `findReferences` чтобы найти, как API используется в проекте

Пример workflow при изучении незнакомого метода:
```
1. goToDefinition → найти реализацию
2. hover → получить сигнатуру и тип
3. findReferences → найти примеры использования
4. diagnostics → убедиться в отсутствии ошибок
```

### Best Practices

- **Всегда проверяйте диагностику** перед внесением изменений
- **Используйте `hover`** для уточнения типов и сигнатур
- **Находите все ссылки** перед рефакторингом публичных API
- **Изучайте определения** перед использованием неизвестных функций

## Default Assumptions

Unless explicitly stated otherwise:
- Read-only behavior is intended
- Performance is "good enough" for MR-sized diagrams
- Simplicity > abstraction

## Current Version
**0.17.1** (from `manifest.json`)
