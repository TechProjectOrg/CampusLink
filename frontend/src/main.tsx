import { createRoot } from 'react-dom/client';
import App from './App';
import AdminRoot from './admin/AdminRoot';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';

const isAdminPath = window.location.pathname.startsWith('/admin');

createRoot(document.getElementById('root')!).render(
  isAdminPath ? (
    <AdminRoot />
  ) : (
    <AuthProvider>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </AuthProvider>
  )
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
