/**
 * Single-entry cache: keeps the last computed value together with its key
 */
class SingleEntryCache {
    #key = null;
    #value = null;

    get(key) {
        if (this.#value && this.#key === key) {
            return this.#value;
        }
        return null;
    }

    set(key, value) {
        this.#key = key;
        this.#value = value;
    }
}
