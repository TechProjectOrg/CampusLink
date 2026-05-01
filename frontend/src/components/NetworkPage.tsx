import { Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Student } from '../types';
import type { FollowGraph } from '../App';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

import { UserCard } from './network/UserCard';

interface NetworkPageProps {
  students: Student[];
  currentUserId: string;
  followGraph: FollowGraph;

  onFollow: (targetUserId: string, accountType?: 'public' | 'private') => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;

  onRemoveFollower: (followerUserId: string) => void;
  onViewProfile: (studentId: string) => void;
}

function uniqueIntersection(a: string[], b: string[]) {
  const bSet = new Set(b);
  const out: string[] = [];
  for (const id of a) {
    if (bSet.has(id)) out.push(id);
  }
  return Array.from(new Set(out));
}

export function NetworkPage({
  students,
  currentUserId,
  followGraph,
  onFollow,
  onUnfollow,
  onCancelRequest,
  onRemoveFollower,
  onViewProfile,
}: NetworkPageProps) {
  const followersIds = followGraph.followersByUserId[currentUserId] ?? [];
  const followingIds = followGraph.followingByUserId[currentUserId] ?? [];
  const outgoingRequestIds = followGraph.outgoingRequestsByUserId[currentUserId] ?? [];

  const followers = useMemo(() => {
    return followersIds
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean) as Student[];
  }, [followersIds, students]);

  const following = useMemo(() => {
    return followingIds.map((id) => students.find((s) => s.id === id)).filter(Boolean) as Student[];
  }, [followingIds, students]);

  const [activeTab, setActiveTab] = useState<'followers' | 'following'>('followers');
  const [removeFollowerId, setRemoveFollowerId] = useState<string | null>(null);
  const [unfollowUserId, setUnfollowUserId] = useState<string | null>(null);
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);

  const followersCount = followersIds.length;
  const followingCount = followingIds.length;

  const mutualFollowersCount = (otherUserId: string) => {
    // Future-ready: mutual followers = people who follow BOTH you and the other user.
    const mutual = uniqueIntersection(
      followGraph.followersByUserId[currentUserId] ?? [],
      followGraph.followersByUserId[otherUserId] ?? []
    ).filter((id) => id !== currentUserId && id !== otherUserId);

    return mutual.length;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Network
          </h1>
          <p className="text-gray-600">Followers and following - simple and student-first</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as any)} className="space-y-6">
          <TabsList className="bg-white/80 backdrop-blur-lg p-1 rounded-2xl border border-primary/10 shadow-lg">
            <TabsTrigger
              value="followers"
              className={`flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300 ${
                activeTab === 'followers' ? 'gradient-primary text-white' : ''
              }`}
            >
              <Users className="w-4 h-4" />
              Followers
              <Badge className="bg-green-500 text-white ml-1">{followersCount}</Badge>
            </TabsTrigger>

            <TabsTrigger
              value="following"
              className={`flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300 ${
                activeTab === 'following' ? 'gradient-primary text-white' : ''
              }`}
            >
              <Users className="w-4 h-4" />
              Following
              <Badge className="bg-green-500 text-white ml-1">{followingCount}</Badge>
            </TabsTrigger>

          </TabsList>

          <TabsContent value="followers" className="space-y-3">
            {followers.length === 0 ? (
              <Card className="border-primary/10 rounded-2xl shadow-lg">
                <CardContent className="p-10 text-center">
                  <p className="text-gray-500">No followers yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {followers.map((user) => {
                  const isFollowingBack = followingIds.includes(user.id);
                  const mutual = mutualFollowersCount(user.id);

                  return (
                    <UserCard
                      key={user.id}
                      user={user}
                      onClick={() => onViewProfile(user.id)}
                      mutualFollowersCount={mutual}
                      action={
                        <div className="flex gap-2">
                          {!isFollowingBack && !outgoingRequestIds.includes(user.id) && (
                            <Button
                              size="sm"
                              className="bg-primary text-white rounded-xl shadow-lg hover:shadow-xl"
                              onClick={() => onFollow(user.id, user.accountType)}
                            >
                              Follow Back
                            </Button>
                          )}
                          {!isFollowingBack && outgoingRequestIds.includes(user.id) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                              onClick={() => setCancelRequestId(user.id)}
                            >
                              Requested
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                            onClick={() => setRemoveFollowerId(user.id)}
                          >
                           Remove
                          </Button>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="following" className="space-y-3">
            {following.length === 0 ? (
              <Card className="border-primary/10 rounded-2xl shadow-lg">
                <CardContent className="p-10 text-center">
                  <p className="text-gray-500">You’re not following anyone yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {following.map((user) => {
                  const mutual = mutualFollowersCount(user.id);
                  return (
                    <UserCard
                      key={user.id}
                      user={user}
                      onClick={() => onViewProfile(user.id)}
                      mutualFollowersCount={mutual}
                      action={
                       outgoingRequestIds.includes(user.id) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                          onClick={() => setCancelRequestId(user.id)}
                         >
                          Requested
                         </Button>
                       ) : (
                       <Button
                         size="sm"
                         variant="outline"
                         className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                        
                         onClick={() => setUnfollowUserId(user.id)}
                         >
                          Unfollow
                        </Button>
                       )
                      }

                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>

      <AlertDialog
        open={removeFollowerId !== null || unfollowUserId !== null || cancelRequestId !== null}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setRemoveFollowerId(null);
            setUnfollowUserId(null);
            setCancelRequestId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeFollowerId !== null
                ? 'Remove follower?'
                : unfollowUserId !== null
                ? 'Unfollow user?'
                : 'Cancel request?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeFollowerId !== null
                ? 'They will no longer see your posts.'
                : unfollowUserId !== null
                ? 'You will no longer see their posts.'
                : 'You will no longer be sending a follow request.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removeFollowerId !== null) {
                  onRemoveFollower(removeFollowerId);
                  setRemoveFollowerId(null);
                } else if (unfollowUserId !== null) {
                  onUnfollow(unfollowUserId);
                  setUnfollowUserId(null);
                } else if (cancelRequestId !== null) {
                  onCancelRequest(cancelRequestId);
                  setCancelRequestId(null);
                }
              }}
              variant="destructive"
            >
              {removeFollowerId !== null ? 'Remove' : unfollowUserId !== null ? 'Unfollow' : 'Cancel Request'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
