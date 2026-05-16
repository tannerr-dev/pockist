import { WIDGET_REGISTRY, getDefaultLayout } from "./WidgetRegistry.js";
import { DBManager } from "../services/DBManager.js";

export class HomeSettingsDrawer extends HTMLElement {
    static SETTINGS_KEY = 'homepage-layout';

    constructor() {
        super();
        this.#currentLayout = null;
    }

    #currentLayout = null;

    async connectedCallback() {
        const template = document.getElementById('home-settings-drawer');
        if (!template) {
            console.error('[HomeSettingsDrawer] Template not found');
            return;
        }
        const content = template.content.cloneNode(true);
        this.appendChild(content);

        await this.#loadLayout();
        this.#renderWidgetsList();
        this.#attachListeners();
    }

    async #loadLayout() {
        try {
            const saved = await DBManager.getSetting(HomeSettingsDrawer.SETTINGS_KEY);
            this.#currentLayout = saved || getDefaultLayout();
        } catch (e) {
            console.error('[HomeSettingsDrawer] Failed to load layout:', e);
            this.#currentLayout = getDefaultLayout();
        }
    }

    #renderWidgetsList() {
        const listEl = this.querySelector('.settings-widgets-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        const enabledSet = new Set(this.#currentLayout.main || []);

        WIDGET_REGISTRY.forEach(widget => {
            const isEnabled = enabledSet.has(widget.id);

            const row = document.createElement('div');
            row.className = 'settings-widget-row';
            row.innerHTML = `
                <span class="settings-widget-name">${widget.name}</span>
                <label class="settings-toggle">
                    <input type="checkbox" data-widget-id="${widget.id}" ${isEnabled ? 'checked' : ''}>
                    <span class="settings-toggle-slider"></span>
                </label>
            `;
            listEl.appendChild(row);
        });
    }

    #attachListeners() {
        const closeBtn = this.querySelector('.settings-drawer-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        const listEl = this.querySelector('.settings-widgets-list');
        if (listEl) {
            listEl.addEventListener('change', async (e) => {
                if (e.target.matches('input[type="checkbox"]')) {
                    const widgetId = e.target.dataset.widgetId;
                    await this.#toggleWidget(widgetId, e.target.checked);
                }
            });
        }

        const resetBtn = this.querySelector('.settings-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                this.#currentLayout = getDefaultLayout();
                await this.#saveLayout();
                this.#renderWidgetsList();
                window.dispatchEvent(new CustomEvent('homepage-layout-changed'));
            });
        }
    }

    async #toggleWidget(widgetId, enabled) {
        const main = new Set(this.#currentLayout.main || []);
        if (enabled) {
            main.add(widgetId);
        } else {
            main.delete(widgetId);
        }
        this.#currentLayout = { main: Array.from(main) };
        await this.#saveLayout();
        window.dispatchEvent(new CustomEvent('homepage-layout-changed'));
    }

    async #saveLayout() {
        try {
            await DBManager.saveSetting(HomeSettingsDrawer.SETTINGS_KEY, this.#currentLayout);
        } catch (e) {
            console.error('[HomeSettingsDrawer] Failed to save layout:', e);
        }
    }

    open() {
        this.setAttribute('open', '');
    }

    close() {
        this.removeAttribute('open');
    }

    get isOpen() {
        return this.hasAttribute('open');
    }
}

customElements.define('home-settings-drawer', HomeSettingsDrawer);
