import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <AppDataProvider>
      <App />
    </AppDataProvider>
  </AuthProvider>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
