// Service Worker for Language Conversation Practice App

const CACHE_NAME = 'language-practice-cache-v1';
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
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

// Fetch event - check if it's the installed app launch
self.addEventListener('fetch', event => {
  // If this is a navigation request (opening the app)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // Redirect to the GitHub Pages URL
      fetch('https://saleslima.github.io/IDIOMA/')
        .catch(() => caches.match('/index.html'))
    );
  } else {
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
  }
});