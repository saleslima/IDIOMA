// Service Worker for Language Conversation Practice App

const CACHE_NAME = 'language-practice-cache-v1';
const REDIRECT_URL = 'https://saleslima.github.io/IDIOMA/';
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

// Fetch event - prioritize redirecting to GitHub Pages when the app is launched
self.addEventListener('fetch', event => {
  // If this is a navigation request (opening the app)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // Always redirect to the GitHub Pages URL for navigation requests
      fetch(REDIRECT_URL)
        .catch(() => {
          console.log('Failed to redirect, falling back to cached content');
          return caches.match('/index.html');
        })
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