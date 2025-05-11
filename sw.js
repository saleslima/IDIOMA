// Service Worker for Language Conversation Practice App

const CACHE_NAME = 'language-practice-cache-v3';
const GITHUB_REDIRECT_URL = 'https://saleslima.github.io/IDIOMA/';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/marcio_tutor.png',
  '/nathalia_tutor.png',
  '/app_icon.png',
  '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', event => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', event => {
  // Take control of all clients as soon as it activates
  event.waitUntil(clients.claim());
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - handle navigation and redirect to GitHub Pages
self.addEventListener('fetch', event => {
  // Check if this is a navigation request (app launch)
  if (event.request.mode === 'navigate') {
    // Get client information
    event.respondWith(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(clients => {
        // For PWA standalone mode
        if (clients.length === 0) {
          // No clients - likely PWA launch
          console.log("PWA launch detected - redirecting from SW");
          return Response.redirect(GITHUB_REDIRECT_URL, 302);
        }
        
        // For normal web use, fetch the requested page
        return fetch(event.request).catch(() => {
          return caches.match('/index.html');
        });
      })
    );
    return;
  }
  
  // For other requests, use the regular caching strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});