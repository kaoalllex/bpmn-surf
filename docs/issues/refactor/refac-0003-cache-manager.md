---
id: REFAC-0003
title: Выделить отдельный cache manager
priority: low
status: done
---

## Постановка

Выделить отдельный cache manager.

## Контекст

- Возможное продолжение: перевести на `SingleEntryCache` кэши `init` и `initChangeInfo`.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-11 · — · (ветка `fix/backlog-autonomous-fixes`)

Кэш `getTargetCommitId` вынесен в класс `SingleEntryCache` (в том же `gitlab-repo-provider.js` — новый файл потребовал бы правки `manifest.json`).
