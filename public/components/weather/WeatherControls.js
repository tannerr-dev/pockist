import { weatherService } from '../../services/WeatherService.js';

export class WeatherControls extends HTMLElement {
    constructor() {
        super();
        this._showSearch = true;
        this._showUnit = true;
        this.unsubscribe = null;
        
        // Cached element references
        this._cityInput = null;
        this._fetchBtn = null;
        this._unitBtn = null;
        this._errorEl = null;
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
            this._updateVisibility();
        }
    }

    connectedCallback() {
        this.classList.add('weather-controls');

        // Clone template
        const template = document.getElementById('weather-controls');
        if (!template) {
            console.error('weather-controls template not found');
            return;
        }
        const content = template.content.cloneNode(true);
        this.appendChild(content);

        // Cache element references
        this._cityInput = this.querySelector('#cityInput');
        this._fetchBtn = this.querySelector('.fetch-btn');
        this._unitBtn = this.querySelector('#unitBtn');
        this._errorEl = this.querySelector('#error');

        // Subscribe to weather service updates for unit changes
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'unit-changed') {
                this._updateUnitButton();
            }
        });

        this._updateVisibility();
        this._attachEventListeners();
        this._updateUnitButton();
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    _updateVisibility() {
        if (this._cityInput) {
            this._cityInput.style.display = this._showSearch ? '' : 'none';
        }
        if (this._fetchBtn) {
            this._fetchBtn.style.display = this._showSearch ? '' : 'none';
        }
        if (this._unitBtn) {
            this._unitBtn.style.display = this._showUnit ? '' : 'none';
        }
    }

    _attachEventListeners() {
        // Search functionality
        if (this._fetchBtn) {
            this._fetchBtn.addEventListener('click', () => this.handleSearch());
        }

        if (this._cityInput) {
            this._cityInput.addEventListener('keydown', (event) => {
                if (event.code === 'Enter') {
                    this.handleSearch();
                }
            });

            // Load saved city name
            const saved = weatherService.loadSavedCity();
            if (saved) {
                this._cityInput.value = saved.name;
            }
        }

        // Unit toggle functionality
        if (this._unitBtn) {
            this._unitBtn.addEventListener('click', () => this.handleUnitToggle());
        }
    }

    _setLoading(isLoading) {
        if (this._fetchBtn) {
            this._fetchBtn.textContent = isLoading ? 'Loading...' : 'Fetch';
            this._fetchBtn.disabled = isLoading;
        }
        if (this._cityInput) {
            this._cityInput.disabled = isLoading;
        }
        if (this._unitBtn) {
            this._unitBtn.disabled = isLoading;
        }
    }

    async handleSearch() {
        if (!this._cityInput || !this._errorEl) return;

        const cityName = this._cityInput.value.trim();

        if (!cityName) {
            this._errorEl.textContent = 'Enter a city';
            return;
        }

        try {
            this._errorEl.textContent = '';
            this._setLoading(true);

            await weatherService.searchAndFetchCity(cityName);

            this._setLoading(false);

            // Emit custom event for parent components
            this.dispatchEvent(new CustomEvent('weather-search-success', {
                detail: { cityName },
                bubbles: true
            }));

        } catch (error) {
            if (this._errorEl) this._errorEl.textContent = error.message;
            this._setLoading(false);

            // Emit custom event for error handling
            this.dispatchEvent(new CustomEvent('weather-search-error', {
                detail: { error: error.message, cityName },
                bubbles: true
            }));
        }
    }

    handleUnitToggle() {
        const newUnit = weatherService.toggleUnit();
        this._updateUnitButton();

        // Emit custom event for unit change
        this.dispatchEvent(new CustomEvent('weather-unit-changed', {
            detail: { newUnit },
            bubbles: true
        }));
    }

    _updateUnitButton() {
        if (this._unitBtn) {
            this._unitBtn.textContent = `°${weatherService.getTempUnit()}`;
        }
    }

    // Public API
    setError(message) {
        if (this._errorEl) {
            this._errorEl.textContent = message;
        }
    }

    clearError() {
        if (this._errorEl) {
            this._errorEl.textContent = '';
        }
    }

    getCityInput() {
        return this._cityInput ? this._cityInput.value.trim() : '';
    }

    setCityInput(cityName) {
        if (this._cityInput) {
            this._cityInput.value = cityName;
        }
    }
}

customElements.define('weather-controls', WeatherControls);
