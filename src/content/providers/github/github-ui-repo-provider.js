// Inert GitHub button-injection provider (REFAC-0004 step 1.3/1.4). isAvailable()
// returns false, so createUIRepoProvider never selects it (on a gitlab page the
// GitLab UI provider is chosen). Its other methods are *safe no-ops* (not throws)
// because App calls isButtonPresent / isOwnButtonClick / reset / disableButton /
// enableButton unconditionally on the mouseup/popstate hot path — so the stub must
// never inject a button, never claim a click, and never error. Subtask 2 replaces
// this with real GitHub button injection (and flips isAvailable to detect github.com).
class GitHubUIRepoProvider extends UIRepoProvider {
    isAvailable(/* platformKind */) {
        // Inert: never selected by createUIRepoProvider (GitLab stays the default).
        // Subtask 2 flips this to `platformKind === PLATFORM_KIND.GITHUB`.
        return false;
    }

    addButton() {
        // No button on GitHub yet.
    }

    reset() {
        // Nothing was inserted, so nothing to remove.
    }

    disableButton() {
        // No button to disable.
    }

    enableButton() {
        // No button to enable.
    }

    isOwnButtonClick() {
        return false;
    }

    buttonFilePath() { return null; }

    isButtonPresent() {
        return false;
    }
}
