import { Router } from '../../services/Router.js';
import { weatherService } from '../../services/WeatherService.js';

export class WeatherWidget extends HTMLElement {
    constructor() {
        super();
        this._clickable = true;
        this._showCity = true;
        this.unsubscribe = null;
    }

    static get observedAttributes() {
        return ['clickable', 'show-city'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            switch (name) {
                case 'clickable':
                    this._clickable = newValue !== 'false';
                    break;
                case 'show-city':
                    this._showCity = newValue !== 'false';
                    break;
            }
            this.render();
        }
    }

    connectedCallback() {
        this.classList.add('weather-widget');

        // Add click handler for clickable widgets
        if (this._clickable) {
            this.addEventListener('click', () => this.handleClick());
        }

        // Subscribe to weather service updates
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this.render();
            } else if (update.type === 'weather-error') {
                this.showError();
            }
        });

        // Try to load saved city weather automatically
        this.loadWeatherData();
        this.render();
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    async loadWeatherData() {
        try {
            await weatherService.loadSavedCityWeather();
        } catch (error) {
            console.log('No saved weather data or failed to load');
        }
    }

    handleClick() {
        if (this._clickable) {
            // Navigate to full weather page
            Router.go('/weather');
        }
    }

    showError() {
        this.classList.add('error-state');
        setTimeout(() => {
            this.classList.remove('error-state');
        }, 3000);
    }

    render() {
        const weatherInfo = weatherService.getCurrentWeatherInfo();
        const savedCity = weatherService.loadSavedCity();
        const cityName = savedCity?.name || '';

        if (!weatherInfo) {
            this.innerHTML = `
                <div class="no-data">
                    <span>Click to set up weather</span>
                </div>
            `;
        } else {
            this.innerHTML = `
                <weather-card compact show-city="${this._showCity}" city-name="${cityName}">
                </weather-card>
            `;
        }
    }

    // Public API
    refresh() {
        this.loadWeatherData();
    }

    setClickable(clickable) {
        this._clickable = clickable;
        this.render();
    }

    setShowCity(showCity) {
        this._showCity = showCity;
        this.render();
    }
}

customElements.define('weather-widget', WeatherWidget);
