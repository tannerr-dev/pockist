import { Router } from "../services/Router.js";
import { weatherService } from "../services/WeatherService.js";

// Import weather components
import './weather/TemperatureDisplay.js';
import './weather/StatsGrid.js';
import './weather/WeatherCard.js';
import './weather/WeatherControls.js';

export class WeatherPage extends HTMLElement {
    constructor() {
        super();
        
        // Map variables
        this.map = null;
        this.marker = null;
        this.tileLayer = null;
        
        // Tile layer configurations
        this.LIGHT_TILES = { 
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', 
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
        };
        this.DARK_TILES = { 
            url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', 
            attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' 
        };
        
        this.unsubscribe = null;
    }

    connectedCallback() {
        // Add the weather class to this component for CSS styling
        this.classList.add('weather');
        
        const template = document.getElementById("weather-page");
        const content = template.content.cloneNode(true);
        this.appendChild(content);
        
        // Set up PWA navigation links
        document.querySelectorAll("a.pwa").forEach(a=>{
            a.addEventListener("click", event => {
                event.preventDefault();
                const href = a.getAttribute("href");
                Router.go(href);
            })
        });

        // Initialize weather functionality
        this.initializeWeatherComponent();
    }

    disconnectedCallback() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    initializeWeatherComponent() {
        // Subscribe to weather service updates
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this.updateCityName();
                this.updateMap(update.data.latitude, update.data.longitude);
                this.displayMeta(update.data);
                this.displayDebugData(update.data);
            }
        });

        // Set up event listeners for weather controls
        const weatherControls = this.querySelector('weather-controls');
        if (weatherControls) {
            weatherControls.addEventListener('weather-search-success', (e) => {
                this.updateCityName();
            });
        }

        // Initialize with saved city data
        this.loadInitialData();
    }

    async loadInitialData() {
        const saved = await weatherService.loadSavedCityWeather();
        if (saved) {
            this.updateCityName();
        }
    }

    updateCityName() {
        const weatherCard = this.querySelector('weather-card');
        const saved = weatherService.loadSavedCity();
        if (weatherCard && saved) {
            weatherCard.setAttribute('city-name', saved.name);
        }
    }

    getTheme() {
        return localStorage.getItem('theme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    getTiles() {
        return this.getTheme() === 'dark' ? this.DARK_TILES : this.LIGHT_TILES;
    }

    updateMap(lat, lon) {
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
            
            const mapAttrEl = this.querySelector('#mapAttr');
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

    displayMeta(data) {
        const metaEl = this.querySelector('#meta');
        if (!metaEl) return;

        const items = [
            { label: 'Latitude', value: data.latitude },
            { label: 'Longitude', value: data.longitude },
            { label: 'Timezone', value: data.timezone },
            { label: 'Elevation', value: data.elevation + ' m' },
        ];

        metaEl.innerHTML = items.map(item => `
            <div class="meta-item">
                <div class="meta-label">${item.label}</div>
                <div class="meta-value">${item.value}</div>
            </div>
        `).join('');
    }

    displayDebugData(data) {
        const dataEl = this.querySelector('#data');
        if (dataEl) {
            dataEl.textContent = JSON.stringify(data, null, 2);
        }
    }
}

customElements.define("weather-page", WeatherPage);