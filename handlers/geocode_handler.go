package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"tannerr/pockist/pkg/cache"
)

// RateLimiter implements a simple rate limiter for API requests
type RateLimiter struct {
	mu          sync.Mutex
	lastRequest time.Time
	minInterval time.Duration
}

// NewRateLimiter creates a new rate limiter with the specified minimum interval between requests
func NewRateLimiter(minInterval time.Duration) *RateLimiter {
	return &RateLimiter{
		minInterval: minInterval,
	}
}

// Wait blocks until it's safe to make the next request
func (rl *RateLimiter) Wait(ctx context.Context) error {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	elapsed := time.Since(rl.lastRequest)
	if elapsed < rl.minInterval {
		delay := rl.minInterval - elapsed
		select {
		case <-time.After(delay):
			// Continue
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	rl.lastRequest = time.Now()
	return nil
}

// GeocodeHandler handles geocoding API requests with caching
type GeocodeHandler struct {
	cache       *cache.TTLCache
	httpClient  *http.Client
	apiBaseURL  string
	rateLimiter *RateLimiter
}

// NominatimResult represents a single result from Nominatim API
type NominatimResult struct {
	PlaceID     int                    `json:"place_id"`
	Licence     string                 `json:"licence"`
	Lat         string                 `json:"lat"`
	Lon         string                 `json:"lon"`
	DisplayName string                 `json:"display_name"`
	Type        string                 `json:"type"`
	Importance  float64                `json:"importance"`
	Address     map[string]interface{} `json:"address,omitempty"`
}

// GeocodeResponse is our simplified response format
type GeocodeResponse struct {
	Lat         float64 `json:"lat"`
	Lon         float64 `json:"lon"`
	DisplayName string  `json:"display_name"`
	Type        string  `json:"type"`
}

// NewGeocodeHandler creates a new geocode handler with caching
func NewGeocodeHandler() *GeocodeHandler {
	return &GeocodeHandler{
		// 7 days TTL (addresses rarely change), max 5000 entries
		cache: cache.NewTTLCache(5000, 7*24*time.Hour),
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		apiBaseURL:  "https://nominatim.openstreetmap.org/search",
		rateLimiter: NewRateLimiter(1 * time.Second), // Nominatim requires max 1 req/sec
	}
}

// Geocode handles GET /api/geocode requests
func (h *GeocodeHandler) Geocode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Parse query parameter
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		http.Error(w, `{"error": "Missing q parameter"}`, http.StatusBadRequest)
		return
	}

	// Normalize cache key (lowercase, trim spaces)
	cacheKey := fmt.Sprintf("geocode:%s", strings.ToLower(query))

	// Check cache first
	if cachedData, found := h.cache.Get(cacheKey); found {
		log.Printf("[CACHE-HIT] Geocode API | Query: %q", query)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")
		json.NewEncoder(w).Encode(cachedData)
		return
	}

	// Fetch from Nominatim API
	log.Printf("[CACHE-MISS] Geocode API | Query: %q", query)
	results, err := h.fetchFromAPI(r.Context(), query, r.Header.Get("Accept-Language"))
	if err != nil {
		log.Printf("[API-ERROR] Geocode API | %v", err)
		statusCode := http.StatusInternalServerError
		if err == context.DeadlineExceeded || err == context.Canceled {
			statusCode = http.StatusGatewayTimeout
		}
		http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), statusCode)
		return
	}

	if len(results) == 0 {
		http.Error(w, `{"error": "Location not found"}`, http.StatusNotFound)
		return
	}

	// Take the first (most relevant) result
	response, err := h.convertToResponse(&results[0])
	if err != nil {
		log.Printf("[PARSE-ERROR] Geocode API | %v", err)
		http.Error(w, fmt.Sprintf(`{"error": "Invalid response from geocoding service: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Store in cache
	h.cache.Set(cacheKey, response)
	log.Printf("[CACHE-STORE] Geocode API | Query: %q | TTL: 7d", query)

	// Return response
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	json.NewEncoder(w).Encode(response)
}

// fetchFromAPI fetches geocoding data from Nominatim API
func (h *GeocodeHandler) fetchFromAPI(ctx context.Context, query string, acceptLanguage string) ([]NominatimResult, error) {
	// Respect rate limiting
	if err := h.rateLimiter.Wait(ctx); err != nil {
		return nil, err
	}

	params := url.Values{
		"q":      {query},
		"format": {"json"},
		"limit":  {"1"},
	}

	reqURL := fmt.Sprintf("%s?%s", h.apiBaseURL, params.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Nominatim requires User-Agent header
	req.Header.Set("User-Agent", "PockistWeatherApp/1.0")

	// Forward Accept-Language for localized results
	if acceptLanguage != "" {
		req.Header.Set("Accept-Language", acceptLanguage)
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch geocode data: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("geocode API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var results []NominatimResult
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		return nil, fmt.Errorf("failed to decode geocode data: %w", err)
	}

	return results, nil
}

// convertToResponse converts a NominatimResult to GeocodeResponse with validation
func (h *GeocodeHandler) convertToResponse(result *NominatimResult) (*GeocodeResponse, error) {
	if result.Lat == "" || result.Lon == "" {
		return nil, fmt.Errorf("missing coordinates in API response")
	}

	lat, err := parseCoordinate(result.Lat)
	if err != nil {
		return nil, fmt.Errorf("invalid latitude '%s': %w", result.Lat, err)
	}

	lon, err := parseCoordinate(result.Lon)
	if err != nil {
		return nil, fmt.Errorf("invalid longitude '%s': %w", result.Lon, err)
	}

	// Validate coordinate ranges
	if lat < -90 || lat > 90 {
		return nil, fmt.Errorf("latitude out of range: %f (must be between -90 and 90)", lat)
	}
	if lon < -180 || lon > 180 {
		return nil, fmt.Errorf("longitude out of range: %f (must be between -180 and 180)", lon)
	}

	return &GeocodeResponse{
		Lat:         lat,
		Lon:         lon,
		DisplayName: result.DisplayName,
		Type:        result.Type,
	}, nil
}

// parseCoordinate parses a coordinate string to float64 with proper error handling
func parseCoordinate(s string) (float64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("empty coordinate string")
	}

	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, fmt.Errorf("failed to parse coordinate: %w", err)
	}

	// Check for NaN and Inf
	if math.IsNaN(f) {
		return 0, fmt.Errorf("coordinate is NaN")
	}
	if math.IsInf(f, 0) {
		return 0, fmt.Errorf("coordinate is infinite")
	}

	return f, nil
}
