// Pure parsing of github.com page URLs and the REST endpoints the GitHub
// providers call (REFAC-0004). No DOM, no network — the github mirror of
// gitlab-url-parser.js.
class GitHubUrlParser {
    static #API = 'https://api.github.com';
    // Whole-PR views only: a commit or range view (an extra path segment) would
    // be diffed and labelled as the whole PR.
    static #PULL_FILES = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/(?:files|changes)\/?$/;
    static #BLOB = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/;

    parsePullFiles(href) {
        const match = GitHubUrlParser.#PULL_FILES.exec(new URL(href).pathname);
        return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null;
    }

    parseBlob(href) {
        const match = GitHubUrlParser.#BLOB.exec(new URL(href).pathname);
        if (!match) {
            return null;
        }
        try {
            return { owner: match[1], repo: match[2], refAndPath: decodeURIComponent(match[3]) };
        } catch {
            // A malformed escape is not a blob page; this runs on every location.href.
            return null;
        }
    }

    getBranchFileType(href) {
        const blob = this.parseBlob(href);
        if (!blob) {
            return null;
        }
        if (blob.refAndPath.endsWith(FILE_TYPE_BPMN.extension)) {
            return FILE_TYPE_BPMN;
        }
        if (blob.refAndPath.endsWith(FILE_TYPE_DMN.extension)) {
            return FILE_TYPE_DMN;
        }
        return null;
    }

    // The URL alone cannot tell where a slashed branch name ends; the caller
    // supplies the ref (read from the page) and gets the path back.
    splitRefAndPath(refAndPath, ref) {
        const prefix = ref + '/';
        return refAndPath.startsWith(prefix) && refAndPath.length > prefix.length
            ? refAndPath.slice(prefix.length)
            : null;
    }

    pullApiUrl(owner, repo, number) {
        return `${GitHubUrlParser.#API}/repos/${owner}/${repo}/pulls/${number}`;
    }

    compareApiUrl(owner, repo, base, head) {
        return `${GitHubUrlParser.#API}/repos/${owner}/${repo}/compare/${base}...${head}`;
    }
}
