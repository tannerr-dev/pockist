console.log("Service Worker loaded.");

const CACHE_NAME = "pockist-v8";

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
				if (cachedResponse) {
					console.log("Serving stale from cache:", event.request.url);

					fetch(event.request)
						.then((networkResponse) => {
							if (networkResponse.ok) {
								cache.put(event.request, networkResponse.clone());
								console.log("Updated cache with fresh version:", event.request.url);

								self.clients.matchAll().then((clients) => {
									clients.forEach((client) => {
										client.postMessage({
											type: "CACHE_UPDATED",
											url: event.request.url,
										});
									});
								});
							}
						})
						.catch((err) => console.log("Background fetch failed:", err));

					return cachedResponse;
				}

				return fetch(event.request)
					.then((networkResponse) => {
						cache.put(event.request, networkResponse.clone());
						return networkResponse;
					})
					.catch(() => {
						throw new Error("Failed to fetch:", event.request.url);
					});
			});
		}),
	);
});
