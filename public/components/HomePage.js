import { getDefaultLayout, getWidgetById } from "./WidgetRegistry.js";
import { DBManager } from "../services/DBManager.js";
import { Router } from "../services/Router.js";
import './weather/WeatherCurrent.js';
import './TodoList.js';
import './LocalNotes.js';

export class HomePage extends HTMLElement {
    connectedCallback() {
        const template = document.getElementById("home-page");
        const content = template.content.cloneNode(true);
        this.appendChild(content);

        this.#renderHomepage();
        this.#attachPwaLinks();

        this._onLayoutChange = async () => {
            this.innerHTML = '';
            const fresh = template.content.cloneNode(true);
            this.appendChild(fresh);
            await this.#renderHomepage();
            this.#attachPwaLinks();
        };
        window.addEventListener('homepage-layout-changed', this._onLayoutChange);
    }

    disconnectedCallback() {
        if (this._onLayoutChange) {
            window.removeEventListener('homepage-layout-changed', this._onLayoutChange);
        }
    }

    async #renderHomepage() {
        let layout;
        try {
            const saved = await DBManager.getSetting('homepage-layout');
            layout = saved || getDefaultLayout();
        } catch (e) {
            console.error('[HomePage] Failed to load layout:', e);
            layout = getDefaultLayout();
        }

        const zoneEl = this.querySelector('[data-zone="main"]');
        if (!zoneEl) return;

        zoneEl.innerHTML = '';

        for (const widgetId of layout.main || []) {
            const widget = getWidgetById(widgetId);
            if (!widget) continue;

            if (widgetId === 'notes') {
                const wrapper = document.createElement('section');
                wrapper.className = 'notes-widget-section';
                wrapper.innerHTML = `
                    <a href="/note" class="notes-header-link pwa">
                        <h2>Notes</h2>
                    </a>
                `;
                const el = document.createElement(widget.tag);
                wrapper.appendChild(el);
                zoneEl.appendChild(wrapper);
            } else {
                const el = document.createElement(widget.tag);
                if (widget.props) {
                    for (const [key, val] of Object.entries(widget.props)) {
                        el.setAttribute(key, val);
                    }
                }
                zoneEl.appendChild(el);
            }
        }
    }

    #attachPwaLinks() {
        this.querySelectorAll("a.pwa").forEach(a => {
            a.addEventListener("click", event => {
                event.preventDefault();
                const href = a.getAttribute("href");
                Router.go(href);
            });
        });
    }
}

customElements.define("home-page", HomePage);
