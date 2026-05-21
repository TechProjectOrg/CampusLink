import { Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Student } from '../types';
import type { FollowGraph } from '../App';
import { useAuth } from '../context/AuthContext';
import { apiGetUserFollowGraph, type NetworkUser, type UserFollowGraphResponse } from '../lib/networkApi';
import { FollowButton } from './network/FollowButton';
import { UserCard } from './network/UserCard';
import { PageLayout } from './PageLayout';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface NetworkPageProps {
  students: Student[];
  currentUserId: string;
  viewedUserId: string;
  followGraph: FollowGraph;
  initialTab?: 'followers' | 'following';
  onFollow: (targetUserId: string, accountType?: 'public' | 'private') => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;
  onRemoveFollower: (followerUserId: string) => void;
  onViewProfile: (studentId: string) => void;
}

function fallbackStudentFromNetworkUser(user: NetworkUser): Student {
  return {
    id: user.userId,
    name: user.displayName,
    displayName: user.displayName,
    username: user.username,
    email: '',
    branch: user.branch ?? '',
    year: user.year ?? 0,
    avatar: user.profilePictureUrl ?? '',
    skills: [],
    interests: [],
    certifications: [],
    experience: [],
    societies: [],
    achievements: [],
    projects: [],
    accountType: user.isPrivate ? 'private' : 'public',
  };
}

function prioritizeNetworkUsers(users: Student[], currentUserId: string, viewerFollowingIds: string[], viewerFollowerIds: string[]) {
  return users
    .map((user, index) => {
      let priority = 3;

      if (user.id === currentUserId) {
        priority = 0;
      } else if (viewerFollowingIds.includes(user.id)) {
        priority = 1;
      } else if (viewerFollowerIds.includes(user.id)) {
        priority = 2;
      }

      return { user, index, priority };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.user);
}

export function NetworkPage({
  students,
  currentUserId,
  viewedUserId,
  followGraph,
  initialTab = 'followers',
  onFollow,
  onUnfollow,
  onCancelRequest,
  onRemoveFollower,
  onViewProfile,
}: NetworkPageProps) {
  const auth = useAuth();
  const isOwnNetwork = viewedUserId === currentUserId;
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [removeFollowerId, setRemoveFollowerId] = useState<string | null>(null);
  const [unfollowUserId, setUnfollowUserId] = useState<string | null>(null);
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);
  const [remoteGraph, setRemoteGraph] = useState<UserFollowGraphResponse | null>(null);
  const [isLoadingRemoteGraph, setIsLoadingRemoteGraph] = useState(false);
  const [remoteGraphError, setRemoteGraphError] = useState<string | null>(null);

  const viewerFollowerIds = followGraph.followersByUserId[currentUserId] ?? [];
  const viewerFollowingIds = followGraph.followingByUserId[currentUserId] ?? [];
  const outgoingRequestIds = followGraph.outgoingRequestsByUserId[currentUserId] ?? [];

  const resolveStudent = (user: NetworkUser): Student => {
    return students.find((student) => student.id === user.userId) ?? fallbackStudentFromNetworkUser(user);
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (isOwnNetwork) {
      setRemoteGraph(null);
      setRemoteGraphError(null);
      setIsLoadingRemoteGraph(false);
      return;
    }

    const token = auth.session?.token;
    if (!token) {
      setRemoteGraph(null);
      setRemoteGraphError('You must be signed in to view this network.');
      setIsLoadingRemoteGraph(false);
      return;
    }

    let cancelled = false;
    setIsLoadingRemoteGraph(true);
    setRemoteGraphError(null);

    apiGetUserFollowGraph(viewedUserId, token)
      .then((response) => {
        if (cancelled) return;
        setRemoteGraph(response);
      })
      .catch((error) => {
        if (cancelled) return;
        setRemoteGraph(null);
        setRemoteGraphError(error instanceof Error ? error.message : 'Unable to load this network.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingRemoteGraph(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth.session?.token, isOwnNetwork, viewedUserId]);

  const followers = useMemo(() => {
    if (isOwnNetwork) {
      const ownFollowers = followGraph.followersByUserId[currentUserId] ?? [];
      return prioritizeNetworkUsers(
        ownFollowers
        .map((id) => students.find((student) => student.id === id))
        .filter(Boolean) as Student[],
        currentUserId,
        viewerFollowingIds,
        viewerFollowerIds,
      );
    }
    return prioritizeNetworkUsers(
      (remoteGraph?.followers ?? []).map(resolveStudent),
      currentUserId,
      viewerFollowingIds,
      viewerFollowerIds,
    );
  }, [currentUserId, followGraph.followersByUserId, isOwnNetwork, remoteGraph, students, viewerFollowerIds, viewerFollowingIds]);

  const following = useMemo(() => {
    if (isOwnNetwork) {
      const ownFollowing = followGraph.followingByUserId[currentUserId] ?? [];
      return prioritizeNetworkUsers(
        ownFollowing
        .map((id) => students.find((student) => student.id === id))
        .filter(Boolean) as Student[],
        currentUserId,
        viewerFollowingIds,
        viewerFollowerIds,
      );
    }
    return prioritizeNetworkUsers(
      (remoteGraph?.following ?? []).map(resolveStudent),
      currentUserId,
      viewerFollowingIds,
      viewerFollowerIds,
    );
  }, [currentUserId, followGraph.followingByUserId, isOwnNetwork, remoteGraph, students, viewerFollowerIds, viewerFollowingIds]);

  const followersCount = followers.length;
  const followingCount = following.length;
  const owner = useMemo(() => {
    if (isOwnNetwork) {
      return students.find((student) => student.id === currentUserId) ?? null;
    }
    return remoteGraph?.owner ? resolveStudent(remoteGraph.owner) : students.find((student) => student.id === viewedUserId) ?? null;
  }, [currentUserId, isOwnNetwork, remoteGraph, students, viewedUserId]);

  const headerTitle = isOwnNetwork ? 'Network' : `${owner?.name ?? 'Profile'} Network`;
  const headerDescription = isOwnNetwork
    ? 'Followers and following - simple and student-first'
    : `Followers and following for ${owner?.name ?? 'this profile'}`;

  const renderViewerFollowAction = (user: Student) => {
    if (user.id === currentUserId) {
      return <Badge className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 shadow-none">You</Badge>;
    }

    const isFollowing = viewerFollowingIds.includes(user.id);
    const isFollower = viewerFollowerIds.includes(user.id);
    const requestStatus = outgoingRequestIds.includes(user.id) ? 'requested' : 'none';

    return (
      <FollowButton
        targetName={user.name}
        accountType={user.accountType}
        isFollowing={isFollowing}
        isFollower={isFollower}
        requestStatus={requestStatus}
        compact
        className="min-w-[96px]"
        onFollow={() => onFollow(user.id, user.accountType)}
        onUnfollow={() => onUnfollow(user.id)}
        onCancelRequest={() => onCancelRequest(user.id)}
      />
    );
  };

  const renderFollowersContent = () => {
    if (followers.length === 0) {
      return (
        <Card className="border-primary/10 rounded-2xl shadow-lg">
          <CardContent className="p-10 text-center">
            <p className="text-gray-500">No followers yet.</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {followers.map((user) => {
          const isFollowingBack = viewerFollowingIds.includes(user.id);

          return (
            <UserCard
              key={user.id}
              user={user}
              onClick={() => onViewProfile(user.id)}
              action={
                isOwnNetwork ? (
                  <div className="flex gap-2">
                    {!isFollowingBack && !outgoingRequestIds.includes(user.id) ? (
                      <Button
                        size="sm"
                        className="bg-primary text-white rounded-xl shadow-lg hover:shadow-xl"
                        onClick={() => onFollow(user.id, user.accountType)}
                      >
                        Follow Back
                      </Button>
                    ) : null}
                    {!isFollowingBack && outgoingRequestIds.includes(user.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                        onClick={() => setCancelRequestId(user.id)}
                      >
                        Requested
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                      onClick={() => setRemoveFollowerId(user.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : renderViewerFollowAction(user)
              }
            />
          );
        })}
      </div>
    );
  };

  const renderFollowingContent = () => {
    if (following.length === 0) {
      return (
        <Card className="border-primary/10 rounded-2xl shadow-lg">
          <CardContent className="p-10 text-center">
            <p className="text-gray-500">{isOwnNetwork ? "You're not following anyone yet." : 'Not following anyone yet.'}</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="space-y-3">
        {following.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            onClick={() => onViewProfile(user.id)}
            action={
              isOwnNetwork ? (
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
                    className="rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white transition-all duration-200 shadow-none"
                    onClick={() => setUnfollowUserId(user.id)}
                  >
                    Unfollow
                  </Button>
                )
              ) : renderViewerFollowAction(user)
            }
          />
        ))}
      </div>
    );
  };

  return (
    <PageLayout maxWidth="4xl" className="cl-network-page" contentClassName="cl-network-content px-2 py-6 md:px-4 space-y-6">
      <div className="hidden animate-slide-in-down md:block">
        <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
          {headerTitle}
        </h1>
        <p className="text-gray-600">{headerDescription}</p>
      </div>

      {!isOwnNetwork && isLoadingRemoteGraph ? (
        <Card className="border-primary/10 rounded-2xl shadow-lg">
          <CardContent className="p-10">
            <LoadingIndicator label="Loading network..." className="justify-start" size={20} />
          </CardContent>
        </Card>
      ) : null}

      {!isOwnNetwork && remoteGraphError ? (
        <Card className="border-primary/10 rounded-2xl shadow-lg">
          <CardContent className="p-10 text-center">
            <p className="text-gray-500">{remoteGraphError}</p>
          </CardContent>
        </Card>
      ) : null}

      {isOwnNetwork || (!isLoadingRemoteGraph && !remoteGraphError) ? (
        <Tabs value={activeTab} onValueChange={(value: string) => setActiveTab(value as 'followers' | 'following')} className="cl-network-tabs space-y-6">
          <TabsList className="cl-network-tabs-list bg-white/80 backdrop-blur-lg p-1 rounded-2xl border border-primary/10 shadow-lg">
            <TabsTrigger
              value="followers"
              className={`cl-network-tab-trigger flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300 ${
                activeTab === 'followers' ? 'gradient-primary text-white' : ''
              }`}
            >
              <Users className="w-4 h-4" />
              Followers
              <Badge className="bg-green-500 text-white ml-1">{followersCount}</Badge>
            </TabsTrigger>

            <TabsTrigger
              value="following"
              className={`cl-network-tab-trigger flex items-center gap-2 rounded-xl data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300 ${
                activeTab === 'following' ? 'gradient-primary text-white' : ''
              }`}
            >
              <Users className="w-4 h-4" />
              Following
              <Badge className="bg-green-500 text-white ml-1">{followingCount}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="followers" className="space-y-3">
            {renderFollowersContent()}
          </TabsContent>

          <TabsContent value="following" className="space-y-3">
            {renderFollowingContent()}
          </TabsContent>
        </Tabs>
      ) : null}

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
        <AlertDialogContent className="cl-network-alert-dialog">
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
          <AlertDialogFooter className="flex items-center justify-center gap-4 mt-6 sm:justify-center">
            <AlertDialogAction
              className="bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 hover:border-red-300 focus:outline-none focus:ring-0 active:bg-red-100 transition-none rounded-full h-10 px-4 font-semibold flex items-center justify-center shadow-none"
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
            >
              Remove
            </AlertDialogAction>
            <AlertDialogCancel className="bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 rounded-full px-4 h-10 transition-all duration-200 mt-0 flex items-center justify-center">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
