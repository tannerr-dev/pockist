class WeatherService {
    constructor() {
        this.FORECAST_API = '/api/weather';
        this.GEOCODE_API = '/api/geocode';

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

        // Current weather data cache
        this.currentData = null;

        // Temperature unit preference
        this.tempUnit = localStorage.getItem('tempUnit') || 'C';

        // Subscribers for weather data changes
        this.subscribers = [];

        // Track in-flight requests to prevent duplicates
        this.inFlightRequests = new Map();
    }

    // Subscription system for components to listen to weather updates
    subscribe(callback) {
        this.subscribers.push(callback);
        // Return unsubscribe function
        return () => {
            const index = this.subscribers.indexOf(callback);
            if (index > -1) {
                this.subscribers.splice(index, 1);
            }
        };
    }

    // Notify all subscribers of weather data changes
    notifySubscribers(data) {
        this.subscribers.forEach(callback => callback(data));
    }

    // Temperature unit management
    getTempUnit() {
        return this.tempUnit;
    }

    setTempUnit(unit) {
        this.tempUnit = unit;
        localStorage.setItem('tempUnit', unit);
        // Notify subscribers of unit change
        if (this.currentData) {
            this.notifySubscribers({
                type: 'unit-changed',
                unit: unit,
                data: this.currentData
            });
        }
    }

    toggleUnit() {
        const newUnit = this.tempUnit === 'C' ? 'F' : 'C';
        this.setTempUnit(newUnit);
        return newUnit;
    }

    // Temperature conversion utilities
    toF(c) {
        return (c * 9/5 + 32).toFixed(1);
    }

    formatTemp(c) {
        const val = this.tempUnit === 'F' ? this.toF(c) : c.toFixed(1);
        return `${val}°${this.tempUnit}`;
    }

    // City management
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

    // Geocoding API (proxied through backend with caching)
    async geocodeCity(cityName) {
        const params = new URLSearchParams({ q: cityName });
        const res = await fetch(`${this.GEOCODE_API}?${params}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Geocoding failed' }));
            throw new Error(err.error || 'City not found');
        }
        const data = await res.json();
        return { lat: data.lat, lon: data.lon };
    }

    // Weather data fetching (now goes through server with caching)
    async fetchWeatherData(lat, lon) {
        // Round coordinates to 2 decimal places for consistent cache keys
        // (matches server-side rounding)
        const latRounded = Math.round(lat * 100) / 100;
        const lonRounded = Math.round(lon * 100) / 100;
        const cacheKey = `${latRounded},${lonRounded}`;

        // Check if there's already an in-flight request for these coordinates
        if (this.inFlightRequests.has(cacheKey)) {
            console.log(`[WeatherService] Reusing in-flight request for ${cacheKey}`);
            return this.inFlightRequests.get(cacheKey);
        }

        // Create the fetch promise
        const fetchPromise = this._doFetchWeather(latRounded, lonRounded);

        // Track the in-flight request
        this.inFlightRequests.set(cacheKey, fetchPromise);

        // Clean up when done (success or error)
        fetchPromise
            .then(() => {
                this.inFlightRequests.delete(cacheKey);
            })
            .catch(() => {
                this.inFlightRequests.delete(cacheKey);
            });

        return fetchPromise;
    }

    // Internal method to actually perform the fetch
    async _doFetchWeather(lat, lon) {
        const url = `${this.FORECAST_API}?lat=${lat}&lon=${lon}`;

        try {
            const res = await fetch(url);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || res.status);
            }
            const data = await res.json();

            // Cache the data locally
            this.currentData = data;

            // Notify subscribers
            this.notifySubscribers({
                type: 'weather-updated',
                data: data
            });

            return data;
        } catch (error) {
            // Notify subscribers of error
            this.notifySubscribers({
                type: 'weather-error',
                error: error.message
            });
            throw error;
        }
    }

    // Search and fetch weather for a city
    async searchAndFetchCity(cityName) {
        if (!cityName.trim()) {
            throw new Error('Enter a city');
        }

        try {
            const coords = await this.geocodeCity(cityName);
            this.saveCity(cityName, coords.lat, coords.lon);
            const data = await this.fetchWeatherData(coords.lat, coords.lon);
            return { coords, data };
        } catch (error) {
            throw error;
        }
    }

    // Get current weather data (cached)
    getCurrentData() {
        return this.currentData;
    }

    // Get processed current weather info
    getCurrentWeatherInfo() {
        if (!this.currentData) return null;
        
        const current = this.currentData.current;
        return {
            temperature: current.temperature_2m,
            tempFormatted: this.formatTemp(current.temperature_2m),
            condition: this.WMO_CODES[current.weather_code] || 'Unknown',
            humidity: current.relative_humidity_2m,
            precipitation: current.precipitation,
            windSpeed: current.wind_speed_10m,
            latitude: this.currentData.latitude,
            longitude: this.currentData.longitude,
            timezone: this.currentData.timezone,
            elevation: this.currentData.elevation
        };
    }

    // Auto-load saved city weather
    async loadSavedCityWeather() {
        const saved = this.loadSavedCity();
        if (saved) {
            try {
                await this.fetchWeatherData(saved.lat, saved.lon);
                return saved;
            } catch (error) {
                console.error('Failed to load saved city weather:', error);
                return null;
            }
        }
        return null;
    }
}

// Create and export a singleton instance
export const weatherService = new WeatherService();