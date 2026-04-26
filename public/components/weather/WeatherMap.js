import { weatherService } from '../../services/WeatherService.js';

export class WeatherMap extends HTMLElement {
    constructor() {
        super();

        // Map variables
        this.map = null;
        this.marker = null;
        this.tileLayer = null;
        this.unsubscribe = null;
        this._mapAttrEl = null;

        // Tile layer configurations
        this.LIGHT_TILES = {
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        };
        this.DARK_TILES = {
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        };

        // Bound event handlers for proper cleanup
        this._handleThemeChange = this._handleThemeChange.bind(this);
        this._handleStorageChange = this._handleStorageChange.bind(this);
    }

    connectedCallback() {
        this.classList.add('weather-map');

        // Clone template
        const template = document.getElementById('weather-map');
        if (!template) {
            console.error('weather-map template not found');
            return;
        }
        const content = template.content.cloneNode(true);
        this.appendChild(content);

        // Cache attribution element reference
        this._mapAttrEl = this.querySelector('#mapAttr');

        // Subscribe to weather service updates
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this._updateMap(update.data.latitude, update.data.longitude);
            }
        });

        // Setup theme change listeners (only once)
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this._handleThemeChange);
        window.addEventListener('storage', this._handleStorageChange);

        // Try to get existing weather data
        const data = weatherService.getCurrentData();
        if (data) {
            this._updateMap(data.latitude, data.longitude);
        }
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        // Clean up theme change listeners
        window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', this._handleThemeChange);
        window.removeEventListener('storage', this._handleStorageChange);
        // Clean up Leaflet map instance
        if (this.map) {
            this.map.remove();
            this.map = null;
            this.marker = null;
            this.tileLayer = null;
        }
    }

    _handleThemeChange() {
        if (this.tileLayer && this._mapAttrEl) {
            const tiles = this.getTiles();
            this.tileLayer.setUrl(tiles.url);
            this._mapAttrEl.innerHTML = tiles.attr;
        }
    }

    _handleStorageChange(e) {
        if (e.key === 'theme' && this.tileLayer && this._mapAttrEl) {
            const tiles = this.getTiles();
            this.tileLayer.setUrl(tiles.url);
            this._mapAttrEl.innerHTML = tiles.attr;
        }
    }

    getTheme() {
        return localStorage.getItem('theme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    getTiles() {
        return this.getTheme() === 'dark' ? this.DARK_TILES : this.LIGHT_TILES;
    }

    _updateMap(lat, lon) {
        const zoomVar = 6;
        const mapEl = this.querySelector('#map');

        if (!mapEl) return;

        if (!this.map) {
            this.map = L.map(mapEl, {
                zoomControl: false,
                attributionControl: false,
                scrollWheelZoom: false,
                touchZoom: false,
                doubleClickZoom: false,
                dragging: false
            }).setView([lat, lon], zoomVar);

            const tiles = this.getTiles();
            this.tileLayer = L.tileLayer(tiles.url, { attribution: false }).addTo(this.map);

            if (this._mapAttrEl) {
                this._mapAttrEl.innerHTML = tiles.attr;
            }
        }

        this.map.setView([lat, lon], zoomVar);
        if (this.marker) {
            this.marker.setLatLng([lat, lon]);
        } else {
            this.marker = L.marker([lat, lon]).addTo(this.map);
        }
    }

    // Public API
    refresh() {
        const data = weatherService.getCurrentData();
        if (data) {
            this._updateMap(data.latitude, data.longitude);
        }
    }
}

customElements.define('weather-map', WeatherMap);
