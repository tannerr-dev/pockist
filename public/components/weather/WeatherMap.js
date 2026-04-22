import { weatherService } from '../../services/WeatherService.js';

export class WeatherMap extends HTMLElement {
    constructor() {
        super();
        
        // Map variables
        this.map = null;
        this.marker = null;
        this.tileLayer = null;
        this.unsubscribe = null;
        
        // Tile layer configurations
        this.LIGHT_TILES = { 
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
        };
        this.DARK_TILES = { 
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', 
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' 
        };
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

        // Subscribe to weather service updates
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this._updateMap(update.data.latitude, update.data.longitude);
            }
        });

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
        // Theme change listeners cleanup
        // Note: matchMedia listeners persist but are page-level, no cleanup needed per instance
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
        const mapAttrEl = this.querySelector('#mapAttr');
        
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
            
            if (mapAttrEl) {
                mapAttrEl.innerHTML = tiles.attr;
            }

            // Theme change listeners
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (this.tileLayer && mapAttrEl) {
                    this.tileLayer.setUrl(this.getTiles().url);
                    mapAttrEl.innerHTML = this.getTiles().attr;
                }
            });

            window.addEventListener('storage', (e) => {
                if (e.key === 'theme' && this.tileLayer && mapAttrEl) {
                    this.tileLayer.setUrl(this.getTiles().url);
                    mapAttrEl.innerHTML = this.getTiles().attr;
                }
            });
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
