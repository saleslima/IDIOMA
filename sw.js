// Updated Service Worker for Language Conversation Practice App

const CACHE_NAME = 'language-practice-cache-v4';
const GITHUB_REDIRECT_URL = 'https://saleslima.github.io/IDIOMA/';

// Determine the base path - handles both root and subdirectory hosting
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '');

// Dynamically construct URLs to cache based on current location
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/styles.css`,
  `${BASE_PATH}/script.js`,
  `${BASE_PATH}/marcio_tutor.png`,
  `${BASE_PATH}/nathalia_tutor.png`,
  `${BASE_PATH}/app_icon.png`,
  `${BASE_PATH}/manifest.json`
];

// Install event - cache assets
self.addEventListener('install', event => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching app assets:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Error caching app assets:', error);
      })
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', event => {
  console.log('Service worker activating');
  
  // Take control of all clients as soon as it activates
  event.waitUntil(
    clients.claim()
      .then(() => {
        return caches.keys().then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => {
              if (cacheName !== CACHE_NAME) {
                console.log('Deleting old cache:', cacheName);
                return caches.delete(cacheName);
              }
            })
          );
        });
      })
  );
});

// Fetch event - improved PWA detection and redirect logic
self.addEventListener('fetch', event => {
  // First, check for an exact cache match
  event.respondWith(
    caches.match(event.request, { ignoreSearch: false })
      .then(cachedResponse => {
        if (cachedResponse) {
          // If we have a cached response, use it
          return cachedResponse;
        }
        
        // Otherwise fetch from network
        return fetch(event.request)
          .then(response => {
            // If this is a navigation request and we're in standalone mode,
            // check if we need to redirect
            if (event.request.mode === 'navigate') {
              // Clone the response so we can return it and also check it
              const responseClone = response.clone();
              
              // Check if we're in PWA mode and need to redirect
              clients.matchAll({
                type: 'window',
                includeUncontrolled: false
              }).then(clientList => {
                clientList.forEach(client => {
                  // If we have a client window and it appears to be in standalone mode
                  if (client.url.includes('?standalone=true') || 
                      client.url.includes('&standalone=true') ||
                      sessionStorage.getItem('pwaMode') === 'true') {
                    
                    // Only redirect if we haven't already
                    if (!sessionStorage.getItem('redirected')) {
                      sessionStorage.setItem('redirected', 'true');
                      client.navigate(GITHUB_REDIRECT_URL);
                    }
                  }
                });
              });
              
              return responseClone;
            }
            
            return response;
          })
          .catch(error => {
            console.error('Fetch error:', error);
            
            // If it's a navigation request, return the cached index.html
            if (event.request.mode === 'navigate') {
              return caches.match(`${BASE_PATH}/index.html`);
            }
            
            // Otherwise return a simple error
            return new Response('Network error', {
              status: 408,
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Listen for message events (useful for communication with the main page)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'SET_PWA_MODE') {
    console.log('Setting PWA mode in service worker');
    // We can use this to store PWA mode state
    sessionStorage.setItem('pwaMode', 'true');
  }
});