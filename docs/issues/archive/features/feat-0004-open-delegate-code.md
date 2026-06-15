---
id: FEAT-0004
title: Открывать вкладку с кодом делегата
priority: medium
status: done
---

## Постановка

По клику на сервис-таску открывать код делегата из текущего выбранного бранча (master или MR).

## Контекст

- Связано с [FEAT-0003].
- Делегаты/Java — см. [FEAT-0003].
- Сделано: открытие кода для классических делегатов (`camunda:class`/`delegateExpression`) и Java-хендлеров — через общий с FEAT-0003 локатор (резолв — `resolveLocation(key, ref)` → `#searchClassDeclarationLocation`). Детали реализации — в [FEAT-0003], раздел «План доработки» и История.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-15 · claude-opus-4-8 · (ветка `feature/delegate-change-highlight`)

Открытие кода делегатов реализовано вместе с подсветкой [FEAT-0003] на общем namespaced-ключе. Клик по бейджу делегата (`camunda:class` / `delegateExpression="${bean}"`, Kotlin и Java) открывает: для изменённого в MR хендлера — его diff в MR; для неизменённого — объявление класса на текущей показанной версии (резолв `resolveLocation('class:<Name>', ref)` → `#searchClassDeclarationLocation` — поиск `class <Name>` в хендлер-файле без требования аннотации), при неудаче — fallback на страницу поиска GitLab (термин из ключа через `termFromKey`). External task — без регресса. Детали и ограничения — в Истории [FEAT-0003].

### 2026-06-14 · — · (ветка `feature/delegate-change-highlight`)

Сделано для external task на Kotlin: клик по overlay-плашке открывает хендлер. Для затронутого в этом MR хендлера — его diff в MR (anchor по SHA-1 пути файла), причём навигируется уже открытая исходная вкладка MR (`window.opener`) с переключением на неё (`window.open(url, name)` по временному `window.name` opener'а — `opener.focus()` в Chrome не переключает вкладку надёжно), а не создаётся новая (fallback на новую вкладку, если opener закрыт); для остальных — код на текущей показанной версии в новой вкладке (резолв «топик → файл:строка» через GitLab project blob-search API `handler-locator.js#resolveLocation`, при неудаче — fallback на страницу поиска GitLab). Работает и в MR-, и в branch-режиме.

Проверено: project blob-search на `gitlab.example.com` доступен (basic search, без Elasticsearch; параметр `ref` работает) — основной путь резолва валиден, fallback на UI-поиск остаётся страховкой.
