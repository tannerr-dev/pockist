package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestParseCoordinate_Valid(t *testing.T) {
	tests := []struct {
		input    string
		expected float64
	}{
		{"40.7128", 40.7128},
		{"-74.0060", -74.0060},
		{"  51.5074  ", 51.5074}, // with whitespace
		{"0", 0},
		{"0.0", 0},
		{"180", 180},
		{"-180", -180},
	}

	for _, test := range tests {
		result, err := parseCoordinate(test.input)
		if err != nil {
			t.Errorf("parseCoordinate(%q) returned error: %v", test.input, err)
			continue
		}
		if result != test.expected {
			t.Errorf("parseCoordinate(%q) = %f, expected %f", test.input, result, test.expected)
		}
	}
}

func TestParseCoordinate_Invalid(t *testing.T) {
	tests := []struct {
		input string
	}{
		{""},
		{"  "},
		{"abc"},
		{"40.7128.123"},
		{"NaN"},
		{"Inf"},
	}

	for _, test := range tests {
		_, err := parseCoordinate(test.input)
		if err == nil {
			t.Errorf("parseCoordinate(%q) should have returned an error", test.input)
		}
	}
}

func TestConvertToResponse_Valid(t *testing.T) {
	handler := NewGeocodeHandler()

	result := &NominatimResult{
		Lat:         "40.7128",
		Lon:         "-74.0060",
		DisplayName: "New York, USA",
		Type:        "city",
	}

	resp, err := handler.convertToResponse(result)
	if err != nil {
		t.Fatalf("convertToResponse returned error: %v", err)
	}

	if resp.Lat != 40.7128 {
		t.Errorf("expected lat 40.7128, got %f", resp.Lat)
	}
	if resp.Lon != -74.0060 {
		t.Errorf("expected lon -74.0060, got %f", resp.Lon)
	}
	if resp.DisplayName != "New York, USA" {
		t.Errorf("expected display name 'New York, USA', got %s", resp.DisplayName)
	}
	if resp.Type != "city" {
		t.Errorf("expected type 'city', got %s", resp.Type)
	}
}

func TestConvertToResponse_InvalidCoordinates(t *testing.T) {
	handler := NewGeocodeHandler()

	tests := []struct {
		name string
		lat  string
		lon  string
	}{
		{"empty lat", "", "-74.0060"},
		{"empty lon", "40.7128", ""},
		{"invalid lat", "abc", "-74.0060"},
		{"invalid lon", "40.7128", "xyz"},
		{"out of range lat", "91.0", "0.0"},
		{"out of range lat neg", "-91.0", "0.0"},
		{"out of range lon", "0.0", "181.0"},
		{"out of range lon neg", "0.0", "-181.0"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := &NominatimResult{
				Lat:         test.lat,
				Lon:         test.lon,
				DisplayName: "Test",
				Type:        "test",
			}

			_, err := handler.convertToResponse(result)
			if err == nil {
				t.Errorf("convertToResponse should have returned an error for lat=%s, lon=%s", test.lat, test.lon)
			}
		})
	}
}

func TestGeocode_MissingQuery(t *testing.T) {
	handler := NewGeocodeHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/geocode", nil)
	rr := httptest.NewRecorder()

	handler.Geocode(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "Missing q parameter") {
		t.Errorf("expected error message about missing q parameter, got: %s", body)
	}
}

func TestGeocode_MethodNotAllowed(t *testing.T) {
	handler := NewGeocodeHandler()

	req := httptest.NewRequest(http.MethodPost, "/api/geocode?q=test", nil)
	rr := httptest.NewRecorder()

	handler.Geocode(rr, req)

	if rr.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected status 405, got %d", rr.Code)
	}
}

func TestGeocode_Caching(t *testing.T) {
	// Create a mock server that returns geocoding results
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify Accept-Language header is forwarded
		if r.Header.Get("Accept-Language") != "en-US" {
			t.Errorf("expected Accept-Language header 'en-US', got '%s'", r.Header.Get("Accept-Language"))
		}

		// Verify User-Agent
		if !strings.Contains(r.Header.Get("User-Agent"), "PockistWeatherApp") {
			t.Errorf("expected User-Agent to contain 'PockistWeatherApp', got '%s'", r.Header.Get("User-Agent"))
		}

		results := []NominatimResult{
			{
				PlaceID:     12345,
				Lat:         "40.7128",
				Lon:         "-74.0060",
				DisplayName: "New York, New York, USA",
				Type:        "city",
				Importance:  0.8,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}))
	defer mockServer.Close()

	handler := NewGeocodeHandler()
	handler.apiBaseURL = mockServer.URL

	// First request - should hit the API
	req1 := httptest.NewRequest(http.MethodGet, "/api/geocode?q=New+York", nil)
	req1.Header.Set("Accept-Language", "en-US")
	rr1 := httptest.NewRecorder()

	handler.Geocode(rr1, req1)

	if rr1.Code != http.StatusOK {
		t.Fatalf("first request failed with status %d: %s", rr1.Code, rr1.Body.String())
	}

	if rr1.Header().Get("X-Cache") != "MISS" {
		t.Errorf("first request should be cache miss, got: %s", rr1.Header().Get("X-Cache"))
	}

	// Second request with same query - should hit cache
	req2 := httptest.NewRequest(http.MethodGet, "/api/geocode?q=new+york", nil) // lowercase to test normalization
	req2.Header.Set("Accept-Language", "en-US")
	rr2 := httptest.NewRecorder()

	handler.Geocode(rr2, req2)

	if rr2.Code != http.StatusOK {
		t.Fatalf("second request failed with status %d: %s", rr2.Code, rr2.Body.String())
	}

	if rr2.Header().Get("X-Cache") != "HIT" {
		t.Errorf("second request should be cache hit, got: %s", rr2.Header().Get("X-Cache"))
	}

	// Verify responses are the same
	var resp1, resp2 GeocodeResponse
	json.Unmarshal(rr1.Body.Bytes(), &resp1)
	json.Unmarshal(rr2.Body.Bytes(), &resp2)

	if resp1.Lat != resp2.Lat || resp1.Lon != resp2.Lon {
		t.Errorf("cached response differs from original: %+v vs %+v", resp1, resp2)
	}
}

func TestGeocode_NotFound(t *testing.T) {
	// Create a mock server that returns empty results
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("[]"))
	}))
	defer mockServer.Close()

	handler := NewGeocodeHandler()
	handler.apiBaseURL = mockServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/geocode?q=NonExistentPlace12345", nil)
	rr := httptest.NewRecorder()

	handler.Geocode(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", rr.Code)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "Location not found") {
		t.Errorf("expected error message about location not found, got: %s", body)
	}
}

func TestGeocode_APIError(t *testing.T) {
	// Create a mock server that returns an error
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("Service temporarily unavailable"))
	}))
	defer mockServer.Close()

	handler := NewGeocodeHandler()
	handler.apiBaseURL = mockServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/geocode?q=Test", nil)
	rr := httptest.NewRecorder()

	handler.Geocode(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", rr.Code)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "Service temporarily unavailable") {
		t.Errorf("expected error message to contain API error details, got: %s", body)
	}
}

func TestRateLimiter(t *testing.T) {
	limiter := NewRateLimiter(100 * time.Millisecond)

	ctx := context.Background()

	start := time.Now()

	// First request should not wait
	err := limiter.Wait(ctx)
	if err != nil {
		t.Fatalf("first wait returned error: %v", err)
	}

	// Second request should wait ~100ms
	err = limiter.Wait(ctx)
	if err != nil {
		t.Fatalf("second wait returned error: %v", err)
	}

	elapsed := time.Since(start)
	if elapsed < 100*time.Millisecond {
		t.Errorf("rate limiter did not wait long enough: %v", elapsed)
	}
}

func TestRateLimiter_ContextCancellation(t *testing.T) {
	limiter := NewRateLimiter(1 * time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	// First request succeeds
	err := limiter.Wait(ctx)
	if err != nil {
		t.Fatalf("first wait returned error: %v", err)
	}

	// Second request should be cancelled due to timeout
	err = limiter.Wait(ctx)
	if err != context.DeadlineExceeded {
		t.Errorf("expected DeadlineExceeded error, got: %v", err)
	}
}

func TestGeocode_ContextCancellation(t *testing.T) {
	// Create a slow mock server
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second) // Will be cancelled before this completes
		w.Write([]byte("[]"))
	}))
	defer mockServer.Close()

	handler := NewGeocodeHandler()
	handler.httpClient = &http.Client{
		Timeout: 100 * time.Millisecond, // Short timeout
	}
	handler.apiBaseURL = mockServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/geocode?q=Test", nil)
	rr := httptest.NewRecorder()

	handler.Geocode(rr, req)

	// Should get a timeout/gateway timeout error
	if rr.Code != http.StatusGatewayTimeout && rr.Code != http.StatusInternalServerError {
		t.Errorf("expected timeout error (504 or 500), got %d", rr.Code)
	}
}

func TestGeocode_InvalidCoordinatesFromAPI(t *testing.T) {
	// Create a mock server that returns invalid coordinates
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		results := []NominatimResult{
			{
				PlaceID:     12345,
				Lat:         "invalid",
				Lon:         "-74.0060",
				DisplayName: "Invalid Place",
				Type:        "test",
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}))
	defer mockServer.Close()

	handler := NewGeocodeHandler()
	handler.apiBaseURL = mockServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/geocode?q=Test", nil)
	rr := httptest.NewRecorder()

	handler.Geocode(rr, req)

	if rr.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500 for invalid coordinates, got %d", rr.Code)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "Invalid response from geocoding service") {
		t.Errorf("expected error message about invalid response, got: %s", body)
	}
}

func TestGeocodeResponseStructure(t *testing.T) {
	// Create a mock server
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		results := []NominatimResult{
			{
				PlaceID:     12345,
				Lat:         "51.5074",
				Lon:         "-0.1278",
				DisplayName: "London, Greater London, England, UK",
				Type:        "city",
				Importance:  0.9,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}))
	defer mockServer.Close()

	handler := NewGeocodeHandler()
	handler.apiBaseURL = mockServer.URL

	req := httptest.NewRequest(http.MethodGet, "/api/geocode?q=London", nil)
	rr := httptest.NewRecorder()

	handler.Geocode(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("request failed with status %d: %s", rr.Code, rr.Body.String())
	}

	var response GeocodeResponse
	err := json.Unmarshal(rr.Body.Bytes(), &response)
	if err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Validate all fields
	if response.Lat != 51.5074 {
		t.Errorf("expected lat 51.5074, got %f", response.Lat)
	}
	if response.Lon != -0.1278 {
		t.Errorf("expected lon -0.1278, got %f", response.Lon)
	}
	if response.DisplayName != "London, Greater London, England, UK" {
		t.Errorf("expected display name 'London, Greater London, England, UK', got %s", response.DisplayName)
	}
	if response.Type != "city" {
		t.Errorf("expected type 'city', got %s", response.Type)
	}

	// Check Content-Type header
	contentType := rr.Header().Get("Content-Type")
	if contentType != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got '%s'", contentType)
	}
}

func BenchmarkGeocode_CacheHit(b *testing.B) {
	handler := NewGeocodeHandler()

	// Pre-populate cache
	response := GeocodeResponse{
		Lat:         40.7128,
		Lon:         -74.0060,
		DisplayName: "New York, USA",
		Type:        "city",
	}
	handler.cache.Set("geocode:new york", response)

	req := httptest.NewRequest(http.MethodGet, "/api/geocode?q=New+York", nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		handler.Geocode(rr, req)
	}
}
