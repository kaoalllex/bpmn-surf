// Индикатор доступного обновления в тулбаре differ-страницы (FEAT-0012).
// Общий для BPMN и DMN (как BranchIndicator). Differ-страница — обычный
// web-контекст (about:blank) без доступа к chrome.*, поэтому данные об
// обновлении приходят в параметрах (их читает content-script из состояния SW),
// а клик открывает popup как вкладку (window.open по popupUrl, переданному
// content-script'ом через chrome.runtime.getURL).
class UpdateIndicator {
    // updateInfo: { updateAvailable, latestVersion, popupUrl } | null
    constructor(updateInfo) {
        this.updateInfo = updateInfo || null;
    }

    isAvailable() {
        return !!(this.updateInfo
            && this.updateInfo.updateAvailable
            && this.updateInfo.latestVersion);
    }

    // Создаёт кликабельный элемент-«колокольчик». onActivate вызывается по
    // клику (вью подвязывает открытие popup'а). Возвращает null, если обновления
    // нет — вызывающий не добавляет элемент в тулбар.
    createElement(onActivate) {
        if (!this.isAvailable()) {
            return null;
        }
        const button = document.createElement('button');
        button.className = 'differ-btn differ-update-indicator';
        button.textContent = `🔔 v${this.updateInfo.latestVersion}`;
        button.title = 'Доступно обновление BPMN differ — открыть окно обновления';
        button.addEventListener('click', () => {
            if (typeof onActivate === 'function') {
                onActivate();
            }
        });
        return button;
    }
}
