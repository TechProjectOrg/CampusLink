import { useMemo, useState } from 'react';
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

interface FollowingActionButtonProps {
  targetName: string;
  requestStatus: RequestStatus;
  isFollowing: boolean;
  onUnfollow: () => void;
  onCancelRequest: () => void;
}

export function FollowingActionButton({
  targetName,
  requestStatus,
  isFollowing,
  onUnfollow,
  onCancelRequest,
}: FollowingActionButtonProps) {
  const [confirmMode, setConfirmMode] = useState<'unfollow' | 'cancel-request' | null>(null);

  const label = useMemo(() => {
    if (requestStatus === 'requested') return 'Requested';
    return 'Following';
  }, [requestStatus]);

  const onClick = () => {
    if (requestStatus === 'requested') {
      setConfirmMode('cancel-request');
      return;
    }

    if (isFollowing) {
      setConfirmMode('unfollow');
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={onClick}
        className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
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
