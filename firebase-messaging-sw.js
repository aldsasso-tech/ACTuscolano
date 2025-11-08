importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "LA TUA API KEY FIREBASE QUI",
  authDomain: "LA TUA AUTH DOMAIN QUI",
  projectId: "LA TUA PROJECT ID QUI",
  storageBucket: "LA TUA STORAGE BUCKET QUI",
  messagingSenderId: "LA TUA MESSAGING SENDER ID QUI",
  appId: "LA TUA APP ID QUI"
});

const messaging = firebase.messaging();

// Gestione delle notifiche in arrivo quando web app è chiusa/coperta
messaging.onBackgroundMessage((payload) => {
  console.log("BG Notification: ", payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/icons/icon-192.png" // facoltativo
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
