/**
 * Class for managing page reload with attempt limit
 */
class PageReloader {
    static ATTEMPTS_KEY = 'bpmn_diff_reload_attempts';
    static MAX_ATTEMPTS = 3;

    /**
     * Attempts to reload the page with attempt limit
     * @returns {boolean} true if reload was performed, false if limit reached
     */
    attemptReload() {
        const attempts = this.#getAttempts() + 1;
        this.#setAttempts(attempts);

        if (attempts <= PageReloader.MAX_ATTEMPTS) {
            console.info(`Reloading page, attempt ${attempts}/${PageReloader.MAX_ATTEMPTS}`);
            location.reload();
            return true;
        }

        this.#handleMaxAttemptsReached();
        return false;
    }

    reset() {
        sessionStorage.removeItem(PageReloader.ATTEMPTS_KEY);
    }

    #getAttempts() {
        return parseInt(sessionStorage.getItem(PageReloader.ATTEMPTS_KEY)) || 0;
    }

    #setAttempts(attempts) {
        sessionStorage.setItem(PageReloader.ATTEMPTS_KEY, attempts.toString());
    }

    #handleMaxAttemptsReached() {
        console.error('Max reload attempts reached. Stopping to prevent infinite loop.');
        this.reset();
        alert('Failed to load data. Please refresh the page manually.');
    }
}
