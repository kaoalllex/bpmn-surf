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

Out of the box the extension runs on `gitlab.com`. To use it on a self-hosted GitLab,
add the host from the extension popup — no file editing:

1. Click the bpmn-surf icon in the browser toolbar
2. Under **Sites**, type the host (`gitlab.mycompany.com`; a pasted merge request link
   works too) and click **Add**
3. Confirm the access request Chrome shows
4. Reload the GitLab tabs you already had open

Only `https` hosts are accepted. The host is kept as a Chrome permission, so it survives
updates and re-installs; remove it with the `×` next to it in the popup. Chrome may keep
showing a removed host under `chrome://extensions` → Details → Site access — that record is
its own, the extension no longer runs there.

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

**Editing a BPMN schema**

- Opening the schema currently on screen in an **edit mode** (the **✎** button) — in a separate tab; nothing is ever written back to the repository
- Canvas editing: palette, context pad, undo/redo — plus an editable properties panel (names, implementation, topics, conditions, In/Out mappings, Inputs/Outputs)
- Edits are coloured against the version you started from (🟩 added, 🟦 changed), with a toggle to turn the colouring off, and manual colours for individual elements
- Downloading the result as a single `.bpmn` file

**Versions & viewport**

- Switching between the shown versions (the **Switch branch** button); the target branch is shown by name, not by hash
- A clickable file path in the header (opens the file in the repository)
- Downloading any of the shown versions
- Viewport controls (zoom/pan, "Fit view"), a highlight toggle, and a resizable properties panel

## Links

- [Issues](https://github.com/kaoalllex/bpmn-surf/issues) — bug reports and feature requests

## Licence

MIT — see [LICENSE](LICENSE).
