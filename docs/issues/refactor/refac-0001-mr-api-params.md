---
id: REFAC-0001
title: Получать параметры через GitLab MR API; улучшить поиск хеша коммита
priority: high
status: in-progress
---

## Постановка

Получать параметры merge request через `GET /api/v4/projects/{project}/merge_requests/{mr}/` вместо парсинга из HTML и эвристик. Сделать поиск коммита надёжнее (меньше случаев «дифф не построился из-за неверного коммита»).

## Контекст

Многое сейчас парсится из HTML или подбирается эвристикой — перейти на MR API.

- Переделать: `getMrCommitId`, `getMrSourceAndTargetBranchName`, `getTargetCommitId` (в текущем коде — `getSourceCommitId`, `getChangeBranchNames`, `getTargetCommitId` в `gitlab-repo-provider.js`).

### Принятый дизайн (подготовка выполнена, см. Историю)

Переход на API задуман как **отдельная реализация интерфейса `RepoProvider`**, а DOM/эвристический путь остаётся **фолбэком** (до отладки API, затем подлежит удалению целиком):

- **Whole-provider fallback.** `FallbackRepoProvider` (`fallback-repo-provider.js`) держит упорядоченный список реализаций и на `init()` выбирает первую доступную и успешно проинициализировавшуюся, далее делегирует ей все вызовы. Удаление DOM-пути в будущем = убрать `GitLabRepoProvider` из цепочки в `repo-provider-factory.js` и удалить класс.
- **Шов уже создан.** `GitLabApiRepoProvider` (`gitlab-api-repo-provider.js`) стоит в цепочке **перед** `GitLabRepoProvider`, но `isAvailable()` возвращает `false`, методы кидают «not implemented» → поведение не изменено.
- **Ядро развязано от GitLab.** `App` работает только через нейтральные интерфейсы; имена методов `RepoProvider` нейтральны (`isChangeViewActive`, `initChangeInfo`, `getChangeInfo`, `getChangeBranchNames`, `getSourceCommitId`, `getTargetCommitId`). Параметры differ-страницы нейтральны (`sourceRef`/`targetRef`/`sourceBranchName`/`changeRequestId`) + `platform`-дескриптор `{kind,projectUrl,hostUrl,projectId}` (`diff-params-builder.js`, `DifferParams`).

### TODO следующей сессии (собственно REFAC-0001)

1. Реализовать `GitLabApiRepoProvider` через `GET /api/v4/projects/{id}/merge_requests/{iid}`:
   - `getSourceCommitId` ← `diff_refs.head_sha`;
   - `getTargetCommitId` ← `diff_refs.base_sha`/`start_sha` (надёжнее текущих эвристик с merged/atom-feed);
   - `getChangeBranchNames` ← `source_branch`/`target_branch`;
   - `getChangeInfo` (title, iid, state) ← из того же ответа;
   - `isChangeViewActive` — по URL (как сейчас), либо валидировать через API.
   - `getProjectInfo`/`init` — переиспользовать резолв project id.
2. Включить `isAvailable()` и поставить провайдер первым (он уже первый в `createRepoProvider`).
3. DOM-`GitLabRepoProvider` оставить фолбэком; завести отдельную задачу на его удаление после отладки API.
4. Связи: `[REFAC-0004]` (полная нейтрализация DTO `MergeRequestInfo`/`MergeRequestBranchNames` и абстракция загрузчика контента differ-страницы — там), `[REFAC-0002]` (декомпозиция — частично продвинута выносом `DiffParamsBuilder`).

### Промпт для старта реализации (новая сессия)

Реализацию лучше вести в свежей сессии (чистый контекст; это поведенческая фаза — скилл `feature`, не `refactor`). Заготовка промпта:

```
Реализуй REFAC-0001 — детали и принятый дизайн уже в
docs/issues/refactor/refac-0001-mr-api-params.md (раздел «TODO следующей сессии»).

Кратко: наполнить GitLabApiRepoProvider (gitlab-api-repo-provider.js) резолвом
через GET /api/v4/projects/{id}/merge_requests/{iid} и включить его как primary
в цепочке FallbackRepoProvider; DOM-GitLabRepoProvider оставить фолбэком.

Прежде чем писать код:
1. Изучи текущий GitLabRepoProvider и формат ответа MR API (diff_refs.head_sha/
   base_sha/start_sha, source_branch/target_branch, title, state).
2. Покажи план: какие поля API на какие методы интерфейса ложатся, как
   обрабатываем не-merged vs merged MR, где фолбэк на DOM срабатывает.
3. Уточни у меня развилки (например, проверять ли MR API доступность токеном)
   перед реализацией.

Юнит-тесты — обязательны: на маппинг ответа API → методы провайдера (мокать
загрузку), и не сломать существующие.
```

Советы: верифицировать на живых merged/не-merged MR (есть тестовый проект `dev.example/bpmn-diff-test` на gitlab.com); реализация API + включение primary — один MR; удаление DOM-пути после отладки — отдельной задачей; не смешивать с `[REFAC-0002]`/`[REFAC-0004]`.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->

### 2026-06-14 · claude-opus-4-8 · ветка `refactor/platform-abstraction-seams`

Подготовка к задаче (behavior-preserving, без смены источника данных; все 187 юнит-тестов зелёные). Три шага:
1. Шов выбора провайдера: `repo-provider-factory.js` (`createRepoProvider`/`createUIRepoProvider`), DI в `App`, `FallbackRepoProvider` (whole-provider fallback), скелет `GitLabApiRepoProvider`.
2. Нейтральный словарь параметров differ-страницы + `platform`-дескриптор; вынесен `DiffParamsBuilder`; `DifferParams` и потребители переведены на нейтральные имена; вложенный differ Call Activity — через `DifferParams.toNestedDifferParams`.
3. Нейтральные имена методов `RepoProvider` (change-request словарь).

Новые тесты: `test/fallback-repo-provider.test.js`, `test/diff-params-builder.test.js`; обновлён `test/differ-params.test.js`. Осталось — реализация `GitLabApiRepoProvider` через MR API (см. TODO выше).
