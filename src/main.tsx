import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker for PWA Offline & Install Support
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker correctly registered with scope:', registration.scope);
      })
      .catch((error) => {
        console.error('[PWA] Service Worker registration error:', error);
      });
  });
} else if ('serviceWorker' in navigator) {
  // In development, handle registration with graceful logs
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker active (Dev mode) scope:', registration.scope);
      })
      .catch((err) => {
        console.log('[PWA] Service worker register (bypassed or restricted in local iframe preview):', err.message);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
