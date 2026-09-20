'use strict';

// Extension popup UI. Works both as an action popup and as an open tab.

document.getElementById('currentVersion').textContent = `v${chrome.runtime.getManifest().version}`;
document.getElementById('feedbackLink').href = FEEDBACK_URL;
