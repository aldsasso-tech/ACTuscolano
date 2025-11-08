// firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAQLQYXcwyFt5luNw1iA5N2-EfnbF1Bc7U",
  authDomain: "actuscolano.firebaseapp.com",
  databaseURL: "https://actuscolano-default-rtdb.firebaseio.com",
  projectId: "actuscolano",
  storageBucket: "actuscolano.firebasestorage.app",
  messagingSenderId: "62685359731",
  appId: "1:62685359731:web:26819bedd94fcb1ce8c406",
  measurementId: "G-TSVH8PH4RC"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body
  });
});



