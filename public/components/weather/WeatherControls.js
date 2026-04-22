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
        this._loadingEl = null;
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
        this._loadingEl = this.querySelector('#loading');

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

    async handleSearch() {
        if (!this._cityInput || !this._errorEl) return;

        const cityName = this._cityInput.value.trim();

        if (!cityName) {
            this._errorEl.textContent = 'Enter a city';
            return;
        }

        try {
            this._errorEl.textContent = '';
            if (this._loadingEl) this._loadingEl.textContent = 'Searching...';

            await weatherService.searchAndFetchCity(cityName);

            if (this._loadingEl) this._loadingEl.textContent = '';
            
            // Emit custom event for parent components
            this.dispatchEvent(new CustomEvent('weather-search-success', {
                detail: { cityName },
                bubbles: true
            }));

        } catch (error) {
            if (this._errorEl) this._errorEl.textContent = error.message;
            if (this._loadingEl) this._loadingEl.textContent = '';

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

    setLoading(message) {
        if (this._loadingEl) {
            this._loadingEl.textContent = message;
        }
    }

    clearLoading() {
        if (this._loadingEl) {
            this._loadingEl.textContent = '';
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
