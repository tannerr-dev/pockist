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
	var err error

	server := http.NewServeMux()

	catchAllClientRoutesHandler := func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./public/index.html")
	}
	server.HandleFunc("/note", catchAllClientRoutesHandler)
	server.HandleFunc("/weather", catchAllClientRoutesHandler)

	// Weather API endpoint with caching
	weatherHandler := handlers.NewWeatherHandler()
	server.HandleFunc("/api/weather", weatherHandler.Weather)

	// Geocode API endpoint with caching
	geocodeHandler := handlers.NewGeocodeHandler()
	server.HandleFunc("/api/geocode", geocodeHandler.Geocode)

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
