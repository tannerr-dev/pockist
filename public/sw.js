console.log("Service Worker loaded.");

const CACHE_NAME = "pockist-v14";

self.addEventListener("install", function (event) {
	event.waitUntil(
		caches.open(CACHE_NAME)
        .then(function () {
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

// Handle API requests with network-first, fallback-to-cache strategy
async function handleApiRequest(request) {
	const cache = await caches.open(CACHE_NAME);

	try {
		// Network first: always try to fetch fresh data
		const networkResponse = await fetch(request);

		if (networkResponse.ok) {
			// Cache successful response for offline fallback
			cache.put(request, networkResponse.clone());
			return networkResponse;
		}

		// HTTP error (4xx, 5xx) - don't cache, return as-is
		return networkResponse;

	} catch (error) {
		// Network failed - fallback to cache
		console.log("[SW] Network failed, trying cache for:", request.url);
		const cachedResponse = await cache.match(request);

		if (cachedResponse) {
			console.log("[SW] Serving API from cache:", request.url);
			return cachedResponse;
		}

		// No cache available - propagate error
		console.log("[SW] No cache available for:", request.url);
		throw error;
	}
}

// Handle static assets with cache-first, stale-while-revalidate strategy
async function handleStaticAsset(request) {
	const cache = await caches.open(CACHE_NAME);
	const cachedResponse = await cache.match(request);

	if (cachedResponse) {
		console.log("[SW] Serving stale from cache:", request.url);

		// Revalidate in background
		fetch(request)
			.then((networkResponse) => {
				if (networkResponse.ok) {
					cache.put(request, networkResponse.clone());
					console.log("[SW] Updated cache with fresh version:", request.url);

					self.clients.matchAll().then((clients) => {
						clients.forEach((client) => {
							client.postMessage({
								type: "CACHE_UPDATED",
								url: request.url,
							});
						});
					});
				}
			})
			.catch((err) => console.log("[SW] Background fetch failed:", err));

		return cachedResponse;
	}

	// No cache - fetch from network
	return fetch(request)
		.then((networkResponse) => {
			cache.put(request, networkResponse.clone());
			return networkResponse;
		})
		.catch(() => {
			throw new Error("Failed to fetch:", request.url);
		});
}

self.addEventListener("fetch", (event) => {
	// Only cache GET requests - skip POST, PUT, DELETE, etc.
	if (event.request.method !== 'GET') {
		event.respondWith(fetch(event.request));
		return;
	}

	// API requests: network-first, fallback to cache
	if (event.request.url.includes('/api/')) {
		event.respondWith(handleApiRequest(event.request));
		return;
	}

	// Static assets: cache-first, stale-while-revalidate
	event.respondWith(handleStaticAsset(event.request));
});
