import { API } from "../services/API.js";
import { Router } from "../services/Router.js";

export class WeatherPage extends HTMLElement {
    constructor() {
        super();
        
        // Weather API constants
        this.FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
        this.GEOCODE_API = 'https://nominatim.openstreetmap.org/search';
        
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
        
        // Temperature unit
        this.tempUnit = localStorage.getItem('tempUnit') || 'C';
        
        // WMO weather codes
        this.WMO_CODES = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog',
            51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
            56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
            61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            66: 'Light freezing rain', 67: 'Heavy freezing rain',
            71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
            77: 'Snow grains',
            80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
            85: 'Slight snow showers', 86: 'Heavy snow showers',
            95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
        };
        
        // Current weather data
        this.currentData = null;
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

    initializeWeatherComponent() {
        // Set up temperature unit button
        const unitBtn = this.querySelector('#unitBtn');
        if (unitBtn) {
            unitBtn.textContent = `°${this.tempUnit}`;
            unitBtn.addEventListener('click', () => this.toggleUnit());
        }

        // Set up fetch button
        const fetchBtn = this.querySelector('button');
        if (fetchBtn && fetchBtn.textContent === 'Fetch') {
            fetchBtn.addEventListener('click', () => this.saveAndFetch());
        }

        // Set up Enter key handling
        const cityInput = this.querySelector('#cityInput');
        if (cityInput) {
            cityInput.addEventListener('keydown', (event) => {
                if (event.code === "Enter") {
                    console.log("enter pressed");
                    this.saveAndFetch();
                }
            });
        }

        // Clear error message
        const errorEl = this.querySelector('#error');
        if (errorEl) {
            errorEl.textContent = '';
        }

        // Load saved city and fetch weather
        const saved = this.loadSavedCity();
        if (saved) {
            if (cityInput) {
                cityInput.value = saved.name;
            }
            this.fetchWeatherData(saved.lat, saved.lon);
        }
    }

    getTheme() {
        return localStorage.getItem('theme') || 
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }

    getTiles() {
        return this.getTheme() === 'dark' ? this.DARK_TILES : this.LIGHT_TILES;
    }

    updateMap(lat, lon, cityName) {
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

    saveCity(name, lat, lon) {
        localStorage.setItem('weatherCity', JSON.stringify({ name, lat, lon }));
    }

    loadSavedCity() {
        try {
            const saved = localStorage.getItem('weatherCity');
            return saved ? JSON.parse(saved) : null;
        } catch {
            localStorage.removeItem('weatherCity');
            return null;
        }
    }

    toggleUnit() {
        this.tempUnit = this.tempUnit === 'C' ? 'F' : 'C';
        localStorage.setItem('tempUnit', this.tempUnit);
        const unitBtn = this.querySelector('#unitBtn');
        if (unitBtn) {
            unitBtn.textContent = `°${this.tempUnit}`;
        }
        if (this.currentData) {
            this.displayCurrent(this.currentData);
        }
    }

    toF(c) {
        return (c * 9/5 + 32).toFixed(1);
    }

    formatTemp(c) {
        const val = this.tempUnit === 'F' ? this.toF(c) : c.toFixed(1);
        return `${val}°${this.tempUnit}`;
    }

    async geocodeCity(cityName) {
        const params = new URLSearchParams({ q: cityName, format: 'json', limit: '1' });
        const res = await fetch(`${this.GEOCODE_API}?${params}`, { 
            headers: { 'User-Agent': 'WeatherApp/1.0' } 
        });
        let results;
        try {
            results = await res.json();
        } catch {
            throw new Error('Invalid response from geocoding service');
        }
        if (!results || !Array.isArray(results) || !results.length) {
            throw new Error('City not found');
        }
        return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
    }

    async saveAndFetch() {
        const cityInput = this.querySelector('#cityInput');
        const errorEl = this.querySelector('#error');
        
        if (!cityInput || !errorEl) return;

        const cityName = cityInput.value.trim();

        if (!cityName) {
            errorEl.textContent = 'Enter a city';
            return;
        }

        try {
            errorEl.textContent = '';
            const coords = await this.geocodeCity(cityName);
            this.saveCity(cityName, coords.lat, coords.lon);
            await this.fetchWeatherData(coords.lat, coords.lon);
        } catch (e) {
            errorEl.textContent = e.message;
            const loadingEl = this.querySelector('#loading');
            if (loadingEl) {
                loadingEl.textContent = '';
            }
        }
    }

    async fetchWeatherData(lat, lon) {
        const url = `${this.FORECAST_API}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
        
        const errorEl = this.querySelector('#error');
        const loadingEl = this.querySelector('#loading');
        
        if (errorEl) errorEl.textContent = '';

        try {
            const res = await fetch(url);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || res.status);
            }
            const data = await res.json();

            if (loadingEl) loadingEl.textContent = '';
            this.displayCurrent(data);
            this.displayMeta(data);
            
            const saved = this.loadSavedCity();
            this.updateMap(data.latitude, data.longitude, saved?.name);
            
            const dataEl = this.querySelector('#data');
            if (dataEl) {
                dataEl.textContent = JSON.stringify(data, null, 2);
            }
        } catch (e) {
            if (errorEl) errorEl.textContent = e.message;
            if (loadingEl) loadingEl.textContent = '';
        }
    }

    displayCurrent(data) {
        this.currentData = data;
        const current = data.current;
        const temp = current.temperature_2m;
        const condition = this.WMO_CODES[current.weather_code] || 'Unknown';
        const humidity = current.relative_humidity_2m;
        const rain = current.precipitation;
        const wind = current.wind_speed_10m;

        const currentEl = this.querySelector('#current');
        if (currentEl) {
            currentEl.innerHTML = `
                <div class="current-main">
                    <div class="current-temp">${this.formatTemp(temp)}</div>
                    <div class="current-condition">${condition}</div>
                </div>
                <div class="current-stats">
                    <div class="current-stat">
                        <span class="current-stat-label">Humidity</span>
                        <span class="current-stat-value">${humidity}%</span>
                    </div>
                    <div class="current-stat">
                        <span class="current-stat-label">Rain</span>
                        <span class="current-stat-value">${rain} mm</span>
                    </div>
                    <div class="current-stat">
                        <span class="current-stat-label">Wind</span>
                        <span class="current-stat-value">${wind} m/s</span>
                    </div>
                </div>
            `;
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
}

customElements.define("weather-page", WeatherPage);
