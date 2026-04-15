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
                    this._compact = newValue !== 'false';
                    break;
                case 'show-city':
                    this._showCity = newValue !== 'false';
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
            // Compact version for widgets - simpler layout
            this.innerHTML = `
                <div class="compact-weather">
                    ${cityDisplay}
                    <div class="compact-main">
                        <div class="current-temp">${weatherInfo.tempFormatted}</div>
                        <div class="current-condition">${weatherInfo.condition}</div>
                    </div>
                    <div class="compact-stats">
                        <div class="compact-stat">
                            <span>💧 ${weatherInfo.humidity}%</span>
                            <span>💨 ${weatherInfo.windSpeed} m/s</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Full version for weather page - use original bento box design
            this.innerHTML = `
                <div class="current">
                    <div class="current-main">
                        <div class="current-temp">${weatherInfo.tempFormatted}</div>
                        <div class="current-condition">${weatherInfo.condition}</div>
                    </div>
                    <div class="current-stats">
                        <div class="current-stat">
                            <span class="current-stat-label">Humidity</span>
                            <span class="current-stat-value">${weatherInfo.humidity}%</span>
                        </div>
                        <div class="current-stat">
                            <span class="current-stat-label">Rain</span>
                            <span class="current-stat-value">${weatherInfo.precipitation} mm</span>
                        </div>
                        <div class="current-stat">
                            <span class="current-stat-label">Wind</span>
                            <span class="current-stat-value">${weatherInfo.windSpeed} m/s</span>
                        </div>
                    </div>
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
