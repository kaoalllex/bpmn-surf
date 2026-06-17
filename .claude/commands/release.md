---
description: Подготовить релиз — бамп версии в manifest.json и коммит
argument-hint: [major|minor|patch] (по умолчанию minor)
allowed-tools: Read, Edit, Bash(git *)
---

Подготовь релиз расширения:

1. Прочитай текущую версию из `manifest.json` (формат `0.MINOR.PATCH`)
2. Подними версию согласно аргументу `$ARGUMENTS` (по умолчанию minor: 0.18.0 → 0.19.0)
3. Это единственный разрешённый случай правки `manifest.json` — меняй ТОЛЬКО поле `version`
4. Подними **ту же версию** в `version.json` (поле `version`) — это публичный источник версии для встроенного нотификатора обновлений (FEAT-0012). Два файла обязаны быть в синхроне; `downloadUrl`/`changelogUrl` в `version.json` не трогай (заполняются один раз после переезда на GitHub)
5. Покажи `git log --oneline` с момента последнего изменения версии (`git log -p --follow manifest.json | grep -n version` или `git log --oneline -15`) и составь краткий changelog
6. Добавь запись в `CHANGELOG.md` сверху: секция `## X.Y.Z` с пунктами changelog'а (этот текст видят пользователи в блоке «Что нового»)
7. Покажи изменение и предложи коммит вида `release: vX.Y.Z` — коммить только после подтверждения
8. Коммит — по правилам `docs/git-workflow.md`: не в master, а в отдельной ветке с последующим MR

Отвечай на русском.
