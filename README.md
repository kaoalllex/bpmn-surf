# bpmn-surf

Browser extension for browsing and comparing BPMN and DMN diagrams: explore schemas stored in a repo, dive into call activities and called decisions and back, and review changes in merge requests.

## Requirements

- Google Chrome
- Other Chromium browsers with support for Chrome Extension Manifest V3

## Installation

1. Download the latest `bpmn-surf-x.y.z.zip` from the [Releases page](https://gitlab.example.com/kaoalllex/bpmn-diff/-/releases)
2. Unzip it to a folder of your choice
3. Open the extensions page: `chrome://extensions`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the unzipped `bpmn-surf` folder — the extension needs no build, it runs straight from the files

To update, download a newer zip, unzip it over the old folder, and click ⟳ on the extension in `chrome://extensions`.

<details>
<summary>From source (for development)</summary>

Clone the repo and load the repository root as the unpacked extension (it runs straight from the sources). Build a distributable zip with `npm run package` (output in `dist/`).

```bash
git clone <repo-url> ~/tools/bpmn-surf   # folder is up to you
```
</details>

## Features

**Comparing changes**

- Visual diff of two BPMN/DMN versions in a merge request (MR branch vs. target branch), opened from a **Schema diff** / **Decision diff** button that appears on the MR page
- Diff of a selected MR commit against its parent
- Comparing a repository file against a local version (the **Diff with local** button)
- Highlighting changes: 🟢 added, 🔴 removed, and modified elements
- Per-element highlighting of changed mapping/decision entries
- A changes table with navigation to an element on click

**Browsing & navigation**

- Viewing a BPMN schema or DMN decision straight from a repository file, no diff — opened from a **View schema** / **View decision** button next to the file name
- Diving from a Call Activity into the called process — and stepping back to the caller
- Navigating from a Business Rule Task to the called DMN — and back
- Jumping to the handler code of a service task (external task)
- Jumping from a message event to its correlation point in code

**Reading a diagram**

- A properties panel with element details, including readable sequence-flow conditions
- The properties panel auto-expands the groups relevant to the selected element
- Highlighting of property-panel groups affected by a change
- Searching for an element on the canvas
- A clear indication when a schema is absent in one of the versions

**Versions & viewport**

- Switching between versions (switch branch); the target branch name is shown instead of a hash
- A clickable file path in the header (opens the file in the repository)
- Downloading any of the shown versions
- Zoom and navigation controls (zoom/pan, "Fit view"), a highlight toggle, and a resizable properties panel

## Links

- [Chat channel](https://chat.example.com/example/channels/bpmn-surf)
