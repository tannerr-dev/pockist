import { weatherService } from '../../services/WeatherService.js';

export class WeatherDebug extends HTMLElement {
    constructor() {
        super();
        this._weatherData = null;
        this.unsubscribe = null;
        
        // Cached element reference
        this._dataEl = null;
    }

    connectedCallback() {
        this.classList.add('weather-debug');

        // Clone template
        const template = document.getElementById('weather-debug');
        if (!template) {
            console.error('weather-debug template not found');
            return;
        }
        const content = template.content.cloneNode(true);
        this.appendChild(content);

        // Cache element reference
        this._dataEl = this.querySelector('#data');

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
        if (this._dataEl && this._weatherData) {
            this._dataEl.textContent = JSON.stringify(this._weatherData, null, 2);
        }
    }

    // Public API
    refresh() {
        this._updateView();
    }
}

customElements.define('weather-debug', WeatherDebug);
