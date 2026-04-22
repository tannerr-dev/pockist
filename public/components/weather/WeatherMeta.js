import { weatherService } from '../../services/WeatherService.js';

export class WeatherMeta extends HTMLElement {
    constructor() {
        super();
        this._weatherData = null;
        this.unsubscribe = null;
        
        // Cached element references
        this._latEl = null;
        this._lonEl = null;
        this._timezoneEl = null;
        this._elevationEl = null;
        this._utcOffsetEl = null;
        this._genTimeEl = null;
    }

    connectedCallback() {
        this.classList.add('weather-meta');

        // Clone template
        const template = document.getElementById('weather-meta');
        if (!template) {
            console.error('weather-meta template not found');
            return;
        }
        const content = template.content.cloneNode(true);
        this.appendChild(content);

        // Cache element references
        this._latEl = this.querySelector('.meta-item:nth-child(1) .meta-value');
        this._lonEl = this.querySelector('.meta-item:nth-child(2) .meta-value');
        this._timezoneEl = this.querySelector('.meta-item:nth-child(3) .meta-value');
        this._elevationEl = this.querySelector('.meta-item:nth-child(4) .meta-value');
        this._utcOffsetEl = this.querySelector('.meta-item:nth-child(5) .meta-value');
        this._genTimeEl = this.querySelector('.meta-item:nth-child(6) .meta-value');

        // Subscribe to weather service updates
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this._weatherData = update.data;
                this._updateView();
            }
        });

        // Try to get existing weather data
        this._weatherData = weatherService.getCurrentData();
        this._updateView();
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    _updateView() {
        if (!this._weatherData) {
            // Keep skeleton state
            return;
        }

        const data = this._weatherData;

        if (this._latEl) {
            this._latEl.textContent = data.latitude.toFixed(3);
            this._latEl.classList.remove('skeleton-text');
        }

        if (this._lonEl) {
            this._lonEl.textContent = data.longitude.toFixed(3);
            this._lonEl.classList.remove('skeleton-text');
        }

        if (this._timezoneEl) {
            this._timezoneEl.textContent = data.timezone;
            this._timezoneEl.classList.remove('skeleton-text');
        }

        if (this._elevationEl) {
            this._elevationEl.textContent = `${data.elevation} m`;
            this._elevationEl.classList.remove('skeleton-text');
        }

        if (this._utcOffsetEl) {
            this._utcOffsetEl.textContent = `${data.utc_offset_seconds / 3600}h`;
            this._utcOffsetEl.classList.remove('skeleton-text');
        }

        if (this._genTimeEl) {
            this._genTimeEl.textContent = `${(data.generationtime_ms / 1000).toFixed(2)}s`;
            this._genTimeEl.classList.remove('skeleton-text');
        }
    }

    // Public API
    refresh() {
        this._updateView();
    }
}

customElements.define('weather-meta', WeatherMeta);
