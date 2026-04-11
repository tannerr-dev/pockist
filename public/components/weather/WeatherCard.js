import { weatherService } from '../../services/WeatherService.js';

export class WeatherCard extends HTMLElement {
    constructor() {
        super();
        this._weatherData = null;
        this._compact = false;
        this._showCity = false;
        this._cityName = '';
        this.unsubscribe = null;
    }

    static get observedAttributes() {
        return ['compact', 'show-city', 'city-name'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            switch (name) {
                case 'compact':
                    this._compact = newValue !== null;
                    break;
                case 'show-city':
                    this._showCity = newValue !== null;
                    break;
                case 'city-name':
                    this._cityName = newValue || '';
                    break;
            }
            this.render();
        }
    }

    connectedCallback() {
        this.classList.add('weather-card');
        if (this._compact) {
            this.classList.add('compact');
        }

        // Subscribe to weather service updates
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this._weatherData = update.data;
                this.render();
            } else if (update.type === 'unit-changed') {
                this.render(); // Re-render to show new units
            }
        });

        // Try to get existing weather data
        this._weatherData = weatherService.getCurrentData();
        this.render();
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    getWeatherInfo() {
        return weatherService.getCurrentWeatherInfo();
    }

    render() {
        const weatherInfo = this.getWeatherInfo();
        
        if (!weatherInfo) {
            this.innerHTML = `
                <div class="weather-card-content">
                    <div class="loading-state">
                        <span class="loading-text">No weather data</span>
                    </div>
                </div>
            `;
            return;
        }

        const cityDisplay = this._showCity && this._cityName ? 
            `<div class="city-name">${this._cityName}</div>` : '';

        if (this._compact) {
            // Compact version for widgets
            this.innerHTML = `
                <div class="weather-card-content compact">
                    ${cityDisplay}
                    <div class="main-weather">
                        <temperature-display 
                            temperature="${weatherInfo.temperature}" 
                            unit="${weatherService.getTempUnit()}"
                            size="large">
                        </temperature-display>
                        <div class="condition">${weatherInfo.condition}</div>
                    </div>
                    <stats-grid 
                        humidity="${weatherInfo.humidity}"
                        precipitation="${weatherInfo.precipitation}"
                        wind-speed="${weatherInfo.windSpeed}"
                        compact>
                    </stats-grid>
                </div>
            `;
        } else {
            // Full version for weather page
            this.innerHTML = `
                <div class="weather-card-content">
                    ${cityDisplay}
                    <div class="main-weather">
                        <temperature-display 
                            temperature="${weatherInfo.temperature}" 
                            unit="${weatherService.getTempUnit()}"
                            size="large">
                        </temperature-display>
                        <div class="condition">${weatherInfo.condition}</div>
                    </div>
                    <stats-grid 
                        humidity="${weatherInfo.humidity}"
                        precipitation="${weatherInfo.precipitation}"
                        wind-speed="${weatherInfo.windSpeed}">
                    </stats-grid>
                </div>
            `;
        }
    }

    // Public API
    refresh() {
        this.render();
    }

    setWeatherData(data) {
        this._weatherData = data;
        this.render();
    }
}

customElements.define('weather-card', WeatherCard);