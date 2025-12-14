import type { Student } from '../../types';
import { Button } from '../ui/button';
import { UserCard } from './UserCard';

interface RequestCardProps {
  user: Student;
  mutualFollowersCount?: number;
  onViewProfile?: () => void;
  onAccept: () => void;
  onReject: () => void;
}

export function RequestCard({ user, mutualFollowersCount, onViewProfile, onAccept, onReject }: RequestCardProps) {
  return (
    <UserCard
      user={user}
      onClick={onViewProfile}
      mutualFollowersCount={mutualFollowersCount}
      action={
        <div className="flex gap-2">
          <Button size="sm" className="bg-green-500 text-white shadow-lg hover:shadow-xl rounded-xl" onClick={onAccept}>
            Accept
          </Button>
          <Button size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl" onClick={onReject}>
            Reject
          </Button>
        </div>
      }
    />
  );
}
