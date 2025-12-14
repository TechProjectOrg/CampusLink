import { Users, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Student } from '../types';
import type { FollowGraph } from '../lib/mockFollows';
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
import { FollowButton } from './network/FollowButton';
import { RequestCard } from './network/RequestCard';
import { UserCard } from './network/UserCard';

interface NetworkPageProps {
  students: Student[];
  currentUserId: string;
  followGraph: FollowGraph;

  onFollow: (targetUserId: string) => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;

  onRemoveFollower: (followerUserId: string) => void;
  onAcceptRequest: (requesterUserId: string) => void;
  onRejectRequest: (requesterUserId: string) => void;

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
  onAcceptRequest,
  onRejectRequest,
  onViewProfile,
}: NetworkPageProps) {
  const currentUser = students.find((s) => s.id === currentUserId);
  const isPrivateAccount = currentUser?.accountType === 'private';

  const followersIds = followGraph.followersByUserId[currentUserId] ?? [];
  const followingIds = followGraph.followingByUserId[currentUserId] ?? [];
  const outgoingRequestIds = followGraph.outgoingRequestsByUserId[currentUserId] ?? [];
  const incomingRequestIds = followGraph.incomingRequestsByUserId[currentUserId] ?? [];

  const followers = useMemo(() => {
    return followersIds
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean) as Student[];
  }, [followersIds, students]);

  const following = useMemo(() => {
    return followingIds.map((id) => students.find((s) => s.id === id)).filter(Boolean) as Student[];
  }, [followingIds, students]);

  const incomingRequests = useMemo(() => {
    return incomingRequestIds
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean) as Student[];
  }, [incomingRequestIds, students]);

  const [activeTab, setActiveTab] = useState<'followers' | 'following' | 'requests'>('followers');
  const [requestLimit, setRequestLimit] = useState(3);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [removeFollowerId, setRemoveFollowerId] = useState<string | null>(null);
  const [unfollowUserId, setUnfollowUserId] = useState<string | null>(null);

  const followersCount = followersIds.length;
  const followingCount = followingIds.length;
  const requestsCount = incomingRequestIds.length;

  const mutualFollowersCount = (otherUserId: string) => {
    // Future-ready: mutual followers = people who follow BOTH you and the other user.
    const mutual = uniqueIntersection(
      followGraph.followersByUserId[currentUserId] ?? [],
      followGraph.followersByUserId[otherUserId] ?? []
    ).filter((id) => id !== currentUserId && id !== otherUserId);

    return mutual.length;
  };

  const visibleRequests = incomingRequests.slice(0, requestLimit);
  const canLoadMore = incomingRequests.length > visibleRequests.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Network
          </h1>
          <p className="text-gray-600">Followers, following, and requests — simple and student-first</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
          <TabsList className="bg-white/80 backdrop-blur-lg p-1 rounded-2xl border border-primary/10 shadow-lg">
            <TabsTrigger
              value="followers"
              className={`flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300 ${
                activeTab === 'followers' ? 'gradient-primary text-white' : ''
              }`}
            >
              <Users className="w-4 h-4" />
              Followers
              <Badge className="bg-secondary text-white ml-1">{followersCount}</Badge>
            </TabsTrigger>

            <TabsTrigger
              value="following"
              className={`flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300 ${
                activeTab === 'following' ? 'gradient-primary text-white' : ''
              }`}
            >
              <Users className="w-4 h-4" />
              Following
              <Badge className="bg-secondary text-white ml-1">{followingCount}</Badge>
            </TabsTrigger>

            {isPrivateAccount && (
              <TabsTrigger
                value="requests"
                className={`flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300 ${
                  activeTab === 'requests' ? 'gradient-primary text-white' : ''
                }`}
              >
                <UserPlus className="w-4 h-4" />
                Requests
                {requestsCount > 0 && <Badge className="bg-destructive text-white ml-1">{requestsCount}</Badge>}
              </TabsTrigger>
            )}
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                          onClick={() => setRemoveFollowerId(user.id)}
                        >
                          Remove
                        </Button>
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
                  const isFollowing = followingIds.includes(user.id);
                  const requestStatus = outgoingRequestIds.includes(user.id) ? 'requested' : 'none';
                  const isFollower = followersIds.includes(user.id);
                  const mutual = mutualFollowersCount(user.id);

                  return (
                    <UserCard
                      key={user.id}
                      user={user}
                      onClick={() => onViewProfile(user.id)}
                      mutualFollowersCount={mutual}
                      action={
                        <FollowButton
                          targetName={user.name}
                          accountType={user.accountType}
                          isFollowing={true}
                          onUnfollow={() => setUnfollowUserId(user.id)}
                        />
                      }
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>

          {isPrivateAccount && (
            <TabsContent value="requests" className="space-y-3">
              {incomingRequests.length === 0 ? (
                <Card className="border-primary/10 rounded-2xl shadow-lg">
                  <CardContent className="p-10 text-center">
                    <p className="text-gray-500">No follow requests right now.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {visibleRequests.map((user) => {
                    const mutual = mutualFollowersCount(user.id);

                    return (
                      <RequestCard
                        key={user.id}
                        user={user}
                        mutualFollowersCount={mutual}
                        onViewProfile={() => onViewProfile(user.id)}
                        onAccept={() => onAcceptRequest(user.id)}
                        onReject={() => onRejectRequest(user.id)}
                      />
                    );
                  })}

                  {canLoadMore && (
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        className="w-full rounded-xl"
                        disabled={isLoadingMore}
                        onClick={() => {
                          setIsLoadingMore(true);
                          // Mimic an API call.
                          window.setTimeout(() => {
                            setRequestLimit(incomingRequests.length);
                            setIsLoadingMore(false);
                          }, 450);
                        }}
                      >
                        {isLoadingMore ? 'Loading…' : 'Load More'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>

      <AlertDialog
        open={removeFollowerId !== null || unfollowUserId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveFollowerId(null);
            setUnfollowUserId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeFollowerId !== null ? 'Remove follower?' : 'Unfollow user?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeFollowerId !== null
                ? 'They will no longer see your posts.'
                : 'You will no longer see their posts.'}
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
                }
              }}
            >
              {removeFollowerId !== null ? 'Remove' : 'Unfollow'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
