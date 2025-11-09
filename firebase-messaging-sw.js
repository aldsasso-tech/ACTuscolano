// firebase-messaging-sw.js
self.addEventListener('install', ()=>{ self.skipWaiting() })
self.addEventListener('activate', ()=>{ self.clients.claim() })
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');


firebase.initializeApp({
  apiKey: "AIzaSyAQLQYXcwyFt5luNw1iA5N2-EfnbF1Bc7U",
  authDomain: "actuscolano.firebaseapp.com",
  projectId: "actuscolano",
  messagingSenderId: "62685359731",
  appId: "1:62685359731:web:26819bedd94fcb1ce8c406"
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(function(payload) {
  console.log('BG Received:', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/ACTuscolano/Logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});







