// Pure parsing of GitHub page URLs and the REST endpoints the GitHub
// providers call (REFAC-0004). No DOM, no network — the github mirror of
// gitlab-url-parser.js.
class GitHubUrlParser {
    // Whole PR (/files, /changes) or a selection: /changes|/files/<range> and
    // /commits/<sha>, where <range> is <sha>, <sha>..<sha> or BASE..<sha>.
    static #PULL_FILES = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/(?:(?:files|changes)(?:\/((?:[0-9a-f]{7,40}|BASE)(?:\.\.[0-9a-f]{7,40})?))?|commits\/([0-9a-f]{7,40}))\/?$/;
    static #BLOB = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/;

    parsePullFiles(href) {
        const match = GitHubUrlParser.#PULL_FILES.exec(new URL(href).pathname);
        if (!match || (match[4] && match[4].startsWith('BASE') && !match[4].includes('..'))) {
            return null;
        }
        return { owner: match[1], repo: match[2], number: Number(match[3]), range: match[4] || match[5] || null };
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

    // github.com's REST API has its own host; GitHub Enterprise Server serves it under /api/v3.
    static apiBase(hostUrl) {
        return hostUrl === 'https://github.com' ? 'https://api.github.com' : `${hostUrl}/api/v3`;
    }

    pullApiUrl(hostUrl, owner, repo, number) {
        return `${GitHubUrlParser.apiBase(hostUrl)}/repos/${owner}/${repo}/pulls/${number}`;
    }

    compareApiUrl(hostUrl, owner, repo, base, head) {
        return `${GitHubUrlParser.apiBase(hostUrl)}/repos/${owner}/${repo}/compare/${base}...${head}`;
    }
}
