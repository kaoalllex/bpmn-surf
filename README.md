# bpmn-surf

Browser extension for viewing and comparing BPMN and DMN diagrams: open schemas straight from a repository, follow call activities and decision references across files (and back), and review changes in merge requests.

## Requirements

- Google Chrome
- Other Chromium browsers with support for Chrome Extension Manifest V3

## Installation

The extension has no build step — it runs directly from the source files.

1. Get the sources: `git clone https://github.com/kaoalllex/bpmn-surf.git`, or **Code → Download ZIP** on GitHub and unzip
2. Open the extensions page: `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `bpmn-surf` folder

To update, pull (or re-download) the sources and click ⟳ on the extension in `chrome://extensions`.

### Your own GitLab instance

Out of the box the extension only runs on `gitlab.com`. To use it on a self-hosted GitLab,
add your host to `content_scripts[0].matches` in `manifest.json`:

```json
"matches": [
    "https://gitlab.com/*",
    "https://gitlab.mycompany.com/*"
]
```

Then click ⟳ on the extension in `chrome://extensions`. Keep the file edited locally — it is
overwritten by the next `git pull`.

## Features

**Comparing changes**

- Visual diff of two BPMN/DMN versions in a merge request (MR branch vs. target branch), opened from a **Schema diff** / **Decision diff** button that appears on the MR page
- Diff of a selected MR commit against its parent
- Diff of a repository file against a local version (the **Diff with local** button)
- Highlighting changes: 🟩 added, 🟥 removed, 🟦 modified
- Inside an element, highlighting the specific changed In/Out mapping and Input/Output entries
- A changes table — click an entry to jump to its element

**Browsing & navigation**

- Viewing a BPMN schema or DMN decision from a repository file, without a diff — opened from a **View schema** / **View decision** button next to the file name
- Diving from a Call Activity into the called process — and stepping back to the caller
- Navigating from a Business Rule Task to the called DMN — and back
- Jumping to the handler code of a service task (external task or delegate)
- Jumping from a message-catching event/task to where its message is correlated in code

**Reading a diagram**

- A properties panel with element details, including readable sequence-flow conditions
- The properties panel auto-expands the groups relevant to the selected element
- Highlighting of properties-panel groups affected by a change
- Searching for an element on the canvas
- A clear indication when a schema is absent in one of the versions

**Versions & viewport**

- Switching between the shown versions (the **Switch branch** button); the target branch is shown by name, not by hash
- A clickable file path in the header (opens the file in the repository)
- Downloading any of the shown versions
- Viewport controls (zoom/pan, "Fit view"), a highlight toggle, and a resizable properties panel

## Links

- [Issues](https://github.com/kaoalllex/bpmn-surf/issues) — bug reports and feature requests

## Licence

MIT — see [LICENSE](LICENSE).
