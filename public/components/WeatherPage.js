import { Router } from "../services/Router.js";
import { weatherService } from "../services/WeatherService.js";

// Import weather components
import './weather/WeatherControls.js';
import './weather/WeatherCurrent.js';
import './weather/WeatherMeta.js';
import './weather/WeatherMap.js';
import './weather/WeatherDebug.js';

export class WeatherPage extends HTMLElement {
    constructor() {
        super();
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
        // Subscribe to weather service updates to update city name
        this.unsubscribe = weatherService.subscribe((update) => {
            if (update.type === 'weather-updated') {
                this.updateCityName();
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
        const weatherCurrent = this.querySelector('weather-current');
        const saved = weatherService.loadSavedCity();
        if (weatherCurrent && saved) {
            weatherCurrent.setAttribute('city-name', saved.name);
        }
    }
}

customElements.define("weather-page", WeatherPage);
