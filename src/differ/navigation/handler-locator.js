// Locates the source code of service-task handlers and detects which of them
// changed in the current merge request. Supports Kotlin and Java handlers.
//
// A service task is linked to its code by a namespaced "handler key" so the
// same machinery serves both implementation kinds:
//  - topic:<topic>     — external task; the BPMN states the topic via
//                        camunda:topic. Two declaration styles are recognised:
//     - @ExternalTaskSubscription("<topic>") — the topic is stated explicitly;
//     - @ExternalTaskBean — no topic is stated; the framework derives it from
//       the annotated class name by lower-casing its first letter (e.g. class
//       CorrectItemABTestDelegate -> topic "correctItemABTestDelegate").
//       The annotation's arguments (e.g. retriesTimeout) are optional and never
//       carry the topic.
//  - class:<SimpleName> — classic delegate; the BPMN references it via
//     camunda:class="com.foo.Bar" (-> class:Bar) or
//     camunda:delegateExpression="${bar}" (Spring bean `bar` -> class Bar by
//     the default naming convention -> class:Bar). The matching changed file is
//     the one declaring `class Bar` (Bar.kt / Bar.java).
//
// Matching is by simple class name, not FQN: two classes named Bar in different
// packages collide on class:Bar and could mis-resolve. Rare in practice; if it
// becomes a problem, switch the key to the FQN (camunda:class already has it;
// derive the package of a changed file from its path + declaration).
//
// Known limitations of the delegate path (out of scope for this iteration):
//  - delegateExpression with a non-conventional bean (@Component("custom"),
//    bean name != decapitalised class name) is not resolved by convention;
//  - delegateExpression with a complex expression (method calls, dotted
//    navigation) yields no key;
//  - transitive dependency analysis (a handler whose code is unchanged but a
//    helper it calls changed) is left as a future enhancement (see FEAT-0015).
class HandlerLocator {
    // File extensions treated as handler sources (Kotlin and Java).
    static #HANDLER_FILE_EXTENSIONS = ['.kt', '.java'];

    // Matches @ExternalTaskSubscription("topic"), tolerating whitespace/newlines
    // and an optional named argument (value = "..." / topicName = "...").
    static #SUBSCRIPTION_TOPIC_REGEX =
        /@?ExternalTaskSubscription\s*\(\s*(?:[A-Za-z_]+\s*=\s*)?"([^"]+)"/g;

    // Matches @ExternalTaskBean (with optional arguments) followed by the class
    // it annotates, capturing the class name. Tolerates other annotations/modifiers
    // (e.g. @Component, open) between the annotation and the `class` keyword. The
    // topic is later derived from the captured class name, not from the arguments.
    static #WRAP_TO_EXTERNAL_TASK_REGEX =
        /@?ExternalTaskBean\b\s*(?:\([^)]*\))?[\s\S]*?\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g;

    // Matches a class declaration, capturing the class name. Language-agnostic
    // (Kotlin `class Foo`, Java `public final class Foo`); used to derive
    // class:<Name> keys from a changed handler file. Also matches Kotlin-specific
    // forms (`data`/`sealed`/`enum`/`annotation class Foo`) and nested classes —
    // a deliberate over-collection: a stray class:<Name> only yields a badge if a
    // diagram element actually references that class as its delegate.
    static #DECLARED_CLASS_REGEX = /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g;

    // Matches a delegateExpression that is a single bean reference: ${bar} or
    // #{bar}. The whole value must be one identifier — a dotted/method
    // expression (${a.b}, ${svc.run()}) deliberately does not match.
    static #DELEGATE_BEAN_REGEX = /^\s*[#$]\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\s*$/;

    #projectUrl;
    #projectHostUrl;
    #projectId;

    // Cache of resolveLocation() results, keyed by `${ref}\n${key}`.
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
        const regex = new RegExp(HandlerLocator.#SUBSCRIPTION_TOPIC_REGEX);
        let match;
        while ((match = regex.exec(fileContent)) !== null) {
            topics.push(match[1]);
        }
        return topics;
    }

    /**
     * Extracts the topics of all @ExternalTaskBean-annotated classes in the
     * given source file content. The topic of such a handler is its class name
     * with a lower-cased first letter.
     * @returns {string[]} topics (possibly empty)
     */
    static extractExternalTaskBeanTopics(fileContent) {
        const topics = [];
        if (!fileContent) {
            return topics;
        }
        const regex = new RegExp(HandlerLocator.#WRAP_TO_EXTERNAL_TASK_REGEX);
        let match;
        while ((match = regex.exec(fileContent)) !== null) {
            topics.push(HandlerLocator.#topicFromClassName(match[1]));
        }
        return topics;
    }

    /**
     * All external-task topics declared in a source file, regardless of style
     * (@ExternalTaskSubscription or @ExternalTaskBean).
     * @returns {string[]} topics (possibly empty)
     */
    static extractHandlerTopics(fileContent) {
        return [
            ...HandlerLocator.extractSubscriptionTopics(fileContent),
            ...HandlerLocator.extractExternalTaskBeanTopics(fileContent)
        ];
    }

    // The topic the framework derives from a @ExternalTaskBean class name:
    // the class name with a lower-cased first letter.
    static #topicFromClassName(className) {
        return className.charAt(0).toLowerCase() + className.slice(1);
    }

    /**
     * Names of all classes declared in the given source file. Used to derive
     * class:<Name> handler keys: a changed file declaring `class Bar` flags a
     * delegate task referencing Bar. Over-collection is harmless — a key only
     * yields a badge if a diagram element actually references that class.
     * @returns {string[]} class names (possibly empty)
     */
    static extractDeclaredClassNames(fileContent) {
        const names = [];
        if (!fileContent) {
            return names;
        }
        const regex = new RegExp(HandlerLocator.#DECLARED_CLASS_REGEX);
        let match;
        while ((match = regex.exec(fileContent)) !== null) {
            names.push(match[1]);
        }
        return names;
    }

    /**
     * All namespaced handler keys a source file provides: topic:<topic> for
     * every declared external task and class:<Name> for every declared class.
     * @returns {string[]} keys (possibly empty)
     */
    static extractHandlerKeys(fileContent) {
        const keys = [];
        for (const topic of HandlerLocator.extractHandlerTopics(fileContent)) {
            keys.push(`topic:${topic}`);
        }
        for (const className of HandlerLocator.extractDeclaredClassNames(fileContent)) {
            keys.push(`class:${className}`);
        }
        return keys;
    }

    /**
     * Builds a class:<SimpleName> key from a camunda:class value (FQN or simple
     * name); the simple name is matched, not the package (see class header).
     * @returns {string|null}
     */
    static classKeyFromClassName(className) {
        const simple = HandlerLocator.simpleClassName(className);
        return simple ? `class:${simple}` : null;
    }

    /**
     * Builds a class:<Name> key from a camunda:delegateExpression value by the
     * default Spring convention: ${bar} -> bean `bar` -> class Bar. Returns null
     * for a non-trivial expression (dotted navigation, method calls).
     * @returns {string|null}
     */
    static classKeyFromDelegateExpression(expression) {
        if (!expression) {
            return null;
        }
        const match = HandlerLocator.#DELEGATE_BEAN_REGEX.exec(expression);
        return match ? `class:${capitalizeFirstLetter(match[1])}` : null;
    }

    /**
     * Derives the namespaced handler key (topic:<topic> | class:<Name>) carried
     * by a BPMN business object, or null if it references no recognised handler.
     *
     * Implementation attributes (external type+topic / camunda:delegateExpression
     * / camunda:class) are defined on the camunda:ServiceTaskLike that owns them.
     * Where they live depends on the element:
     *  - a service / send / business-rule task carries them on the BO itself;
     *  - a message event (end or intermediate-throw) carries them on its nested
     *    bpmn:MessageEventDefinition, not on the event BO.
     * #implementationHolder picks the right one. camunda:expression is
     * intentionally ignored (a method call, not a class — parity with the badge's
     * scope). Attributes are read via get() because `class` is a reserved word
     * (bo.class would not work).
     * @returns {string|null}
     */
    static handlerKeyFromBusinessObject(bo) {
        const impl = HandlerLocator.#implementationHolder(bo);
        if (!impl) {
            return null;
        }
        if (impl.type === 'external' && impl.topic) {
            return `topic:${impl.topic}`;
        }
        const delegateExpression = impl.get && impl.get('camunda:delegateExpression');
        if (delegateExpression) {
            return HandlerLocator.classKeyFromDelegateExpression(delegateExpression);
        }
        const className = impl.get && impl.get('camunda:class');
        if (className) {
            return HandlerLocator.classKeyFromClassName(className);
        }
        return null;
    }

    // The moddle object that actually carries the implementation attributes: a
    // nested bpmn:MessageEventDefinition when the BO has one (message events
    // store them there), otherwise the BO itself (service/send/business-rule
    // tasks store them directly). Other event-definition types (timer, signal,
    // error, …) carry no class/delegate, so the BO falls through and yields null.
    static #implementationHolder(bo) {
        if (!bo) {
            return null;
        }
        const defs = bo.eventDefinitions || (bo.get && bo.get('eventDefinitions'));
        const msgDef = defs && defs.find(d => d.$type === 'bpmn:MessageEventDefinition');
        return msgDef || bo;
    }

    // 'com.foo.Bar' -> 'Bar'; an already-simple name is returned unchanged.
    static simpleClassName(className) {
        if (!className) {
            return null;
        }
        const trimmed = className.trim();
        const lastDot = trimmed.lastIndexOf('.');
        return lastDot >= 0 ? trimmed.slice(lastDot + 1) : trimmed;
    }

    // The human-readable search term carried by a handler key: the part after
    // the namespace prefix (the topic for topic:, the class name for class:).
    static termFromKey(key) {
        const colon = key ? key.indexOf(':') : -1;
        return colon >= 0 ? key.slice(colon + 1) : key;
    }

    /**
     * Whether the given repository path is a handler source file.
     */
    static isHandlerFile(filePath) {
        return HandlerLocator.#HANDLER_FILE_EXTENSIONS.some(ext => filePath.endsWith(ext));
    }

    /**
     * Returns a map "key -> {filePath, diffType}" (key = topic:<topic> or
     * class:<Name>) for every handler file touched by the MR. diffType is one
     * of 'added' / 'changed' / 'removed'
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
        const handlerChanges = HandlerLocator.extractHandlerFileChanges(changes);
        console.debug(`changed handler files (${handlerChanges.length}):`, handlerChanges);

        // Fetch all touched handler files in parallel (the sequential version was
        // the main blocker on large MRs). The keys are then collected in the
        // original order so a same-key collision resolves deterministically.
        const contents = await Promise.all(handlerChanges.map(({ scanPath, diffType }) => {
            const scanRef = diffType === 'removed' ? branchRef : mrRef;
            if (!scanRef) {
                return null;
            }
            return loadFileContent(`${this.#projectUrl}/-/raw/${scanRef}/${scanPath}`, false);
        }));

        handlerChanges.forEach(({ filePath, diffType }, i) => {
            for (const key of HandlerLocator.extractHandlerKeys(contents[i])) {
                handlers.set(key, { filePath, diffType });
            }
        });
        console.debug(`changed handler keys (${handlers.size}):`, handlers);
        return handlers;
    }

    /**
     * Resolves the handler source location for the given namespaced key
     * (topic:<topic> or class:<Name>) at the given ref. Uses the GitLab project
     * blob-search API; the result is cached per ref+key.
     * @returns {Promise<{filePath: string, line: number}|null>}
     */
    async resolveLocation(key, ref) {
        if (!key || !ref) {
            return null;
        }
        const cacheKey = `${ref}\n${key}`;
        if (this.#locationCache.has(cacheKey)) {
            return this.#locationCache.get(cacheKey);
        }

        let location = null;
        try {
            if (key.startsWith('topic:')) {
                location = await this.#searchHandlerLocation(key.slice('topic:'.length), ref);
            } else if (key.startsWith('class:')) {
                location = await this.#searchClassDeclarationLocation(key.slice('class:'.length), ref);
            }
        } catch (error) {
            console.warn(`cannot resolve handler location for key '${key}'`, error);
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
            if (path && HandlerLocator.isHandlerFile(path)) {
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
        // @ExternalTaskSubscription is the primary style; @ExternalTaskBean is
        // the fallback for projects that derive the topic from the class name.
        const location = (await this.#searchSubscriptionLocation(topic, ref))
            || (await this.#searchExternalTaskBeanLocation(topic, ref));
        if (!location) {
            console.info(`handler source not found for topic '${topic}'`);
        }
        return location;
    }

    async #searchSubscriptionLocation(topic, ref) {
        // Search the bare topic string, not `ExternalTaskSubscription("<topic>")`:
        // GitLab Advanced Search (Elasticsearch) treats " ( ) as query operators,
        // so the punctuated form silently returns [] on such instances (BUG-0013),
        // even though the handler declares the subscription literally. Basic search
        // (git grep) finds both forms. The topic is a unique identifier, so a bare
        // search is precise enough; the results are still narrowed to handler files
        // declaring the subscription below.
        const items = await this.#searchBlobs(topic, ref);

        const handlerItems = items.filter(i => i.path && HandlerLocator.isHandlerFile(i.path));
        if (handlerItems.length === 0) {
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

    async #searchExternalTaskBeanLocation(topic, ref) {
        // The topic is the class name with a lower-cased first letter, so the
        // class name is the topic with its first letter capitalised. Prefer a
        // hit whose snippet shows the @ExternalTaskBean annotation (avoids
        // matching an unrelated class of the same name).
        const className = capitalizeFirstLetter(topic);
        return this.#searchClassLocation(className, ref, 'ExternalTaskBean');
    }

    // Locates the delegate class for a class:<Name> key — the same class-search
    // as #searchExternalTaskBeanLocation but without an annotation to prefer.
    async #searchClassDeclarationLocation(className, ref) {
        return this.#searchClassLocation(className, ref, null);
    }

    // Locates the handler file declaring `class <className>`. When
    // preferAnnotation is given, a hit whose snippet shows that annotation wins
    // over a same-named class elsewhere; otherwise the first handler-file hit.
    async #searchClassLocation(className, ref, preferAnnotation) {
        const term = `class ${className}`;
        const items = await this.#searchBlobs(term, ref);

        const handlerItems = items.filter(i => i.path && HandlerLocator.isHandlerFile(i.path));
        if (handlerItems.length === 0) {
            return null;
        }

        const preferred = preferAnnotation
            && handlerItems.find(i => i.data && i.data.includes(preferAnnotation));
        const item = preferred || handlerItems[0];

        return {
            filePath: item.path,
            line: this.#computeMatchLine(item, className)
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
