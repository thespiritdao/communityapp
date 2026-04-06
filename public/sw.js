// Service Worker for SpiritDAO PWA
// Handles offline caching, push notifications, and background sync

const CACHE_NAME = 'spiritdao-v1.0.0';
const RUNTIME_CACHE = 'spiritdao-runtime';
const IMAGE_CACHE = 'spiritdao-images';

// Critical files to cache immediately on install
const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/forum',
  '/observableinfinities.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install event - cache critical assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching critical assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME &&
                cacheName !== RUNTIME_CACHE &&
                cacheName !== IMAGE_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        return self.clients.claim();
      })
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Supabase realtime WebSocket connections
  if (url.hostname.includes('supabase.co') && url.pathname.includes('realtime')) {
    return;
  }

  // Skip API routes (always fetch fresh)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Skip external domains (Coinbase, Supabase API, etc.)
  if (url.hostname !== self.location.hostname &&
      !url.hostname.includes('localhost')) {
    return;
  }

  // Handle images separately (cache first strategy)
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            // Return cached image, fetch in background to update
            fetch(request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
            }).catch(() => {
              // Silently fail background fetch
            });
            return cachedResponse;
          }

          // Not in cache, fetch from network
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // For all other requests: Network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Don't cache non-successful responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone response to cache it
        const responseToCache = response.clone();

        caches.open(RUNTIME_CACHE).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      })
      .catch((error) => {
        // Network failed, try cache
        console.log('[SW] Network request failed, falling back to cache:', request.url);

        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // If no cache, return offline page for navigation requests
          if (request.mode === 'navigate') {
            return caches.match('/');
          }

          // For other requests, throw error
          throw error;
        });
      })
  );
});

// Push notification event - receive and display notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let notificationData = {
    title: 'SpiritDAO',
    body: 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: { url: '/' },
  };

  // Parse push data if available
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || data.message || notificationData.body,
        icon: data.icon || notificationData.icon,
        badge: notificationData.badge,
        data: {
          url: data.url || data.link || '/',
          ...data.data,
        },
        tag: data.tag || 'default',
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
      };
    } catch (error) {
      console.error('[SW] Error parsing push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      actions: notificationData.actions,
    }).then(() => {
      if ('setAppBadge' in navigator) {
        const badgeCount = (notificationData.data && notificationData.data.badgeCount) || 1;
        navigator.setAppBadge(badgeCount);
      }
    })
  );
});

// Notification click event - open app to relevant page
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Clear app badge when user interacts with notification
        if ('clearAppBadge' in navigator) {
          navigator.clearAppBadge();
          console.log('[SW] App icon badge cleared');
        }

        // Check if app is already open
        for (const client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }

        // App not open or different URL, open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync event - sync data when connection restored
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);

  if (event.tag === 'sync-forum-posts') {
    event.waitUntil(syncForumPosts());
  } else if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

// Helper: Sync forum posts
async function syncForumPosts() {
  try {
    console.log('[SW] Syncing forum posts...');
    // Implementation would fetch pending posts from IndexedDB and submit
    // This is a placeholder for future implementation
  } catch (error) {
    console.error('[SW] Error syncing forum posts:', error);
  }
}

// Helper: Sync chat messages
async function syncMessages() {
  try {
    console.log('[SW] Syncing messages...');
    // Implementation would fetch pending messages from IndexedDB and submit
    // This is a placeholder for future implementation
  } catch (error) {
    console.error('[SW] Error syncing messages:', error);
  }
}

console.log('[SW] Service worker loaded');
