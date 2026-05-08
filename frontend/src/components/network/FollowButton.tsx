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
  compact?: boolean;

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
  compact = false,
  onFollow,
  onUnfollow,
  onCancelRequest,
}: FollowButtonProps) {
  const [confirmMode, setConfirmMode] = useState<'unfollow' | 'cancel-request' | null>(null);

  const label = useMemo(() => {
    if (isFollowing) return 'Following';
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
          compact
            ? (
              label === 'Following' || label === 'Requested'
                ? 'h-7 rounded-full bg-slate-100 border border-slate-200 px-3 text-xs font-medium text-slate-600 shadow-none transition-all hover:bg-slate-200 hover:text-slate-800'
                : 'h-7 rounded-full bg-primary/10 border border-primary/20 px-3 text-xs font-semibold text-primary shadow-none transition-all hover:bg-primary hover:text-white hover:border-primary'
            )
            : (
              label === 'Following' || label === 'Requested'
                ? 'w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl rounded-xl'
                : 'w-full gradient-primary shadow-lg hover:shadow-xl rounded-xl'
            )
        }
        variant="default"
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
