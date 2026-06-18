# Code Style

## Description
Code style and formatting rules for the BPMN Diff Chrome Extension project.

## Application
Applied **automatically** to all code changes (refactor, feature, fix, analyze).

## Rules

### General
- Use modern JavaScript (ES6+)
- Prioritize clean, readable, and idiomatic code
- Ensure compatibility with Chrome Extension Manifest V3
- Prefer small, pure functions
- Prefer readability over cleverness
- Avoid hidden side effects
- Write comments only when necessary, in English, and keep them concise

### Naming & Structure
- **PascalCase** for classes (e.g., `GitLabRepoProvider`)
- **camelCase** for variables, functions, and instances (e.g., `repoProvider`, `getFileContent`)
- **SCREAMING_SNAKE_CASE** for constants (e.g., `MASTER_BRANCH_NAME`)

### Classes & Methods
- Use native private class members with the `#` prefix (e.g., `#privateMethod`)
- Do not use the underscore `_` convention for privacy

### Formatting
- Use single quotes (`''`) for strings instead of double quotes (`""`)
- Always use semicolons (`;`) at the end of statements
- Use 4 spaces for indentation (no tabs)
- Always use async/await instead of raw Promises (`.then`/`.catch`) where possible

### Chrome Extension Specifics
- Always target Manifest V3
- Use `chrome.*` APIs (e.g., `chrome.runtime`, `chrome.storage`)
- Be mindful of the differences between Background Service Workers, Content Scripts, and Popup scripts

## Examples

### Good
```javascript
// Class with proper naming
class GitLabRepoProvider {
  #cache = new Map();

  async getFileContent(commitId, filePath) {
    const cacheKey = `${commitId}:${filePath}`;
    if (this.#cache.has(cacheKey)) {
      return this.#cache.get(cacheKey);
    }

    const content = await this.#fetchFile(commitId, filePath);
    this.#cache.set(cacheKey, content);
    return content;
  }
}

// Constants
const MASTER_BRANCH_NAME = 'master';
const CACHE_TTL_MS = 3600000;
```

### Bad
```javascript
// Wrong naming and style
class gitlab_repo_provider {
  _cache = new Map();

  getFileContent(commitId, filePath) {
    return this._fetchFile(commitId, filePath).then(content => {
      this._cache.set(commitId, content);
      return content;
    });
  }
}

const masterBranchName = 'master';
```
