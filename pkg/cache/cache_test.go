package cache

import (
	"fmt"
	"sync"
	"testing"
	"time"
)

func TestBasicSetGet(t *testing.T) {
	c := NewTTLCache(10, time.Minute)

	c.Set("key1", "value1")

	val, found := c.Get("key1")
	if !found {
		t.Error("expected to find key1")
	}
	if val != "value1" {
		t.Errorf("expected value1, got %v", val)
	}
}

func TestGetNonExistent(t *testing.T) {
	c := NewTTLCache(10, time.Minute)

	val, found := c.Get("nonexistent")
	if found {
		t.Error("expected not to find nonexistent key")
	}
	if val != nil {
		t.Errorf("expected nil, got %v", val)
	}
}

func TestTTLExpiration(t *testing.T) {
	c := NewTTLCache(10, 50*time.Millisecond)

	c.Set("key1", "value1")

	// Should exist immediately
	_, found := c.Get("key1")
	if !found {
		t.Error("expected key to exist before expiration")
	}

	// Wait for expiration
	time.Sleep(100 * time.Millisecond)

	// Should be expired now
	_, found = c.Get("key1")
	if found {
		t.Error("expected key to be expired")
	}

	// Size should be 0
	if c.Size() != 0 {
		t.Errorf("expected size 0 after expiration, got %d", c.Size())
	}
}

func TestLRUEviction(t *testing.T) {
	c := NewTTLCache(3, time.Minute)

	// Add 3 items
	c.Set("key1", "value1")
	c.Set("key2", "value2")
	c.Set("key3", "value3")

	if c.Size() != 3 {
		t.Errorf("expected size 3, got %d", c.Size())
	}

	// Access key1 to make it most recently used
	c.Get("key1")

	// Add 4th item - should evict key2 (least recently used)
	c.Set("key4", "value4")

	if c.Size() != 3 {
		t.Errorf("expected size 3 after eviction, got %d", c.Size())
	}

	// key1 should exist (was accessed)
	_, found := c.Get("key1")
	if !found {
		t.Error("expected key1 to exist (was recently accessed)")
	}

	// key2 should be evicted
	_, found = c.Get("key2")
	if found {
		t.Error("expected key2 to be evicted (was least recently used)")
	}

	// key3 and key4 should exist
	_, found = c.Get("key3")
	if !found {
		t.Error("expected key3 to exist")
	}
	_, found = c.Get("key4")
	if !found {
		t.Error("expected key4 to exist")
	}
}

func TestUpdateExistingKey(t *testing.T) {
	c := NewTTLCache(3, time.Minute)

	c.Set("key1", "value1")
	c.Set("key2", "value2")
	c.Set("key3", "value3")

	// Update key1 - should not trigger eviction
	c.Set("key1", "updated")

	if c.Size() != 3 {
		t.Errorf("expected size 3 after update, got %d", c.Size())
	}

	val, found := c.Get("key1")
	if !found {
		t.Error("expected key1 to exist")
	}
	if val != "updated" {
		t.Errorf("expected 'updated', got %v", val)
	}
}

func TestDelete(t *testing.T) {
	c := NewTTLCache(10, time.Minute)

	c.Set("key1", "value1")
	c.Delete("key1")

	_, found := c.Get("key1")
	if found {
		t.Error("expected key1 to be deleted")
	}

	if c.Size() != 0 {
		t.Errorf("expected size 0, got %d", c.Size())
	}
}

func TestClear(t *testing.T) {
	c := NewTTLCache(10, time.Minute)

	c.Set("key1", "value1")
	c.Set("key2", "value2")
	c.Clear()

	if c.Size() != 0 {
		t.Errorf("expected size 0 after clear, got %d", c.Size())
	}

	_, found := c.Get("key1")
	if found {
		t.Error("expected key1 to be cleared")
	}
}

func TestConcurrentAccess(t *testing.T) {
	c := NewTTLCache(10000, time.Minute)

	var wg sync.WaitGroup
	numGoroutines := 100
	numOperations := 100

	// Concurrent writes
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < numOperations; j++ {
				c.Set(fmt.Sprintf("key-%d-%d", id, j), "value")
			}
		}(i)
	}

	// Concurrent reads
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < numOperations; j++ {
				c.Get(fmt.Sprintf("key-%d-%d", id, j))
			}
		}(i)
	}

	wg.Wait()

	// All items should be in cache (10,000 items, capacity is 10,000)
	if c.Size() != numGoroutines*numOperations {
		t.Errorf("expected size %d, got %d", numGoroutines*numOperations, c.Size())
	}
}

func TestConcurrentWithEviction(t *testing.T) {
	c := NewTTLCache(50, time.Minute)

	var wg sync.WaitGroup
	numGoroutines := 10
	numOperations := 20

	// More writes than capacity to trigger evictions
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for j := 0; j < numOperations; j++ {
				c.Set(fmt.Sprintf("key-%d-%d", id, j), "value")
			}
		}(i)
	}

	wg.Wait()

	// Size should be at most maxSize
	if c.Size() > 50 {
		t.Errorf("expected size <= 50, got %d", c.Size())
	}
}

func TestSetWithTTL(t *testing.T) {
	c := NewTTLCache(10, time.Minute)

	// Set with short TTL
	c.SetWithTTL("key1", "value1", 50*time.Millisecond)

	// Should exist
	_, found := c.Get("key1")
	if !found {
		t.Error("expected key to exist immediately")
	}

	// Wait for custom TTL to expire
	time.Sleep(100 * time.Millisecond)

	// Should be expired
	_, found = c.Get("key1")
	if found {
		t.Error("expected key to be expired after custom TTL")
	}
}
