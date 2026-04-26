import { Router } from '../../services/Router.js';
import { weatherService } from '../../services/WeatherService.js';

export class WeatherCurrent extends HTMLElement {
    constructor() {
        super();
        this._weatherData = null;
        this._showCity = false;
        this._cityName = '';
        this._clickable = false;
        this.unsubscribe = null;
        
        // Cached element references
        this._noDataEl = null;
        this._contentEl = null;
        this._errorEl = null;
        this._cityEl = null;
        this._tempEl = null;
        this._conditionEl = null;
        this._humidityEl = null;
        this._precipitationEl = null;
        this._windEl = null;
    }

    static get observedAttributes() {
        return ['show-city', 'city-name', 'clickable'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            switch (name) {
                case 'show-city':
                    this._showCity = newValue !== 'false';
                    break;
                case 'city-name':
                    this._cityName = newValue || '';
                    break;
                case 'clickable':
                    this._clickable = newValue !== 'false';
                    this._updateClickable();
                    break;
            }
            this._updateView();
        }
    }

    connectedCallback() {
        this.classList.add('weather-current');

        // Clone template
        const template = document.getElementById('weather-current');
        if (!template) {
            console.error('weather-current template not found');
            return;
        }
        const content = template.content.cloneNode(true);
        this.appendChild(content);

        // Cache element references
        this._noDataEl = this.querySelector('.no-data-message');
        this._contentEl = this.querySelector('.weather-data-content');
        this._errorEl = this.querySelector('.error-message');
        this._cityEl = this.querySelector('.city-name');
        this._tempEl = this.querySelector('.current-temp');
        this._conditionEl = this.querySelector('.current-condition');
        this._humidityEl = this.querySelector('.humidity');
        this._precipitationEl = this.querySelector('.precipitation');
        this._windEl = this.querySelector('.wind');

        // Setup clickable behavior
        this._updateClickable();

        // Subscribe to weather service updates
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this._weatherData = update.data;
                this._clearError();
                this._updateView();
            } else if (update.type === 'weather-error') {
                this._showError();
            } else if (update.type === 'unit-changed') {
                this._updateView();
            }
        });

        // Try to get existing weather data
        this._weatherData = weatherService.getCurrentData();
        this._updateView();

        // Auto-load saved city weather if no data yet
        if (!this._weatherData) {
            this._loadSavedWeather();
        }
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        this.removeEventListener('click', this._handleClick);
    }

    _updateClickable() {
        if (this._clickable) {
            this.style.cursor = 'pointer';
            this.addEventListener('click', this._handleClick);
        } else {
            this.style.cursor = '';
            this.removeEventListener('click', this._handleClick);
        }
    }

    _handleClick = () => {
        if (this._clickable) {
            Router.go('/weather');
        }
    }

    async _loadSavedWeather() {
        try {
            await weatherService.loadSavedCityWeather();
        } catch (error) {
            console.log('No saved weather data or failed to load');
            this._showError();
        }
    }

    _showError() {
        if (this._noDataEl) {
            this._noDataEl.style.display = 'none';
        }
        if (this._contentEl) {
            this._contentEl.style.display = 'none';
        }
        if (this._errorEl) {
            this._errorEl.style.display = '';
        }
    }

    _clearError() {
        if (this._errorEl) {
            this._errorEl.style.display = 'none';
        }
    }

    getWeatherInfo() {
        return weatherService.getCurrentWeatherInfo();
    }

    _updateView() {
        const weatherInfo = this.getWeatherInfo();

        if (!weatherInfo) {
            // No data - show no-data message
            if (this._noDataEl) {
                this._noDataEl.style.display = '';
            }
            if (this._contentEl) {
                this._contentEl.style.display = 'none';
            }
            return;
        }

        // Has data - show content
        if (this._noDataEl) {
            this._noDataEl.style.display = 'none';
        }
        if (this._contentEl) {
            this._contentEl.style.display = '';
        }

        // Update city name - get from attribute or from saved city
        if (this._cityEl) {
            let displayCityName = this._cityName;
            if (this._showCity && !displayCityName) {
                const saved = weatherService.loadSavedCity();
                displayCityName = saved?.name || '';
            }
            this._cityEl.textContent = this._showCity && displayCityName ? displayCityName : '--';
            this._cityEl.classList.remove('skeleton-text');
        }

        // Update weather data
        if (this._tempEl) {
            this._tempEl.textContent = weatherInfo.tempFormatted;
            this._tempEl.classList.remove('skeleton-text');
        }

        if (this._conditionEl) {
            this._conditionEl.textContent = weatherInfo.condition;
            this._conditionEl.classList.remove('skeleton-text');
        }

        if (this._humidityEl) {
            this._humidityEl.textContent = `${weatherInfo.humidity}%`;
            this._humidityEl.classList.remove('skeleton-text');
        }

        if (this._precipitationEl) {
            this._precipitationEl.textContent = `${weatherInfo.precipitation} mm`;
            this._precipitationEl.classList.remove('skeleton-text');
        }

        if (this._windEl) {
            this._windEl.textContent = `${weatherInfo.windSpeed} m/s`;
            this._windEl.classList.remove('skeleton-text');
        }
    }

    // Public API
    refresh() {
        this._updateView();
    }

    setWeatherData(data) {
        this._weatherData = data;
        this._updateView();
    }
}

customElements.define('weather-current', WeatherCurrent);
