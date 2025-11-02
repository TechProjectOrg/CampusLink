import { useState } from 'react';
import { Bell, UserPlus, Heart, MessageCircle, Briefcase, Users, Check, X } from 'lucide-react';
import { Notification } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardHeader } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

interface NotificationsCardProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNotificationClick?: (notification: Notification) => void;
}

export function NotificationsCard({ 
  notifications, 
  onMarkAsRead, 
  onMarkAllAsRead,
  onNotificationClick 
}: NotificationsCardProps) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'connection':
        return <UserPlus className="w-4 h-4" />;
      case 'like':
        return <Heart className="w-4 h-4" />;
      case 'comment':
        return <MessageCircle className="w-4 h-4" />;
      case 'message':
        return <MessageCircle className="w-4 h-4" />;
      case 'opportunity':
        return <Briefcase className="w-4 h-4" />;
      case 'club':
        return <Users className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'connection':
        return 'bg-primary/10 text-primary';
      case 'like':
        return 'bg-destructive/10 text-destructive';
      case 'comment':
        return 'bg-secondary/10 text-secondary';
      case 'message':
        return 'bg-purple-100 text-purple-600';
      case 'opportunity':
        return 'bg-accent/10 text-accent';
      case 'club':
        return 'bg-blue-100 text-blue-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Card className="border-primary/10 rounded-2xl shadow-lg overflow-hidden animate-slide-in-up">
      <CardHeader className="p-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <p className="text-sm text-gray-500">{unreadCount} unread</p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMarkAllAsRead}
              className="text-primary hover:bg-primary/10 text-xs"
            >
              <Check className="w-3 h-3 mr-1" />
              Mark all
            </Button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm transition-all duration-300 ${
              filter === 'all'
                ? 'gradient-primary text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`flex-1 py-2 px-3 rounded-xl text-sm transition-all duration-300 ${
              filter === 'unread'
                ? 'gradient-primary text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>
      </CardHeader>

      <Separator />

      <ScrollArea className="h-[400px]">
        <CardContent className="p-0">
          {filteredNotifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                <Bell className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500">No {filter === 'unread' ? 'unread ' : ''}notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => {
                    if (!notification.read) {
                      onMarkAsRead(notification.id);
                    }
                    onNotificationClick?.(notification);
                  }}
                  className={`w-full p-4 text-left hover:bg-gray-50 transition-all duration-300 relative group cursor-pointer ${
                    !notification.read ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    {/* Avatar with Icon Badge */}
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-12 h-12 ring-2 ring-white shadow-sm">
                        <AvatarImage src={notification.avatar} />
                        <AvatarFallback>{notification.title[0]}</AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-lg ${getNotificationColor(notification.type)} flex items-center justify-center shadow-md`}>
                        {getNotificationIcon(notification.type)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm text-gray-900 line-clamp-1">
                          <span className="font-medium">{notification.title}</span>
                        </p>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1"></div>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTimestamp(notification.timestamp)}
                      </p>
                    </div>

                    {/* Mark as Read Button (shown on hover) */}
                    {!notification.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkAsRead(notification.id);
                        }}
                        className="absolute top-4 right-4 w-6 h-6 rounded-full bg-white border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-primary hover:border-primary hover:text-white flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
