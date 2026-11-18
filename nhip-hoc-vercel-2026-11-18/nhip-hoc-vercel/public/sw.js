// Service worker: hiện thông báo đẩy khi sắp tới giờ hẹn.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Nhịp học', {
    body: data.body || '',
    icon: '/miku.webp',
    tag: 'nhip-hoc-appt'
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
