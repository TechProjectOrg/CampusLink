import { Notification } from '../types';
import { NotificationsCard } from './NotificationsCard';

interface NotificationsPageProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNotificationClick?: (notification: Notification) => void;
  onAcceptFollowRequest?: (requesterUserId: string) => void;
  onRejectFollowRequest?: (requesterUserId: string) => void;
}

export function NotificationsPage({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
  onAcceptFollowRequest,
  onRejectFollowRequest,
}: NotificationsPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <NotificationsCard
          notifications={notifications}
          onMarkAsRead={onMarkAsRead}
          onMarkAllAsRead={onMarkAllAsRead}
          onNotificationClick={onNotificationClick}
          onAcceptFollowRequest={onAcceptFollowRequest}
          onRejectFollowRequest={onRejectFollowRequest}
        />
      </div>
    </div>
  );
}