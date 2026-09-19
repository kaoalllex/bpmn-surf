// --- Feedback --------------------------------------------------------------
// Page opened by the "Leave feedback" link in the action popup.
const FEEDBACK_URL = 'https://github.com/kaoalllex/bpmn-surf/issues';

// --- Extension update (FEAT-0012) ------------------------------------------
// The version source is a public version.json (see the format in the root
// version.json and docs/architecture.md). The extension does NOT replace its
// own files (a load-unpacked limitation): it only notifies and guides the user
// through the update.
//
// If the URLs are empty → update checking is inactive (no network requests,
// no errors). The origin from *_URL must be in manifest#host_permissions.
// Empty until the sources are published: the raw.githubusercontent.com URLs
// below 404 while the repository is private, so the check stays off.
const UPDATE_VERSION_MANIFEST_URL = ''; // https://raw.githubusercontent.com/kaoalllex/bpmn-surf/master/version.json
const UPDATE_CHANGELOG_URL = ''; // https://raw.githubusercontent.com/kaoalllex/bpmn-surf/master/CHANGELOG.md
// Download/releases page (opened by the "Update" button).
const UPDATE_HOME_URL = 'https://github.com/kaoalllex/bpmn-surf';
// Update command for a git install (shown in the popup with a copy button).
const UPDATE_GIT_PULL_COMMAND = 'git pull';

// How often to check for updates (minutes). chrome.alarms.
const UPDATE_CHECK_INTERVAL_MINUTES = 360;
// Auto-check is enabled by default; the user turns it off with a toggle in the popup.
const UPDATE_CHECK_ENABLED_DEFAULT = true;
// Settings/result key in chrome.storage.local.
const UPDATE_STORAGE_KEY = 'updateState';
