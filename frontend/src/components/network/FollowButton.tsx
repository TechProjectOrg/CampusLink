import { useMemo, useState } from 'react';
import type { AccountType } from '../../types';
import type { RequestStatus } from '../../types';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface FollowButtonProps {
  targetName: string;
  accountType: AccountType;
  isFollowing: boolean;
  isFollower: boolean;
  requestStatus: RequestStatus;

  onFollow: () => void;
  onUnfollow: () => void;
  onCancelRequest: () => void;
}

export function FollowButton({
  targetName,
  accountType,
  isFollowing,
  isFollower,
  requestStatus,
  onFollow,
  onUnfollow,
  onCancelRequest,
}: FollowButtonProps) {
  const [confirmMode, setConfirmMode] = useState<'unfollow' | 'cancel-request' | null>(null);

  const label = useMemo(() => {
    if (isFollowing) return 'Unfollow';
    if (requestStatus === 'requested') return 'Requested';
    if (isFollower) return 'Follow Back';
    return 'Follow';
  }, [isFollower, isFollowing, requestStatus]);

  const handleClick = () => {
    if (isFollowing) {
      setConfirmMode('unfollow');
      return;
    }

    if (requestStatus === 'requested') {
      setConfirmMode('cancel-request');
      return;
    }

    onFollow();
  };

  const helperText = useMemo(() => {
    if (label === 'Follow' || label === 'Follow Back') {
      return accountType === 'private' ? 'Private account' : 'Public account';
    }
    return null;
  }, [accountType, label]);

  return (
    <>
      <Button
        onClick={handleClick}
        size="sm"
        className={
          isFollowing
            ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 active:bg-red-50 active:text-red-600 focus:bg-red-50 focus:text-red-600 focus:outline-none focus:ring-0 disabled:opacity-100 rounded-full px-6 h-11 font-medium transition-none shadow-none flex items-center justify-center'
            : label === 'Requested'
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl rounded-full px-6 h-11 font-medium flex items-center justify-center'
            : 'gradient-primary shadow-lg hover:shadow-xl rounded-full px-6 h-11 font-medium flex items-center justify-center'
        }
        variant="ghost"
        title={helperText ?? undefined}
      >
        {label}
      </Button>

      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => !open && setConfirmMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'unfollow' ? `Unfollow ${targetName}?` : `Cancel follow request to ${targetName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'unfollow'
                ? 'You will no longer see their posts.'
                : 'Your follow request will be cancelled.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (confirmMode === 'unfollow') onUnfollow();
                if (confirmMode === 'cancel-request') onCancelRequest();
                setConfirmMode(null);
              }}
            >
              {confirmMode === 'unfollow' ? 'Unfollow' : 'Cancel Request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
