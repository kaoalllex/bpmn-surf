# BPMN Diff for GitLab — Project Overview

**Chrome Extension (Manifest V3)** для визуального сравнения BPMN 2.0 и DMN диаграмм в GitLab merge requests.

## Quick Links

- **[Project Context](.agent/PROJECT_CONTEXT.md)** — архитектура, файлы, ограничения, правила для агентов
- **[Code Style](.agent/CODE_STYLE.md)** — правила стиля кода и форматирования

## Purpose

Сравнение двух версий BPMN/DMN диаграмм:
- В GitLab MR (ветка MR vs. target branch)
- С локальными файлами

## How It Works

1. **Initialization** (`app.js`) — детектирование BPMN/DMN файлов на страницах GitLab
2. **Data Resolution** (`gitlab-repo-provider.js`) — получение контента через GitLab API
3. **UI Integration** (`gitlab-ui-repo-provider.js`) — кнопки "Show schema/decision diff"
4. **Diff Rendering** (`bpmn-differ.js`, `dmn-differ.js`) — визуализация с подсветкой изменений

## Key Features

- Smart commit resolution для merged MR
- LocalStorage кэширование (master commit history, file content)
- Zoom/pan controls, "Fit view", "Switch branch"
- Download текущей версии файла
- Toggle highlighting, properties panel
