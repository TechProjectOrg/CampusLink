import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AdminRoot from './admin/AdminRoot';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AppDataProvider } from './context/AppDataContext';

const isAdminPath = window.location.pathname.startsWith('/admin');
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    {isAdminPath ? (
      <AdminRoot />
    ) : (
      <AuthProvider>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </AuthProvider>
    )}
  </QueryClientProvider>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
