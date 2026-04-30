package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// ShareHandler handles sharing of notes and lists
type ShareHandler struct {
	db *sql.DB
}

// SharedItem represents a shared note/list in the database
type SharedItem struct {
	ID            string    `json:"id"`
	Type          string    `json:"type"`
	Title         string    `json:"title"`
	Data          string    `json:"data"`
	CreatedAt     time.Time `json:"createdAt"`
	ExpiresAt     time.Time `json:"expiresAt"`
	DeletionToken string    `json:"-"`
	ViewCount     int       `json:"viewCount"`
}

// CreateShareRequest represents a request to create a share
type CreateShareRequest struct {
	Type  string      `json:"type"`
	Title string      `json:"title"`
	Data  interface{} `json:"data"`
}

// CreateShareResponse represents the response after creating a share
type CreateShareResponse struct {
	ShareID       string `json:"shareId"`
	DeletionToken string `json:"deletionToken"`
	URL           string `json:"url"`
	ExpiresAt     string `json:"expiresAt"`
	ExpiresIn     string `json:"expiresIn"`
}

// ShareResponse represents a share when retrieved
type ShareResponse struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"`
	Title     string      `json:"title"`
	Data      interface{} `json:"data"`
	CreatedAt string      `json:"createdAt"`
	ExpiresAt string      `json:"expiresAt"`
	ExpiresIn string      `json:"expiresIn"`
	ViewCount int         `json:"viewCount"`
}

const (
	shareTTL          = 24 * time.Hour
	maxShareSizeBytes = 500 * 1024 // 500KB
	maxTitleLength    = 100
	cleanupInterval   = 10 * time.Minute
)

var (
	// HTML tag regex for sanitization
	htmlTagRegex    = regexp.MustCompile(`<[^>]+>`)
	scriptRegex     = regexp.MustCompile(`(?i)<script[^>]*>[\s\S]*?</script>`)
	jsProtocolRegex = regexp.MustCompile(`(?i)javascript:`)
)

// rateLimiter handles IP-based rate limiting
type rateLimiter struct {
	requests map[string]map[string][]time.Time // ip -> action -> timestamps
	mu       sync.RWMutex
}

var limiter = &rateLimiter{
	requests: make(map[string]map[string][]time.Time),
}

// CheckRateLimit checks if the request is within rate limits
func CheckRateLimit(r *http.Request, action string, maxRequests int, window time.Duration) bool {
	ip := getClientIP(r)
	now := time.Now()
	cutoff := now.Add(-window)

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	// Initialize maps if needed
	if limiter.requests[ip] == nil {
		limiter.requests[ip] = make(map[string][]time.Time)
	}

	// Filter old requests
	var validRequests []time.Time
	for _, t := range limiter.requests[ip][action] {
		if t.After(cutoff) {
			validRequests = append(validRequests, t)
		}
	}

	// Check limit
	if len(validRequests) >= maxRequests {
		limiter.requests[ip][action] = validRequests
		return false
	}

	// Add current request
	validRequests = append(validRequests, now)
	limiter.requests[ip][action] = validRequests
	return true
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header (for proxies)
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		// Take the first IP if multiple
		ips := strings.Split(forwarded, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}

	// Check X-Real-Ip header
	realIP := r.Header.Get("X-Real-Ip")
	if realIP != "" {
		return realIP
	}

	// Fall back to RemoteAddr
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// generateUUID creates a new UUID v4 using crypto/rand
func generateUUID() (string, error) {
	uuid := make([]byte, 16)
	_, err := rand.Read(uuid)
	if err != nil {
		return "", err
	}
	// Set version (4) and variant bits
	uuid[6] = (uuid[6] & 0x0f) | 0x40
	uuid[8] = (uuid[8] & 0x3f) | 0x80
	return hex.EncodeToString(uuid[0:4]) + "-" +
		hex.EncodeToString(uuid[4:6]) + "-" +
		hex.EncodeToString(uuid[6:8]) + "-" +
		hex.EncodeToString(uuid[8:10]) + "-" +
		hex.EncodeToString(uuid[10:16]), nil
}

// NewShareHandler creates a new share handler
func NewShareHandler(db *sql.DB) *ShareHandler {
	handler := &ShareHandler{db: db}
	// Start background cleanup ticker
	go handler.startCleanupTicker()
	return handler
}

// CreateShare handles POST /api/share
func (h *ShareHandler) CreateShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Check rate limit
	if !CheckRateLimit(r, "share:create", 5, time.Hour) {
		http.Error(w, `{"error": "Rate limit exceeded. Max 5 shares per hour."}`, http.StatusTooManyRequests)
		return
	}

	// Read and validate body size
	body, err := io.ReadAll(io.LimitReader(r.Body, maxShareSizeBytes+1))
	if err != nil {
		http.Error(w, `{"error": "Failed to read request body"}`, http.StatusBadRequest)
		return
	}
	if len(body) > maxShareSizeBytes {
		http.Error(w, `{"error": "Share data too large. Max 500KB."}`, http.StatusRequestEntityTooLarge)
		return
	}

	// Parse request
	var req CreateShareRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, `{"error": "Invalid JSON"}`, http.StatusBadRequest)
		return
	}

	// Validate type
	if req.Type != "note" && req.Type != "list" && req.Type != "full" {
		http.Error(w, `{"error": "Invalid type. Must be 'note', 'list', or 'full'"}`, http.StatusBadRequest)
		return
	}

	// Sanitize and validate
	title := sanitizeString(req.Title, maxTitleLength)
	if title == "" {
		title = "Untitled"
	}

	// Sanitize data
	sanitizedData := sanitizeData(req.Data)

	// Marshal sanitized data
	dataBytes, err := json.Marshal(sanitizedData)
	if err != nil {
		http.Error(w, `{"error": "Failed to process data"}`, http.StatusInternalServerError)
		return
	}

	// Generate IDs
	shareID, err := generateUUID()
	if err != nil {
		log.Printf("[Share] Failed to generate share ID: %v", err)
		http.Error(w, `{"error": "Failed to create share"}`, http.StatusInternalServerError)
		return
	}
	deletionToken, err := generateUUID()
	if err != nil {
		log.Printf("[Share] Failed to generate deletion token: %v", err)
		http.Error(w, `{"error": "Failed to create share"}`, http.StatusInternalServerError)
		return
	}
	now := time.Now()
	expiresAt := now.Add(shareTTL)

	// Insert into database
	_, err = h.db.Exec(
		`INSERT INTO shared_items (id, type, title, data, created_at, expires_at, deletion_token, view_count) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
		shareID, req.Type, title, string(dataBytes), now, expiresAt, deletionToken,
	)
	if err != nil {
		log.Printf("[Share] Failed to create share: %v", err)
		http.Error(w, `{"error": "Failed to create share"}`, http.StatusInternalServerError)
		return
	}

	// Build response
	response := CreateShareResponse{
		ShareID:       shareID,
		DeletionToken: deletionToken,
		URL:           fmt.Sprintf("/share/%s", shareID),
		ExpiresAt:     expiresAt.Format(time.RFC3339),
		ExpiresIn:     formatDuration(shareTTL),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)

	log.Printf("[Share] Created %s share: %s (expires: %s)", req.Type, shareID, expiresAt.Format(time.RFC3339))
}

// GetShare handles GET /api/share/{id}
func (h *ShareHandler) GetShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Check rate limit
	if !CheckRateLimit(r, "share:view", 60, time.Hour) {
		http.Error(w, `{"error": "Rate limit exceeded. Max 60 views per hour."}`, http.StatusTooManyRequests)
		return
	}

	// Extract share ID from URL
	shareID := strings.TrimPrefix(r.URL.Path, "/api/share/")
	if shareID == "" {
		http.Error(w, `{"error": "Share ID required"}`, http.StatusBadRequest)
		return
	}

	// Query database
	var item SharedItem
	err := h.db.QueryRow(
		`SELECT id, type, title, data, created_at, expires_at, view_count 
		 FROM shared_items WHERE id = ?`,
		shareID,
	).Scan(&item.ID, &item.Type, &item.Title, &item.Data, &item.CreatedAt, &item.ExpiresAt, &item.ViewCount)

	if err == sql.ErrNoRows {
		http.Error(w, `{"error": "Share not found or expired"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("[Share] Database error: %v", err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}

	// Check if expired
	if time.Now().After(item.ExpiresAt) {
		// Delete expired share
		h.db.Exec(`DELETE FROM shared_items WHERE id = ?`, shareID)
		http.Error(w, `{"error": "Share not found or expired"}`, http.StatusNotFound)
		return
	}

	// Increment view count
	_, err = h.db.Exec(`UPDATE shared_items SET view_count = view_count + 1 WHERE id = ?`, shareID)
	if err != nil {
		log.Printf("[Share] Failed to increment view count: %v", err)
	}

	// Parse data
	var data interface{}
	if err := json.Unmarshal([]byte(item.Data), &data); err != nil {
		data = item.Data // Fallback to raw string
	}

	// Build response
	response := ShareResponse{
		ID:        item.ID,
		Type:      item.Type,
		Title:     item.Title,
		Data:      data,
		CreatedAt: item.CreatedAt.Format(time.RFC3339),
		ExpiresAt: item.ExpiresAt.Format(time.RFC3339),
		ExpiresIn: formatDuration(time.Until(item.ExpiresAt)),
		ViewCount: item.ViewCount + 1,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeleteShare handles DELETE /api/share/{id}
func (h *ShareHandler) DeleteShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Check rate limit
	if !CheckRateLimit(r, "share:delete", 10, time.Hour) {
		http.Error(w, `{"error": "Rate limit exceeded"}`, http.StatusTooManyRequests)
		return
	}

	// Extract share ID from URL
	shareID := strings.TrimPrefix(r.URL.Path, "/api/share/")
	if shareID == "" {
		http.Error(w, `{"error": "Share ID required"}`, http.StatusBadRequest)
		return
	}

	// Get deletion token from header
	deletionToken := r.Header.Get("X-Deletion-Token")
	if deletionToken == "" {
		http.Error(w, `{"error": "Deletion token required"}`, http.StatusBadRequest)
		return
	}

	// Verify token
	var storedToken string
	err := h.db.QueryRow(`SELECT deletion_token FROM shared_items WHERE id = ?`, shareID).Scan(&storedToken)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error": "Share not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("[Share] Database error: %v", err)
		http.Error(w, `{"error": "Internal server error"}`, http.StatusInternalServerError)
		return
	}

	if storedToken != deletionToken {
		http.Error(w, `{"error": "Invalid deletion token"}`, http.StatusForbidden)
		return
	}

	// Delete share
	_, err = h.db.Exec(`DELETE FROM shared_items WHERE id = ?`, shareID)
	if err != nil {
		log.Printf("[Share] Failed to delete share: %v", err)
		http.Error(w, `{"error": "Failed to delete share"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
	log.Printf("[Share] Deleted share: %s", shareID)
}

// CleanupExpired deletes all expired shares
func (h *ShareHandler) CleanupExpired() {
	result, err := h.db.Exec(`DELETE FROM shared_items WHERE expires_at < datetime('now')`)
	if err != nil {
		log.Printf("[Share] Cleanup error: %v", err)
		return
	}

	if rows, err := result.RowsAffected(); err == nil && rows > 0 {
		log.Printf("[Share] Cleaned up %d expired shares", rows)
	}
}

// startCleanupTicker runs background cleanup every 10 minutes
func (h *ShareHandler) startCleanupTicker() {
	ticker := time.NewTicker(cleanupInterval)
	for range ticker.C {
		h.CleanupExpired()
	}
}

// sanitizeString removes HTML and limits length
func sanitizeString(input string, maxLen int) string {
	// Remove script tags
	input = scriptRegex.ReplaceAllString(input, "")

	// Remove all HTML tags
	input = htmlTagRegex.ReplaceAllString(input, "")

	// Remove javascript: protocol
	input = jsProtocolRegex.ReplaceAllString(input, "")

	// Trim whitespace
	input = strings.TrimSpace(input)

	// Limit length
	if len(input) > maxLen {
		input = input[:maxLen]
	}

	return input
}

// sanitizeData recursively sanitizes all strings in data
func sanitizeData(data interface{}) interface{} {
	switch v := data.(type) {
	case string:
		return sanitizeString(v, 10000) // Max 10KB per string
	case map[string]interface{}:
		result := make(map[string]interface{})
		for key, val := range v {
			result[sanitizeString(key, 100)] = sanitizeData(val)
		}
		return result
	case []interface{}:
		result := make([]interface{}, len(v))
		for i, val := range v {
			result[i] = sanitizeData(val)
		}
		return result
	default:
		return v
	}
}

// formatDuration returns human-readable duration
func formatDuration(d time.Duration) string {
	if d < 0 {
		d = 0
	}

	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60

	if hours > 0 {
		if minutes > 0 {
			return fmt.Sprintf("%d hours %d minutes", hours, minutes)
		}
		return fmt.Sprintf("%d hours", hours)
	}
	return fmt.Sprintf("%d minutes", minutes)
}
