---
description: Подготовить релиз — бамп версии в manifest.json и коммит
argument-hint: [major|minor|patch] (по умолчанию minor)
allowed-tools: Read, Edit, Bash(git *)
---

Подготовь релиз расширения:

1. Прочитай текущую версию из `manifest.json` (формат `0.MINOR.PATCH`)
2. Подними версию согласно аргументу `$ARGUMENTS` (по умолчанию minor: 0.18.0 → 0.19.0)
3. Это единственный разрешённый случай правки `manifest.json` — меняй ТОЛЬКО поле `version`
4. Покажи `git log --oneline` с момента последнего изменения версии (`git log -p --follow manifest.json | grep -n version` или `git log --oneline -15`) и составь краткий changelog
5. Покажи изменение и предложи коммит вида `release: vX.Y.Z` — коммить только после подтверждения

Отвечай на русском.
