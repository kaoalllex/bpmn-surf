// Every read of GitHub's DOM (REFAC-0004) — the fragile part, kept in one
// place like gitlab-dom-scraper.js. Two "Files changed" UIs are live: the
// classic one (signed-out and opted-out users, /pull/N/files) and the React
// one signed-in users get by default (/pull/N/changes). Selectors prefer data-*
// attributes: the React UI's class names are hashed per build.
class GitHubDomScraper {
    static #CLASSIC_HEADER = 'div.file-header[data-path]';
    static #CLASSIC_ACTIONS = ':scope > .file-actions > .d-flex';
    static #RENAME_SEPARATOR = ' → ';
    // The comparison's SHAs come from the progressive diff loader (large PRs) or the
    // file-tree menu: sha2 is the head, sha1 the merge base the page diffs against
    // (base_sha and start_commit_oid are equal to it; none of them is the base branch tip).
    static #CLASSIC_COMPARISON = '[src*="/diffs?"][src*="sha2="], [data-url*="/diffs?"][data-url*="sha2="], [src*="/show_toc?"][src*="sha2="]';
    static #SHA = /^[0-9a-f]{40}$/;
    // New UI: div#diff-<sha256(path)>; other ids share the prefix
    // (diff-placeholder, diff-file-tree-filter, …).
    static #NEW_UI_BLOCK_ID = /^diff-[0-9a-f]{64}$/;
    static #RENAMED_TO = ' renamed to ';

    fileBlocks(doc) {
        const blocks = [];
        for (const header of doc.querySelectorAll(GitHubDomScraper.#CLASSIC_HEADER)) {
            const actions = header.querySelector(GitHubDomScraper.#CLASSIC_ACTIONS);
            if (actions) {
                blocks.push({ path: header.getAttribute('data-path'), oldPath: GitHubDomScraper.#classicOldPath(header), actions, before: null });
            }
        }
        for (const block of doc.querySelectorAll('div[id^="diff-"]')) {
            const header = GitHubDomScraper.#NEW_UI_BLOCK_ID.test(block.id) &&
                block.querySelector('[data-diff-header-wrapper]');
            const more = header && [...header.querySelectorAll('button[aria-haspopup="true"]')].pop();
            const names = more && GitHubDomScraper.#newUiNames(header);
            if (names) {
                blocks.push({ ...names, actions: more.parentElement, before: more });
            }
        }
        return blocks;
    }

    // diffEntries: the file diffs of a large PR, loaded for lazyDiffEntry().
    pullRefs(doc, number, diffEntries = null) {
        return this.#classicPullRefs(doc) || GitHubDomScraper.#newUiPullRefs(doc, number, diffEntries);
    }

    // A large PR embeds its file list but no file diffs (GitHub loads each from
    // page_data/diff_entries), and only a file diff carries the merge base:
    // names the file with the smallest diff to load, or null when none is needed.
    lazyDiffEntry(doc, number) {
        const page = GitHubChangesPayload.read(doc, number);
        const comparison = page && page.changes.comparison;
        const headSha = comparison && comparison.viewing === 'FULL' && comparison.fullDiff && comparison.fullDiff.headOid;
        const files = (page && page.changes.diffSummaries) || [];
        if (!GitHubDomScraper.#SHA.test(headSha || '') || (page.changes.diffContents || []).length || !files.length) {
            return null;
        }
        const smallest = files.reduce((a, b) => ((b.linesChanged || 0) < (a.linesChanged || 0) ? b : a));
        return { path: smallest.path, headSha };
    }

    // The breadcrumbs' repository link points at /{owner}/{repo}/tree/{ref}:
    // the one place the page states where a slashed branch name ends. Read
    // live from the DOM — the embedded refInfo JSON goes stale on soft navigation.
    findBlobRef(doc, owner, repo) {
        const link = doc.querySelector('a[data-testid="breadcrumbs-repo-link"]');
        const prefix = `/${owner}/${repo}/tree/`;
        const href = link && link.getAttribute('href');
        return href && href.startsWith(prefix) && href.length > prefix.length
            ? decodeURIComponent(href.slice(prefix.length))
            : null;
    }

    blobActionsAnchor(doc) {
        const raw = doc.querySelector('a[data-testid="raw-button"]');
        return raw ? raw.closest('[data-component="ButtonGroup"]') : null;
    }

    #classicPullRefs(doc) {
        const loader = doc.querySelector(GitHubDomScraper.#CLASSIC_COMPARISON);
        if (!loader) {
            return null;
        }
        const url = new URL(loader.getAttribute('src') || loader.getAttribute('data-url'), 'https://github.com');
        const headSha = url.searchParams.get('sha2');
        const mergeBaseSha = url.searchParams.get('sha1');
        if (!GitHubDomScraper.#SHA.test(headSha || '') || !GitHubDomScraper.#SHA.test(mergeBaseSha || '')) {
            return null;
        }
        const refs = [...doc.querySelectorAll('span.commit-ref[title]')];
        const head = refs.find(span => span.classList.contains('head-ref'));
        const base = refs.find(span => !span.classList.contains('head-ref'));
        const title = doc.querySelector('bdi.js-issue-title');
        return {
            headSha,
            mergeBaseSha,
            headRef: GitHubDomScraper.#branchOf(head),
            baseRef: GitHubDomScraper.#branchOf(base),
            title: title ? title.textContent.trim() : null
        };
    }

    // "owner/repo:branch" — a branch name cannot contain ':'.
    static #branchOf(span) {
        const title = span && span.getAttribute('title');
        return title && title.includes(':') ? title.slice(title.indexOf(':') + 1) : null;
    }

    static #classicOldPath(header) {
        const title = header.querySelector('.file-info a[title]');
        const text = title ? title.getAttribute('title') : '';
        const at = text.indexOf(GitHubDomScraper.#RENAME_SEPARATOR);
        return at > 0 ? text.slice(0, at) : null;
    }

    // The payload's comparison.baseOid is the base branch tip when the PR was
    // last pushed; the merge base GitHub diffs against is each file's oldCommitOid.
    static #newUiPullRefs(doc, number, diffEntries) {
        const page = GitHubChangesPayload.read(doc, number);
        if (!page || (page.changes.comparison && page.changes.comparison.viewing !== 'FULL')) {
            return null;
        }
        const diff = (diffEntries || page.changes.diffContents || []).find(c =>
            GitHubDomScraper.#SHA.test(c.oldCommitOid || '') && GitHubDomScraper.#SHA.test(c.newCommitOid || ''));
        return diff ? {
            headSha: diff.newCommitOid,
            mergeBaseSha: diff.oldCommitOid,
            headRef: page.pull.headBranch || null,
            baseRef: page.pull.baseBranch || null,
            title: page.pull.title || null
        } : null;
    }

    // ponytail: a long non-renamed path without "Expand all lines" and a truncated link text gets
    // no button; upgrade = map the block id to diffSummaries[].pathDigest.
    // The file link's text is the path between U+200E marks; a rename adds a
    // screen-reader span "<old> renamed to <new>" while the visible text is
    // truncated with "…". "Expand all lines" carries the full new path.
    static #newUiNames(header) {
        const link = header.querySelector('h3 a[href^="#diff-"]');
        if (!link) {
            return null;
        }
        const clean = text => text.replace(/\u200e/g, '').trim();
        const sr = link.querySelector('.sr-only');
        const renamed = sr ? clean(sr.textContent).split(GitHubDomScraper.#RENAMED_TO) : [];
        if (renamed.length === 2) {
            return { path: renamed[1], oldPath: renamed[0] };
        }
        const expand = header.querySelector('[data-file-path]');
        const path = expand ? expand.getAttribute('data-file-path') : clean(link.textContent);
        return path && !path.includes('…') ? { path, oldPath: null } : null;
    }
}
