class WeatherService {
    constructor() {
        this.FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
        this.GEOCODE_API = 'https://nominatim.openstreetmap.org/search';
        
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

    // Geocoding API
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

    // Weather data fetching
    async fetchWeatherData(lat, lon) {
        const url = `${this.FORECAST_API}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
        
        try {
            const res = await fetch(url);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || res.status);
            }
            const data = await res.json();
            
            // Cache the data
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