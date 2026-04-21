package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"tannerr/pockist/pkg/cache"
)

// WeatherHandler handles weather API requests with caching
type WeatherHandler struct {
	cache      *cache.TTLCache
	httpClient *http.Client
}

// WeatherData represents the response from Open-Meteo API
type WeatherData struct {
	Latitude             float64 `json:"latitude"`
	Longitude            float64 `json:"longitude"`
	GenerationTimeMs     float64 `json:"generationtime_ms"`
	UTCOffsetSeconds     int     `json:"utc_offset_seconds"`
	Timezone             string  `json:"timezone"`
	TimezoneAbbreviation string  `json:"timezone_abbreviation"`
	Elevation            float64 `json:"elevation"`
	Current              Current `json:"current"`
	Hourly               Hourly  `json:"hourly"`
}

// Current represents current weather conditions
type Current struct {
	Time               string  `json:"time"`
	Temperature2m      float64 `json:"temperature_2m"`
	RelativeHumidity2m int     `json:"relative_humidity_2m"`
	Precipitation      float64 `json:"precipitation"`
	WeatherCode        int     `json:"weather_code"`
	WindSpeed10m       float64 `json:"wind_speed_10m"`
}

// Hourly represents hourly forecast data
type Hourly struct {
	Time          []string  `json:"time"`
	Temperature2m []float64 `json:"temperature_2m"`
}

// NewWeatherHandler creates a new weather handler with caching
func NewWeatherHandler() *WeatherHandler {
	return &WeatherHandler{
		// 20 minutes TTL, max 1000 entries
		cache: cache.NewTTLCache(1000, 20*time.Minute),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Weather handles GET /api/weather requests
func (h *WeatherHandler) Weather(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameters
	latStr := r.URL.Query().Get("lat")
	lonStr := r.URL.Query().Get("lon")

	if latStr == "" || lonStr == "" {
		http.Error(w, `{"error": "Missing lat or lon parameter"}`, http.StatusBadRequest)
		return
	}

	lat, err := strconv.ParseFloat(latStr, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid lat parameter"}`, http.StatusBadRequest)
		return
	}

	lon, err := strconv.ParseFloat(lonStr, 64)
	if err != nil {
		http.Error(w, `{"error": "Invalid lon parameter"}`, http.StatusBadRequest)
		return
	}

	// Round to 2 decimal places for nearby location caching
	latRounded := roundToDecimals(lat, 2)
	lonRounded := roundToDecimals(lon, 2)

	// Create cache key
	cacheKey := fmt.Sprintf("weather:%.2f,%.2f", latRounded, lonRounded)

	// Check cache first
	if cachedData, found := h.cache.Get(cacheKey); found {
		log.Printf("[Weather] Cache HIT for %s", cacheKey)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		json.NewEncoder(w).Encode(cachedData)
		return
	}

	// Fetch from Open-Meteo API
	log.Printf("[Weather] Cache MISS, fetching from API for %.2f,%.2f", latRounded, lonRounded)
	weatherData, err := h.fetchFromAPI(latRounded, lonRounded)
	if err != nil {
		log.Printf("[Weather] Error fetching from API: %v", err)
		http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Store in cache
	h.cache.Set(cacheKey, weatherData)
	log.Printf("[Weather] Cached data for %s (expires in 20m)", cacheKey)

	// Return response
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	json.NewEncoder(w).Encode(weatherData)
}

// fetchFromAPI fetches weather data from Open-Meteo API
func (h *WeatherHandler) fetchFromAPI(lat, lon float64) (*WeatherData, error) {
	url := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%.2f&longitude=%.2f&hourly=temperature_2m&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&timezone=auto",
		lat, lon,
	)

	resp, err := h.httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch weather data: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("weather API error: %s", string(body))
	}

	var weatherData WeatherData
	if err := json.NewDecoder(resp.Body).Decode(&weatherData); err != nil {
		return nil, fmt.Errorf("failed to decode weather data: %w", err)
	}

	return &weatherData, nil
}

// roundToDecimals rounds a float64 to the specified number of decimal places
func roundToDecimals(value float64, decimals int) float64 {
	factor := 1.0
	for i := 0; i < decimals; i++ {
		factor *= 10
	}
	return math.Round(value*factor) / factor
}
