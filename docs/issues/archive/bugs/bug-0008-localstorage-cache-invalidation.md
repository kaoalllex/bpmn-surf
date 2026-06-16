---
id: BUG-0008
title: Проверить инвалидацию кэша в localStorage
priority: medium
status: done
---

## Постановка

Есть сценарии, когда кэш нужно инвалидировать — пересмотреть логику кэширования.

## Контекст

Связано с [REFAC-0008] — fallback `ProcessFileIndex` в `CallActivityLocator`
планируется убрать после обкатки blob-search.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-16 · claude-opus-4-8 · ветка `fix/bug-0008-cache-review`

Проверил всю работу с локальными кэшами. **Реальной проблемы инвалидации в
localStorage нет** — оба дисковых кэша самоочищаются:

- `ProcessFileIndex` (`process-file-index.js`): ключ содержит `latestCommitId`
  (HEAD ветки из API); при сдвиге ветки ключ меняется, старые ключи с тем же
  префиксом удаляются.
- `MasterCommitManager` (`master-commit-manager.js`): TTL 1 час + лимит 30 страниц.
- `PageReloader`: sessionStorage + явный `reset()`.

In-memory кэши (`fileCache`, `SingleEntryCache`, Map'ы локаторов) ключуются по
полному URL/ref → межверсионного загрязнения нет. Сценарий «устаревший кэш
переживает смену коммита» не воспроизводится — закрываю как неактуальный.

Попутно сделал три мелочи, найденные при ревью:

1. **Fallback `ProcessFileIndex` теперь учитывает ref.** Раньше индекс строился
   жёстко с `targetRef`, а `findProcessFileParams()` не принимал ref — при
   dive-in из MR-версии (показан `sourceRef`) fallback искал файл в `targetRef`.
   Прокинул `ref` через `CallActivityLocator.resolveProcessFile` →
   `findProcessFileParams(processId, ref)`; состояние индекса теперь per-ref.
   Ключи localStorage для дефолтного ref не изменились (обратная совместимость).
2. **`fileCache` (`utils.js`) ограничен** 200 записями с FIFO-вытеснением — больше
   не растёт без предела на долгоживущей странице.
3. Поправил вводящий в заблуждение комментарий про формат ключа в `#getLocalStorageKey`.
