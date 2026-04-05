const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_API = 'https://nominatim.openstreetmap.org/search';

let map = null;
let marker = null;
let tileLayer = null;

const LIGHT_TILES = { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' };
const DARK_TILES = { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' };

function getTheme() {
    return localStorage.getItem('theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function getTiles() {
    return getTheme() === 'dark' ? DARK_TILES : LIGHT_TILES;
}

function updateMap(lat, lon, cityName) {
    const zoomVar = 6
    if (!map) {
        map = L.map('map', { zoomControl: false, attributionControl: false, scrollWheelZoom: false, touchZoom: false, doubleClickZoom: false, dragging: false }).setView([lat, lon], zoomVar);
        const tiles = getTiles();
        tileLayer = L.tileLayer(tiles.url, { attribution: false }).addTo(map);
        document.getElementById('mapAttr').innerHTML = tiles.attr;
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (tileLayer) {
                tileLayer.setUrl(getTiles().url);
                document.getElementById('mapAttr').innerHTML = getTiles().attr;
            }
        });
        window.addEventListener('storage', (e) => {
            if (e.key === 'theme' && tileLayer) {
                tileLayer.setUrl(getTiles().url);
                document.getElementById('mapAttr').innerHTML = getTiles().attr;
            }
        });
    }
    map.setView([lat, lon], zoomVar);
    if (marker) {
        marker.setLatLng([lat, lon]);
    } else {
        marker = L.marker([lat, lon]).addTo(map);
    }

}

function saveCity(name, lat, lon) {
    localStorage.setItem('weatherCity', JSON.stringify({ name, lat, lon }));
}

function loadSavedCity() {
    try {
        const saved = localStorage.getItem('weatherCity');
        return saved ? JSON.parse(saved) : null;
    } catch {
        localStorage.removeItem('weatherCity');
        return null;
    }
}

let tempUnit = localStorage.getItem('tempUnit') || 'C';
document.getElementById('unitBtn').textContent = `°${tempUnit}`;

function toggleUnit() {
    tempUnit = tempUnit === 'C' ? 'F' : 'C';
    localStorage.setItem('tempUnit', tempUnit);
    document.getElementById('unitBtn').textContent = `°${tempUnit}`;
    if (window.currentData) displayCurrent(window.currentData);
}

function toF(c) {
    return (c * 9/5 + 32).toFixed(1);
}

function formatTemp(c) {
    const val = tempUnit === 'F' ? toF(c) : c.toFixed(1);
    return `${val}°${tempUnit}`;
}

async function geocodeCity(cityName) {
    const params = new URLSearchParams({ q: cityName, format: 'json', limit: '1' });
    const res = await fetch(`${GEOCODE_API}?${params}`, { headers: { 'User-Agent': 'WeatherApp/1.0' } });
    let results;
    try {
        results = await res.json();
    } catch {
        throw new Error('Invalid response from geocoding service');
    }
    if (!results || !Array.isArray(results) || !results.length) throw new Error('City not found');
    return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
}

async function saveAndFetch() {
    const cityName = document.getElementById('cityInput').value.trim();

    if (!cityName) {
        document.getElementById('error').textContent = 'Enter a city';
        return;
    }

    try {
        document.getElementById('error').textContent = '';
        //document.getElementById('loading').textContent = 'Looking up city...';
        const coords = await geocodeCity(cityName);
        saveCity(cityName, coords.lat, coords.lon);
        await fetchWeatherData(coords.lat, coords.lon);
    } catch (e) {
        document.getElementById('error').textContent = e.message;
        document.getElementById('loading').textContent = '';
    }
}

const WMO_CODES = {
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

async function fetchWeatherData(lat, lon) {
    const url = `${FORECAST_API}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    document.getElementById('error').textContent = '';
    //document.getElementById('loading').textContent = 'Fetching data...';

    const res = await fetch(url);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || res.status);
    }
    const data = await res.json();

    document.getElementById('loading').textContent = '';
    displayCurrent(data);
    displayMeta(data);
    const saved = loadSavedCity();
    updateMap(data.latitude, data.longitude, saved?.name);
    document.getElementById('data').textContent = JSON.stringify(data, null, 2);
}

function displayCurrent(data) {
    window.currentData = data;
    const current = data.current;
    const temp = current.temperature_2m;
    const condition = WMO_CODES[current.weather_code] || 'Unknown';
    const humidity = current.relative_humidity_2m;
    const rain = current.precipitation;
    const wind = current.wind_speed_10m;

    document.getElementById('current').innerHTML = `
        <div class="current-main">
            <div class="current-temp">${formatTemp(temp)}</div>
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

function displayMeta(data) {
    const meta = document.getElementById('meta');
    const items = [
        { label: 'Latitude', value: data.latitude },
        { label: 'Longitude', value: data.longitude },
        { label: 'Timezone', value: data.timezone },
        { label: 'Elevation', value: data.elevation + ' m' },
        //{ label: 'UTC Offset', value: data.utc_offset_seconds / 3600 + ' hrs' },
        //{ label: 'Generation Time', value: (data.generationtime_ms / 1000).toFixed(2) + ' s' }
    ];

    meta.innerHTML = items.map(item => `
        <div class="meta-item">
            <div class="meta-label">${item.label}</div>
            <div class="meta-value">${item.value}</div>
        </div>
    `).join('');
}

window.addEventListener("load", ()=>{
    document.getElementById('error').textContent = '';
    const saved = loadSavedCity();
    if (saved) {
        document.getElementById('cityInput').value = saved.name;
        fetchWeatherData(saved.lat, saved.lon);
    }
});
document.addEventListener("keydown", (event)=>{
    if (event.code == "Enter"){
        console.log("enter pressed")
        saveAndFetch();
    }
})
