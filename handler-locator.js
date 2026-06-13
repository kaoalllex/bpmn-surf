// Locates the source code of service-task handlers and detects which of them
// changed in the current merge request.
//
// Currently supports Kotlin handlers of external tasks: a handler class is
// annotated with @ExternalTaskSubscription("<topic>"), and a service task in
// the BPMN references the same topic via camunda:topic. The "key" linking a
// task to its code is the topic string.
//
// Extension points (intentionally isolated for future work):
//  - languages: add file extensions to #HANDLER_FILE_EXTENSIONS (e.g. '.java');
//    the subscription regex is already language-agnostic.
//  - implementation kinds: external tasks use the topic as the key; Java
//    delegates (camunda:class / camunda:delegateExpression) will use the class
//    name as the key — a sibling locator/strategy can reuse #search/#scan.
//  - depth: change detection currently flags only the handler file itself;
//    transitive dependency analysis is left as a future enhancement
//    (see ISSUES.md FEAT-0003).
class ExternalTaskHandlerLocator {
    // File extensions treated as handler sources. Add '.java' to also cover Java.
    static #HANDLER_FILE_EXTENSIONS = ['.kt'];

    // Matches @ExternalTaskSubscription("topic"), tolerating whitespace/newlines
    // and an optional named argument (value = "..." / topicName = "...").
    static #SUBSCRIPTION_TOPIC_REGEX =
        /@?ExternalTaskSubscription\s*\(\s*(?:[A-Za-z_]+\s*=\s*)?"([^"]+)"/g;

    #projectUrl;
    #projectHostUrl;
    #projectId;

    // Cache of resolveLocation() results, keyed by `${ref}\n${topic}`.
    #locationCache = new Map();

    constructor(projectUrl, projectHostUrl, projectId) {
        this.#projectUrl = projectUrl;
        this.#projectHostUrl = projectHostUrl;
        this.#projectId = projectId;
    }

    /**
     * Extracts all external-task topics declared via @ExternalTaskSubscription
     * in the given source file content.
     * @returns {string[]} topics (possibly empty)
     */
    static extractSubscriptionTopics(fileContent) {
        const topics = [];
        if (!fileContent) {
            return topics;
        }
        const regex = new RegExp(ExternalTaskHandlerLocator.#SUBSCRIPTION_TOPIC_REGEX);
        let match;
        while ((match = regex.exec(fileContent)) !== null) {
            topics.push(match[1]);
        }
        return topics;
    }

    /**
     * Whether the given repository path is a handler source file.
     */
    static isHandlerFile(filePath) {
        return ExternalTaskHandlerLocator.#HANDLER_FILE_EXTENSIONS.some(ext => filePath.endsWith(ext));
    }

    /**
     * Returns a map "topic -> {filePath, diffType}" for every handler file
     * touched by the MR. diffType is one of 'added' / 'changed' / 'removed'
     * (matching DiffType.name) and drives the badge colour: a new handler file
     * is 'added', a modified/renamed one is 'changed', a deleted one is
     * 'removed'. Only the handler files listed in the MR diff are downloaded and
     * scanned, so no repository-wide search runs.
     *
     * An added/modified file is scanned at the MR head (mrRef); a deleted file
     * no longer exists there, so it is scanned at the target branch (branchRef),
     * which is also the version where its service task is still shown. Deleted
     * handlers are therefore detected only when branchRef is supplied.
     * @returns {Promise<Map<string, {filePath: string, diffType: string}>>}
     */
    async findChangedHandlers(mrIid, mrRef, branchRef) {
        const handlers = new Map();
        if (!mrIid || !mrRef) {
            return handlers;
        }

        const changes = await this.#fetchMrChanges(mrIid);
        const handlerChanges = ExternalTaskHandlerLocator.extractHandlerFileChanges(changes);
        console.debug(`changed handler files (${handlerChanges.length}):`, handlerChanges);

        for (const { filePath, scanPath, diffType } of handlerChanges) {
            const scanRef = diffType === 'removed' ? branchRef : mrRef;
            if (!scanRef) {
                continue;
            }
            const content = await loadFileContent(`${this.#projectUrl}/-/raw/${scanRef}/${scanPath}`, false);
            for (const topic of ExternalTaskHandlerLocator.extractSubscriptionTopics(content)) {
                handlers.set(topic, { filePath, diffType });
            }
        }
        console.debug(`changed handler topics (${handlers.size}):`, handlers);
        return handlers;
    }

    /**
     * Resolves the handler source location for the given topic at the given ref.
     * Uses the GitLab project blob-search API; the result is cached per ref+topic.
     * @returns {Promise<{filePath: string, line: number}|null>}
     */
    async resolveLocation(topic, ref) {
        if (!topic || !ref) {
            return null;
        }
        const cacheKey = `${ref}\n${topic}`;
        if (this.#locationCache.has(cacheKey)) {
            return this.#locationCache.get(cacheKey);
        }

        let location = null;
        try {
            location = await this.#searchHandlerLocation(topic, ref);
        } catch (error) {
            console.warn(`cannot resolve handler location for topic '${topic}'`, error);
        }
        this.#locationCache.set(cacheKey, location);
        return location;
    }

    /**
     * GitLab UI URL of a source file at a ref, optionally anchored to a line.
     */
    blobFileUrl(filePath, line, ref) {
        const anchor = line ? `#L${line}` : '';
        return `${this.#projectUrl}/-/blob/${ref}/${filePath}${anchor}`;
    }

    /**
     * GitLab UI URL of the MR diffs tab anchored to a given file, so a handler
     * changed in this MR opens showing exactly what changed (as if the file was
     * clicked in the MR changes list). The anchor is the SHA-1 of the file path,
     * matching GitLab's diff-file element id.
     * @returns {Promise<string>}
     */
    async mrFileDiffUrl(filePath, mrIid) {
        const base = `${this.#projectUrl}/-/merge_requests/${mrIid}/diffs`;
        const anchor = await this.#sha1Hex(filePath);
        return anchor ? `${base}#${anchor}` : base;
    }

    /**
     * Blob-search GitLab URL for a free-text term within the project at a ref.
     * Exposed so the UI can offer a "search in GitLab" fallback when resolution
     * fails (e.g. blob search disabled on the instance).
     */
    blobSearchPageUrl(topic, ref) {
        return `${this.#projectUrl}/-/search?search=${encodeURIComponent(topic)}` +
            `&scope=blobs&ref=${encodeURIComponent(ref)}`;
    }

    async #fetchMrChanges(mrIid) {
        const url = `${this.#projectHostUrl}/api/v4/projects/${this.#projectId}/merge_requests/${mrIid}/changes`;
        const content = await loadFileContent(url, false);
        if (!content) {
            console.warn('cannot load MR changes: ' + url);
            return null;
        }
        return JSON.parse(content);
    }

    /**
     * Selects the handler files touched by an MR from its `changes` API response
     * and classifies each as 'added' / 'changed' / 'removed'. For each entry:
     *  - filePath: the path used for the badge link / MR-diff anchor
     *  - scanPath: the path whose content carries the subscription topics
     *  - diffType: 'added' (new_file), 'removed' (deleted_file) or 'changed'
     * For added/modified files new_path holds the path; for deleted files the
     * path lives in old_path (new_path equals it); renames are treated as changes.
     * @returns {{filePath: string, scanPath: string, diffType: string}[]}
     */
    static extractHandlerFileChanges(changesResponse) {
        const changes = (changesResponse && changesResponse.changes) || [];
        const result = [];
        for (const change of changes) {
            let diffType, path;
            if (change.new_file) {
                diffType = 'added';
                path = change.new_path;
            } else if (change.deleted_file) {
                diffType = 'removed';
                path = change.old_path;
            } else {
                diffType = 'changed';
                path = change.new_path || change.old_path;
            }
            if (path && ExternalTaskHandlerLocator.isHandlerFile(path)) {
                result.push({ filePath: path, scanPath: path, diffType });
            }
        }
        return result;
    }

    async #sha1Hex(text) {
        try {
            const bytes = new TextEncoder().encode(text);
            const digest = await crypto.subtle.digest('SHA-1', bytes);
            return Array.from(new Uint8Array(digest))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        } catch (error) {
            console.warn('cannot compute sha1 for MR diff anchor', error);
            return null;
        }
    }

    async #searchHandlerLocation(topic, ref) {
        // Literal search for the annotation pinpoints the handler precisely with
        // basic search (git grep). With Advanced Search the punctuation may be
        // tokenized, so we still filter the results below.
        const term = `ExternalTaskSubscription("${topic}")`;
        const items = await this.#searchBlobs(term, ref);

        const handlerItems = items.filter(i => i.path && ExternalTaskHandlerLocator.isHandlerFile(i.path));
        if (handlerItems.length === 0) {
            console.info(`handler source not found for topic '${topic}'`);
            return null;
        }

        // Prefer a hit whose snippet actually contains the subscription annotation
        // (avoids matching test files that merely reference the topic string).
        const annotated = handlerItems.find(i => i.data && i.data.includes('ExternalTaskSubscription'));
        const item = annotated || handlerItems[0];

        return {
            filePath: item.path,
            line: this.#computeMatchLine(item, topic)
        };
    }

    async #searchBlobs(term, ref) {
        const url = `${this.#projectHostUrl}/api/v4/projects/${this.#projectId}/search` +
            `?scope=blobs&ref=${encodeURIComponent(ref)}&search=${encodeURIComponent(term)}`;
        const content = await loadFileContent(url, false);
        if (!content) {
            return [];
        }
        return JSON.parse(content);
    }

    // Derives the 1-based line of the matching annotation from a blob-search item.
    // GitLab returns `startline` (first line of the `data` snippet); the exact
    // line is that plus the offset of the matching line within the snippet.
    #computeMatchLine(item, topic) {
        const startLine = item.startline || 1;
        if (!item.data) {
            return startLine;
        }
        const lines = item.data.split('\n');
        const offset = lines.findIndex(line => line.includes(topic));
        return offset >= 0 ? startLine + offset : startLine;
    }
}
