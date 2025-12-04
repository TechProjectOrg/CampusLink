import { Notification } from '../types';
import { NotificationsCard } from './NotificationsCard';

interface NotificationsPageProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

export function NotificationsPage({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick
}: NotificationsPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <NotificationsCard
          notifications={notifications}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
          onNotificationClick={onNotificationClick}
        />
      </div>
    </div>
  );
}
