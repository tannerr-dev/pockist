console.log("Service Worker loaded.");

const CACHE_NAME = "pockist-v7";

self.addEventListener("install", function (event) {
	event.waitUntil(
		caches.open(CACHE_NAME).then(function (cache) {
			return cache.addAll([
				"/",
				"/app.js",
				"/note",
				"/styles/global.css",
				"/styles/reset.css",
				"/styles/nav.css",
				"/services/API.js",
				"/services/Router.js",
				"/services/Routes.js",
				"/services/Store.js",
				"/scripts/nav.js",
				"/assets/logo.png",
				"/assets/logo.svg",
				"/assets/logo_white.svg",
				"/components/HomePage.js",
				"/components/LocalNotes.js",
			]);
		}).then(function () {
			return self.skipWaiting();
		}),
	);
});

self.addEventListener("activate", function (event) {
	event.waitUntil(
		caches.keys().then(function (cacheNames) {
			return Promise.all(
				cacheNames.map(function (cacheName) {
					if (cacheName !== CACHE_NAME) {
						return caches.delete(cacheName);
					}
				}),
			);
		}).then(function () {
			return self.clients.claim();
		}),
	);
});

self.addEventListener("fetch", (event) => {
	event.respondWith(
		caches.open(CACHE_NAME).then((cache) => {
			return cache.match(event.request).then((cachedResponse) => {
			// Start fetching new version in background
			const fetchPromise = fetch(event.request)
				.then((networkResponse) => {
					// Update cache with new response
					cache.put(event.request, networkResponse.clone());
					return networkResponse;
				})
				.catch((error) => {
					console.error("Fetch failed:", error);
					// If no cached response exists, propagate the error
					if (!cachedResponse) {
						throw error;
					}
				});

			return cachedResponse || fetchPromise;
			});
		}),
	);
});
