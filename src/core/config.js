// GitLab default branch (usually this is "master", but can also be "main")
const MASTER_BRANCH_NAME = 'master';
//const MASTER_BRANCH_NAME = 'main';

// --- Extension update (FEAT-0012) ------------------------------------------
// The version source is a public version.json (see the format in the root
// version.json and docs/architecture.md). The extension does NOT replace its
// own files (a load-unpacked limitation): it only notifies and guides the user
// through the update.
//
// TODO(github-migration): fill in after moving the sources to public GitHub.
// While the URLs are empty → update checking is inactive (no network requests,
// no errors). The origin from *_URL must be in manifest#host_permissions.
// Example (raw GitHub): https://raw.githubusercontent.com/<owner>/bpmn-diff/master/version.json
const UPDATE_VERSION_MANIFEST_URL = '';
// Example: https://raw.githubusercontent.com/<owner>/bpmn-diff/master/CHANGELOG.md
const UPDATE_CHANGELOG_URL = '';
// Download/releases page (opened by the "Update" button).
// Example: https://github.com/<owner>/bpmn-diff
const UPDATE_HOME_URL = '';
// Update command for a git install (shown in the popup with a copy button).
const UPDATE_GIT_PULL_COMMAND = 'git pull';

// How often to check for updates (minutes). chrome.alarms.
const UPDATE_CHECK_INTERVAL_MINUTES = 360;
// Auto-check is enabled by default; the user turns it off with a toggle in the popup.
const UPDATE_CHECK_ENABLED_DEFAULT = true;
// Settings/result key in chrome.storage.local.
const UPDATE_STORAGE_KEY = 'updateState';
