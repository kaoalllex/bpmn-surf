---
id: BUG-0016
title: Плашка перехода к хендлеру дублируется на элементе с внешней подписью
priority: medium
status: done
---

## Постановка

На элементе, у которого хендлер затронут в текущем MR (постоянная цветная плашка
`</>`), плашка отображается **дважды**, если у элемента есть внешняя подпись
(external label). Обнаружено на `OrderScoringRejectReasonTask` (хендлер добавлен
в MR). Должна показываться один раз.

## Контекст

### Root cause

bpmn-js хранит внешнюю подпись элемента как **отдельный элемент реестра**
(`<id>_label`) с тем же `businessObject`, что и у элемента-хоста (поле
`labelTarget` указывает на хост). `HandlerNavigator.refreshChangedBadges` обходит
**все** элементы `elementRegistry.getAll()` и для каждого зовёт `#getHandlerKey`.
Подпись возвращает тот же ключ хендлера, что и хост → постоянная плашка добавляется
и на хост, и на его подпись. Диагностика на странице differ'а:

```js
[...document.querySelectorAll('.handler-link')]
  .map(el => el.closest('.djs-overlays')?.getAttribute('data-container-id'))
// → ['OrderScoringRejectReasonTask', 'OrderScoringRejectReasonTask_label', ...]
```

Путь плашки-по-выделению этим не страдал: он уже нормализует id
(`elemId.replace(/_label$/, "")` в `#onSelectedElementChanged`) и берёт элемент-хост.
Поэтому баг виден только для затронутых в MR хендлеров (постоянные плашки), а не
при простом просмотре/выделении.

Внешние подписи в bpmn-js получают `Event | Gateway | DataStore/DataObjectReference |
DataInput/Output | SequenceFlow | MessageFlow | Group`; у обычных task'ов подписи
нет (имя внутри фигуры), поэтому большинство service task'ов баг не задевал. Затронут
любой элемент с внешней подписью — в т.ч. message-события из [FEAT-0018].

### Решение

В `HandlerNavigator.#getHandlerKey` возвращать `null` для label-элементов
(`elem.labelTarget` задан) — чтобы оба пути добавления плашки (постоянный и
по выделению) одинаково игнорировали подписи. Минимальная правка в одной точке,
переиспользуемой обоими путями.

### Затронутые файлы

- `src/differ/navigation/handler-navigator.js` — гейт по `elem.labelTarget` в `#getHandlerKey`.
- `test/support/scope.js` — `HandlerNavigator` добавлен в харнесс (был непокрыт).
- `test/structure/source-layout.test.js` — убран из `UNTESTED_BY_DESIGN`.
- `test/differ/navigation/handler-navigator.test.js` — регресс-тесты `refreshChangedBadges`.

### Связи

- [FEAT-0018] — обнаружен при проверке плашки на message-событиях; фикс важен и для них
  (у событий всегда есть внешняя подпись).
- [FEAT-0003], [FEAT-0004] — механизм плашки хендлера.

## История работы

### 2026-06-18 · claude-opus-4-8 · ветка `feature/feat-0018-handler-badge-message-event`

Локализован root cause (label-элемент делит `businessObject` с хостом; постоянная
плашка добавлялась обоими). Фикс — гейт по `elem.labelTarget` в `#getHandlerKey`.
`HandlerNavigator` заведён в тестовый харнесс, добавлены 4 регресс-теста
`refreshChangedBadges` (хост+подпись → одна плашка; message-событие+подпись → одна;
два разных хоста с одним хендлером → две, без ложного дедупа; нет изменений → ноль).
Без фикса падают 2 из 4; с фиксом — все. `npm test` зелёный (782 теста).
