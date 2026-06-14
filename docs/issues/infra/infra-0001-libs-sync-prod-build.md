---
id: INFRA-0001
title: Механизм подтягивания либ и production-сборка
priority: medium
status: open
---

## Постановка

- Подтягивать либы через package.json/node.
- Удалить лишние файлы библиотек, используемые заменить на минифицированные (минифицировать либу панели свойств и скрипты плагина).
- Сейчас dmn-js подключается dev-сборкой (`dmn-viewer.development.js`): на production.min падает ошибка `It looks like you're using a minified copy of the development build of Inferno...` — разобраться при переходе на минифицированные либы.

## Контекст

- Код: `utils.js` (подключение `dmn-viewer.development.js`).

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->
