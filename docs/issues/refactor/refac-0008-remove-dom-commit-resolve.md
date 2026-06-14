---
id: REFAC-0008
title: Удалить DOM-эвристики резолва коммитов MR после обкатки API
priority: medium
status: open
---

## Постановка

После того как резолв через GitLab MR API (`GitLabApiRepoProvider`, `[REFAC-0001]`) подтвердит надёжность на практике (включая `gitlab.example.com`) — удалить DOM/эвристический путь резолва коммитов MR, который сейчас оставлен фолбэком.

Под удаление (в `gitlab-repo-provider.js`, если не используется branch-view/детекцией):

- `#getMrLastCommitId` (парсинг `commits.json`);
- `#findDiffHeadSha` (regex по `data-noteable-data`);
- `#isMrMerged` (DOM-бейдж «Merged» + проверка через MR API);
- `#findTargetBranchPreviousCommitId` / `#findTargetBranchCommitIdByTitle` / `#loadFilteredByTitleMasterCommitEntries` (atom-feed);
- `master-commit-manager.js` (`MasterCommitManager`) — если больше нигде не нужен;
- старая логика `getSourceCommitId`/`getTargetCommitId`/`initChangeInfo`/`getChangeBranchNames` в DOM-провайдере.

Решить попутно: оставлять ли `GitLabRepoProvider` как whole-provider фолбэк в `repo-provider-factory.js` или схлопнуть в один провайдер (тогда нужно вынести в общую базу/хелперы DOM/URL-методы детекции, которые у API-провайдера наследуются: `findSelectedFilePath`, `getBranchFileType`, `extractBranchCommitIdAndFilePath`, `isChangeViewActive`, резолв project id).

## Контекст

- Породившая задача: `[REFAC-0001]` (переход на MR API; DOM-путь оставлен фолбэком осознанно).
- Не путать с `[REFAC-0007]` (удаление старого резолва CallActivity-схемы — другой механизм).
- Удалять только после реальной обкатки API на проде; пока `FallbackRepoProvider` держит DOM-провайдер запасным на случай, если на MR-странице API не отдаёт `diff_refs`.

## История работы

<!-- Каждая сессия ИИ над задачей — отдельная запись по шаблону ниже.
     Новые записи добавляй сверху (свежие первыми). -->
