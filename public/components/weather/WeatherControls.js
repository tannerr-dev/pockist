import { weatherService } from '../../services/WeatherService.js';

export class WeatherControls extends HTMLElement {
    constructor() {
        super();
        this._showSearch = true;
        this._showUnit = true;
        this.unsubscribe = null;
    }

    static get observedAttributes() {
        return ['show-search', 'show-unit'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            switch (name) {
                case 'show-search':
                    this._showSearch = newValue !== 'false';
                    break;
                case 'show-unit':
                    this._showUnit = newValue !== 'false';
                    break;
            }
            this.render();
        }
    }

    connectedCallback() {
        this.classList.add('weather-controls');

        // Subscribe to weather service updates for unit changes
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'unit-changed') {
                this.updateUnitButton();
            }
        });

        this.render();
        this.attachEventListeners();
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    render() {
        let searchSection = '';
        if (this._showSearch) {
            searchSection = `
                <div class="search-section">
                    <input type="text" 
                           id="cityInput" 
                           placeholder="City Name, State. Saint Paul, MN"
                           class="city-input">
                    <button type="button" class="fetch-btn">Fetch</button>
                </div>
            `;
        }

        let unitSection = '';
        if (this._showUnit) {
            const currentUnit = weatherService.getTempUnit();
            unitSection = `
                <div class="unit-section">
                    <button type="button" class="unit-btn" id="unitBtn">°${currentUnit}</button>
                </div>
            `;
        }

        this.innerHTML = `
            <div class="controls-container">
                ${searchSection}
                ${unitSection}
                <div class="status-section">
                    <div class="error-message" id="error"></div>
                    <div class="loading-message" id="loading"></div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Search functionality
        if (this._showSearch) {
            const fetchBtn = this.querySelector('.fetch-btn');
            const cityInput = this.querySelector('.city-input');
            
            if (fetchBtn) {
                fetchBtn.addEventListener('click', () => this.handleSearch());
            }

            if (cityInput) {
                cityInput.addEventListener('keydown', (event) => {
                    if (event.code === 'Enter') {
                        this.handleSearch();
                    }
                });

                // Load saved city name
                const saved = weatherService.loadSavedCity();
                if (saved) {
                    cityInput.value = saved.name;
                }
            }
        }

        // Unit toggle functionality
        if (this._showUnit) {
            const unitBtn = this.querySelector('.unit-btn');
            if (unitBtn) {
                unitBtn.addEventListener('click', () => this.handleUnitToggle());
            }
        }
    }

    async handleSearch() {
        const cityInput = this.querySelector('.city-input');
        const errorEl = this.querySelector('#error');
        const loadingEl = this.querySelector('#loading');

        if (!cityInput || !errorEl) return;

        const cityName = cityInput.value.trim();

        if (!cityName) {
            errorEl.textContent = 'Enter a city';
            return;
        }

        try {
            errorEl.textContent = '';
            if (loadingEl) loadingEl.textContent = 'Searching...';

            await weatherService.searchAndFetchCity(cityName);

            if (loadingEl) loadingEl.textContent = '';
            
            // Emit custom event for parent components
            this.dispatchEvent(new CustomEvent('weather-search-success', {
                detail: { cityName },
                bubbles: true
            }));

        } catch (error) {
            errorEl.textContent = error.message;
            if (loadingEl) loadingEl.textContent = '';

            // Emit custom event for error handling
            this.dispatchEvent(new CustomEvent('weather-search-error', {
                detail: { error: error.message, cityName },
                bubbles: true
            }));
        }
    }

    handleUnitToggle() {
        const newUnit = weatherService.toggleUnit();
        this.updateUnitButton();

        // Emit custom event for unit change
        this.dispatchEvent(new CustomEvent('weather-unit-changed', {
            detail: { newUnit },
            bubbles: true
        }));
    }

    updateUnitButton() {
        const unitBtn = this.querySelector('#unitBtn');
        if (unitBtn) {
            unitBtn.textContent = `°${weatherService.getTempUnit()}`;
        }
    }

    // Public API
    setError(message) {
        const errorEl = this.querySelector('#error');
        if (errorEl) {
            errorEl.textContent = message;
        }
    }

    clearError() {
        const errorEl = this.querySelector('#error');
        if (errorEl) {
            errorEl.textContent = '';
        }
    }

    setLoading(message) {
        const loadingEl = this.querySelector('#loading');
        if (loadingEl) {
            loadingEl.textContent = message;
        }
    }

    clearLoading() {
        const loadingEl = this.querySelector('#loading');
        if (loadingEl) {
            loadingEl.textContent = '';
        }
    }

    getCityInput() {
        const cityInput = this.querySelector('.city-input');
        return cityInput ? cityInput.value.trim() : '';
    }

    setCityInput(cityName) {
        const cityInput = this.querySelector('.city-input');
        if (cityInput) {
            cityInput.value = cityName;
        }
    }
}

customElements.define('weather-controls', WeatherControls);