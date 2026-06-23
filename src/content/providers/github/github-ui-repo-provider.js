// Inert GitHub button-injection provider (REFAC-0004 step 1.3). createUIRepoProvider
// returns it only on github.com; everywhere else GitLab stays the default. Its
// methods are *safe no-ops* (not throws) because App calls isButtonPresent /
// isOwnButtonClick / reset unconditionally on the mouseup/popstate hot path — so
// the stub must never inject a button, never claim a click, and never error.
// Subtask 2 replaces this with real GitHub button injection.
class GitHubUIRepoProvider extends UIRepoProvider {
    addButton() {
        // No button on GitHub yet.
    }

    reset() {
        // Nothing was inserted, so nothing to remove.
    }

    isOwnButtonClick() {
        return false;
    }

    isButtonPresent() {
        return false;
    }
}
