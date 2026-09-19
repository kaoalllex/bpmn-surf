class MasterCommitManager {
    static COMMITS_PER_PAGE = 40;
    static CACHE_KEY_PREFIX = 'bpmn_diff_master_commits_';
    static MAX_CACHED_PAGES = 30;
    static CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

    #projectInfo;
    #branchName = null;
    #cachedPages = new Map();
    #cacheInitialized = false;
    #inFlightRequests = new Map();
    #lastPageKnown = null;

    constructor(projectInfo) {
        this.#projectInfo = projectInfo;
    }

    #getCacheKey() {
        return `${MasterCommitManager.CACHE_KEY_PREFIX}${this.#projectInfo.id}_${this.#branchName}`;
    }

    // The in-memory state belongs to one branch; a different MR target branch starts over.
    #useBranch(branchName) {
        if (branchName === this.#branchName) return;
        this.#branchName = branchName;
        this.#cachedPages = new Map();
        this.#cacheInitialized = false;
        this.#inFlightRequests = new Map();
        this.#lastPageKnown = null;
    }

    #initializeCache() {
        if (this.#cacheInitialized) return;
        this.#cacheInitialized = true;

        try {
            const raw = localStorage.getItem(this.#getCacheKey());
            if (!raw) return;

            const parsed = JSON.parse(raw);

            if (!parsed.lastFetched || typeof parsed.pages !== 'object') {
                this.#resetCache();
                return;
            }

            const now = Date.now();
            if (now - parsed.lastFetched > MasterCommitManager.CACHE_TTL_MS) {
                this.#resetCache();
                return;
            }

            for (const [page, entries] of Object.entries(parsed.pages)) {
                const pageNum = Number(page);
                if (!Number.isInteger(pageNum)) continue;
                if (!Array.isArray(entries)) continue;
                this.#cachedPages.set(pageNum, entries);
            }

            this.#lastPageKnown = parsed.lastPageKnown ?? null;
        } catch (e) {
            this.#resetCache();
        }
    }

    #resetCache() {
        localStorage.removeItem(this.#getCacheKey());
    }

    #saveCache() {
        try {
            const pagesToKeep = [...this.#cachedPages.keys()]
                .sort((a, b) => a - b)
                .slice(0, MasterCommitManager.MAX_CACHED_PAGES);

            const pages = {};
            for (const page of pagesToKeep) {
                pages[page] = this.#cachedPages.get(page);
            }

            localStorage.setItem(
                this.#getCacheKey(),
                JSON.stringify({
                    pages,
                    lastPageKnown: this.#lastPageKnown,
                    lastFetched: Date.now()
                })
            );
        } catch (e) {
            console.warn('Failed to save commit cache:', e);
        }
    }

    async #loadPage(pageNumber) {
        if (!Number.isInteger(pageNumber) || pageNumber < 1) {
            throw new Error('pageNumber must be >= 1');
        }

        if (!this.#projectInfo?.url) {
            throw new Error('ProjectInfo is not initialized yet');
        }

        this.#initializeCache();

        if (this.#cachedPages.has(pageNumber)) {
            this.#fetchAndUpdatePage(pageNumber);
            return this.#cachedPages.get(pageNumber);
        }

        if (this.#lastPageKnown !== null && pageNumber > this.#lastPageKnown) {
            // Requested page is beyond the known last page of the branch;
            // returning empty array is expected
            return [];
        }

        if (this.#inFlightRequests.has(pageNumber)) {
            return this.#inFlightRequests.get(pageNumber);
        }

        return this.#fetchAndUpdatePage(pageNumber);
    }

    async #fetchAndUpdatePage(pageNumber) {
        const branchName = this.#branchName;
        const request = (async () => {
            try {
                const offset = (pageNumber - 1) * MasterCommitManager.COMMITS_PER_PAGE;
                const url = `${this.#projectInfo.url}/-/commits/${encodeBranchName(branchName)}?format=atom&limit=${MasterCommitManager.COMMITS_PER_PAGE}&offset=${offset}`;

                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }

                const xml = await res.text();
                const doc = new DOMParser().parseFromString(xml, 'text/xml');
                if (doc.getElementsByTagName('parsererror').length) {
                    throw new Error('Invalid XML response');
                }

                const entries = [...doc.getElementsByTagName('entry')].map(e => ({
                    id: e.querySelector('id')?.textContent ?? '',
                    title: e.querySelector('title')?.textContent ?? '',
                    updated: e.querySelector('updated')?.textContent ?? ''
                }));

                // The target branch changed while this request was in flight.
                if (branchName !== this.#branchName) return entries;

                this.#cachedPages.set(pageNumber, entries);

                if (entries.length < MasterCommitManager.COMMITS_PER_PAGE) {
                    this.#lastPageKnown = pageNumber;
                }

                this.#saveCache();
                return entries;
            } finally {
                this.#inFlightRequests.delete(pageNumber);
            }
        })();

        this.#inFlightRequests.set(pageNumber, request);
        return request;
    }

    async findPreviousCommitId(commitId, branchName) {
        if (!commitId) return null;
        this.#useBranch(branchName);

        let page = 1;

        while (true) {
            const entries = await this.#loadPage(page);
            if (!entries.length) return null;

            const index = entries.findIndex(e => e.id.includes(commitId));

            if (index !== -1) {
                const next = entries[index + 1];
                if (next) return next.id.split('/').pop();
                page++;
                continue;
            }

            if (entries.length < MasterCommitManager.COMMITS_PER_PAGE) return null;
            page++;
        }
    }
}
