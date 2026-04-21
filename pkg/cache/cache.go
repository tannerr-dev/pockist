package cache

import (
	"sync"
	"time"
)

// CacheEntry stores a cached value with its expiration time
type CacheEntry struct {
	Value      interface{}
	ExpiresAt  time.Time
	AccessedAt time.Time // For LRU tracking
}

// IsExpired checks if the cache entry has expired
func (e *CacheEntry) IsExpired() bool {
	return time.Now().After(e.ExpiresAt)
}

// TTLCache is a thread-safe cache with TTL and LRU eviction
type TTLCache struct {
	mu         sync.Mutex
	items      map[string]*CacheEntry
	maxSize    int
	defaultTTL time.Duration
}

// NewTTLCache creates a new cache with the specified max size and default TTL
func NewTTLCache(maxSize int, defaultTTL time.Duration) *TTLCache {
	return &TTLCache{
		items:      make(map[string]*CacheEntry),
		maxSize:    maxSize,
		defaultTTL: defaultTTL,
	}
}

// Get retrieves a value from the cache if it exists and hasn't expired
func (c *TTLCache) Get(key string) (interface{}, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	entry, exists := c.items[key]
	if !exists {
		return nil, false
	}

	// Check if expired
	if entry.IsExpired() {
		// Delete expired entry
		delete(c.items, key)
		return nil, false
	}

	// Update access time for LRU
	entry.AccessedAt = time.Now()

	return entry.Value, true
}

// Set stores a value in the cache with the default TTL
func (c *TTLCache) Set(key string, value interface{}) {
	c.SetWithTTL(key, value, c.defaultTTL)
}

// SetWithTTL stores a value with a specific TTL
func (c *TTLCache) SetWithTTL(key string, value interface{}, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// If at capacity and this is a new key, evict oldest
	if len(c.items) >= c.maxSize {
		if _, exists := c.items[key]; !exists {
			c.evictLRU()
		}
	}

	c.items[key] = &CacheEntry{
		Value:      value,
		ExpiresAt:  time.Now().Add(ttl),
		AccessedAt: time.Now(),
	}
}

// evictLRU removes the least recently used entry
func (c *TTLCache) evictLRU() {
	var oldestKey string
	var oldestTime time.Time

	for key, entry := range c.items {
		if oldestKey == "" || entry.AccessedAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = entry.AccessedAt
		}
	}

	if oldestKey != "" {
		delete(c.items, oldestKey)
	}
}

// Delete removes a specific key from the cache
func (c *TTLCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.items, key)
}

// Clear removes all items from the cache
func (c *TTLCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items = make(map[string]*CacheEntry)
}

// Size returns the current number of items in the cache
func (c *TTLCache) Size() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.items)
}
