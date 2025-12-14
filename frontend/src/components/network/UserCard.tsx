import { ReactNode } from 'react';
import type { Student } from '../../types';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card, CardContent } from '../ui/card';

interface UserCardProps {
  user: Student;
  onClick?: () => void;
  mutualFollowersCount?: number;
  secondaryLabel?: string; // New prop
  action?: ReactNode;
}

export function UserCard({ user, onClick, mutualFollowersCount, secondaryLabel, action }: UserCardProps) {
  const showMutual = typeof mutualFollowersCount === 'number' && mutualFollowersCount > 0;

  return (
    <Card className="border-primary/10 rounded-2xl shadow-lg hover:shadow-xl transition-all">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
            onClick={onClick}
          >
            <Avatar className="w-12 h-12 ring-2 ring-primary/10">
              <AvatarImage src={user.avatar} />
              <AvatarFallback>{user.name?.[0] ?? user.username?.[0] ?? '?'}</AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="text-gray-900 truncate">{user.name}</p>
              <p className="text-sm text-gray-500 truncate">@{user.username}</p>
              {secondaryLabel && (
                <p className="text-xs text-gray-500 mt-1">{secondaryLabel}</p>
              )}
              {showMutual && (
                <p className="text-xs text-gray-500 mt-1">
                  {mutualFollowersCount} mutual follower{mutualFollowersCount === 1 ? '' : 's'}
                </p>
              )}
            </div>
          </button>

          {action ? <div className="flex-shrink-0">{action}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
