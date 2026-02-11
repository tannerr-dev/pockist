// sw.js
console.log("Service Worker loaded.")
self.addEventListener("install", function (event) {
	event.waitUntil(
		caches.open("cache-v1").then(function (cache) {
			return cache.addAll([
				"/",
				"/app.js",
                "/styles/global.css",
                "/styles/reset.css",
                "/services/API.js",
                "/services/Router.js",
                "/services/Routes.js",
                "/services/Store.js",
                "/scripts/nav.js",
			]);
		}),
	);
});

self.addEventListener("fetch", function (event) {
	event.respondWith(
		caches.match(event.request).then(function (response) {
			return response || fetch(event.request);
		}),
	);
});

self.addEventListener("activate", function (event) {
	event.waitUntil(
		caches.keys().then(function (cacheNames) {
			return Promise.all(
				cacheNames.map(function (cacheName) {
					if (cacheName !== "cache-v1") {
						return caches.delete(cacheName);
					}
				}),
			);
		}),
	);
});
