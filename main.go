package main

import (
	"fmt"
	"log"
	"net/http"
	"tannerr/pockist/handlers"
)

// CacheControlMiddleware creates a middleware with configurable max-age in seconds
func CacheControlMiddleware(maxAgeSeconds int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control",
				fmt.Sprintf("max-age=%d, must-revalidate", maxAgeSeconds))
			next.ServeHTTP(w, r)
		})
	}
}

func main() {
	// Initialize database
	db, err := handlers.InitDatabase()
	if err != nil {
		log.Printf("[Main] Database initialization failed: %v", err)
		log.Println("[Main] Continuing without database (sharing features disabled)")
		db = nil
	}

	server := http.NewServeMux()

	catchAllClientRoutesHandler := func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./public/index.html")
	}
	server.HandleFunc("/note", catchAllClientRoutesHandler)
	server.HandleFunc("/list", catchAllClientRoutesHandler)
	server.HandleFunc("/list/", catchAllClientRoutesHandler)
	server.HandleFunc("/weather", catchAllClientRoutesHandler)
	server.HandleFunc("/about", catchAllClientRoutesHandler)
	// Share view route (client-side route)
	server.HandleFunc("/share/", catchAllClientRoutesHandler)

	// Weather API endpoint with caching
	weatherHandler := handlers.NewWeatherHandler()
	server.HandleFunc("/api/weather", weatherHandler.Weather)

	// Geocode API endpoint with caching
	geocodeHandler := handlers.NewGeocodeHandler()
	server.HandleFunc("/api/geocode", geocodeHandler.Geocode)

	// Share API endpoints (only if database is available)
	if db != nil {
		shareHandler := handlers.NewShareHandler(db)
		server.HandleFunc("/api/share", func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodPost {
				shareHandler.CreateShare(w, r)
			} else {
				http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		})
		server.HandleFunc("/api/share/", func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodGet:
				shareHandler.GetShare(w, r)
			case http.MethodDelete:
				shareHandler.DeleteShare(w, r)
			default:
				http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
			}
		})
		log.Println("[Main] Share API endpoints registered")
	}

	fileCache := CacheControlMiddleware(30) // 30 seconds for all files

	fileServer := http.FileServer(http.Dir("public"))
	server.Handle("/", fileCache(fileServer))
	const addr = ":4242"
	fmt.Println("Server listening on", addr)
	err = http.ListenAndServe(addr, server)
	if err != nil {
		log.Fatalf("Server failed %v", err)
	}
}
