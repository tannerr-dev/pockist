console.log("Service Worker loaded.");

const CACHE_NAME = "pockist-v7";
// Install event - precache any initial resources if needed
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(() => {
        // Skip waiting to activate immediately
        self.skipWaiting();
      })
  );
});
// self.addEventListener("install", function (event) {
// 	event.waitUntil(
// 		caches.open(CACHE_NAME).then(function (cache) {
// 			return cache.addAll([
// 				"/",
// 				"/app.js",
// 				"/note",
// 				"/styles/global.css",
// 				"/styles/reset.css",
// 				"/styles/nav.css",
// 				"/services/API.js",
// 				"/services/Router.js",
// 				"/services/Routes.js",
// 				"/services/Store.js",
// 				"/scripts/nav.js",
// 				"/assets/logo.png",
// 				"/assets/logo.svg",
// 				"/assets/logo_white.svg",
// 				"/components/HomePage.js",
// 				"/components/LocalNotes.js",
// 			]);
// 		}).then(function () {
// 			// Skip waiting to activate immediately
// 			return self.skipWaiting();
// 		}),
// 	);
// });

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
	// 	event.respondWith(
	// 		caches.match(event.request).then(function (response) {
	// 			return response || fetch(event.request);
	// 		}),
	// 	);
	// });

	// Fetch event - handle caching strategies
	// const requestUrl = new URL(event.request.url);
	// Handle /api/ requests (network first, cache fallback)
	// if (requestUrl.pathname.startsWith('/api/')) {
	//   event.respondWith(
	//     fetch(event.request)  // Network firtman
	//       .then((networkResponse) => {
	//         // Cache successful network response
	//         return caches.open(CACHE_NAME).then((cache) => {
	//           cache.put(event.request, networkResponse.clone());
	//           return networkResponse;
	//         });
	//       })
	//       .catch(() => {
	//         // If network fails, try cache
	//         return caches.match(event.request)
	//           .then((cachedResponse) => {
	//             return cachedResponse || Promise.reject('No network or cache available');
	//           });
	//       })
	//   );
	// }
	// else {
	// Handle all other requests (stale-while-revalidate)
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
					});

				// Return cached version if available, otherwise wait for network
				return cachedResponse || fetchPromise;
			});
		}),
	);
	// }
});
