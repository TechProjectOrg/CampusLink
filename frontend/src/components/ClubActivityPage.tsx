import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, Crown, Lock, MoreVertical, Plus, Search, ShieldCheck, TrendingUp, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userPostToOpportunity } from '../context/AppDataContext';
import { apiCreateUserPost } from '../lib/postsApi';
import {
  apiJoinClub,
  apiApproveClubMember,
  apiDeleteClub,
  apiFetchClub,
  apiFetchClubMembers,
  apiFetchClubPosts,
  apiInviteClubMember,
  apiRemoveClubMember,
  apiUpdateClub,
  apiUpdateClubMemberRole,
  type ClubMember,
} from '../lib/clubsApi';
import { apiGetFollowGraph, apiSearchUsers, type SearchUserResult } from '../lib/networkApi';
import type { Club, Student } from '../types';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { OpportunityCard } from './OpportunityCard';
import { LoadingState } from './LoadingState';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { ImageUpload } from './ui/ImageUpload';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ClubLogoUpload } from './ui/ClubLogoUpload';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { CreateUnifiedPostModal } from './CreateUnifiedPostModal';
import { LoadingIndicator } from './ui/LoadingIndicator';

interface ClubActivityPageProps {
  clubSlug: string;
  students: Student[];
  currentUserId: string;
  onBack: () => void;
  onViewProfile?: (studentId: string) => void;
}

interface InviteCandidate {
  userId: string;
  username: string;
  profilePictureUrl: string | null;
  branch: string | null;
  year: number | null;
  isConnected: boolean;
}

export function ClubActivityPage({ clubSlug, students, currentUserId, onBack, onViewProfile }: ClubActivityPageProps) {
  const auth = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [posts, setPosts] = useState<ReturnType<typeof userPostToOpportunity>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [isSearchingInviteUsers, setIsSearchingInviteUsers] = useState(false);
  const [inviteBusyUserId, setInviteBusyUserId] = useState<string | null>(null);
  const [inviteSearchResults, setInviteSearchResults] = useState<SearchUserResult[]>([]);
  const [connectedUserIds, setConnectedUserIds] = useState<Set<string>>(new Set());

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDeletingClub, setIsDeletingClub] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [settingsAvatarFile, setSettingsAvatarFile] = useState<File | null>(null);
  const [settingsCoverImageFile, setSettingsCoverImageFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeCoverImage, setRemoveCoverImage] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    description: '',
    privacy: 'open' as Club['privacy'],
    primaryCategory: '',
  });

  const loadClubData = async () => {
    const clubValue = await apiFetchClub(clubSlug, auth.session?.token);
    const [memberRows, postRows] = await Promise.all([
      apiFetchClubMembers(clubValue.id, auth.session?.token, 100, 0).catch(() => []),
      apiFetchClubPosts(clubValue.id, auth.session?.token, 25, 0).catch(() => []),
    ]);

    setClub(clubValue);
    setMembers(memberRows);
    setPosts(postRows.map((post) => userPostToOpportunity(post, {}, auth.currentUser ?? null)));
    setSettingsForm({
      name: clubValue.name,
      description: clubValue.description ?? clubValue.shortDescription ?? '',
      privacy: clubValue.privacy,
      primaryCategory: clubValue.primaryCategory?.displayName ?? '',
    });
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    loadClubData()
      .then(() => {
        if (!isMounted) return;
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Unable to load club');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [auth.currentUser, auth.session?.token, clubSlug]);

  const memberLookup = useMemo(() => {
    const lookup = new Map<string, Student>();
    for (const student of students) {
      lookup.set(student.id, student);
    }
    return lookup;
  }, [students]);

  useEffect(() => {
    if (!auth.session?.token || !isInviteOpen) return;
    let isMounted = true;
    apiGetFollowGraph(auth.session.token)
      .then((graph) => {
        if (!isMounted) return;
        const connected = new Set<string>();
        for (const user of graph.followers ?? []) connected.add(user.userId);
        for (const user of graph.following ?? []) connected.add(user.userId);
        connected.delete(currentUserId);
        setConnectedUserIds(connected);
      })
      .catch(() => {
        if (isMounted) setConnectedUserIds(new Set());
      });
    return () => {
      isMounted = false;
    };
  }, [auth.session?.token, currentUserId, isInviteOpen]);

  useEffect(() => {
    if (!isInviteOpen || !auth.session?.token) return;
    const q = inviteSearch.trim();
    if (!q) {
      setInviteSearchResults([]);
      setIsSearchingInviteUsers(false);
      return;
    }
    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSearchingInviteUsers(true);
      try {
        const rows = await apiSearchUsers(q, auth.session?.token, 50, 0);
        if (isMounted) {
          setInviteSearchResults(rows);
        }
      } catch {
        if (isMounted) {
          setInviteSearchResults([]);
        }
      } finally {
        if (isMounted) {
          setIsSearchingInviteUsers(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [auth.session?.token, inviteSearch, isInviteOpen]);

  const existingMemberIds = useMemo(() => new Set(members.map((member) => member.userId)), [members]);

  const inviteCandidates = useMemo(() => {
    const pushCandidate = (map: Map<string, InviteCandidate>, candidate: InviteCandidate) => {
      if (candidate.userId === currentUserId) return;
      if (existingMemberIds.has(candidate.userId)) return;
      if (map.has(candidate.userId)) return;
      map.set(candidate.userId, candidate);
    };

    const candidateMap = new Map<string, InviteCandidate>();

    if (inviteSearch.trim()) {
      for (const user of inviteSearchResults) {
        pushCandidate(candidateMap, {
          userId: user.userId,
          username: user.username,
          profilePictureUrl: user.profilePictureUrl,
          branch: user.branch,
          year: user.year,
          isConnected: connectedUserIds.has(user.userId),
        });
      }
    } else {
      for (const student of students) {
        pushCandidate(candidateMap, {
          userId: student.id,
          username: student.name || student.username,
          profilePictureUrl: student.avatar ?? null,
          branch: student.branch ?? null,
          year: student.year ?? null,
          isConnected: connectedUserIds.has(student.id),
        });
      }
    }

    const connected: InviteCandidate[] = [];
    const others: InviteCandidate[] = [];
    for (const candidate of candidateMap.values()) {
      if (candidate.isConnected) connected.push(candidate);
      else others.push(candidate);
    }

    connected.sort((a, b) => a.username.localeCompare(b.username));
    others.sort((a, b) => a.username.localeCompare(b.username));

    return { connected, others };
  }, [connectedUserIds, currentUserId, existingMemberIds, inviteSearch, inviteSearchResults, students]);

  const handleInviteMember = async (userId: string) => {
    if (!club) return;
    setInviteBusyUserId(userId);
    try {
      await apiInviteClubMember(club.id, userId, auth.session?.token);
      await loadClubData();
      toast.success('Invitation sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to invite member');
    } finally {
      setInviteBusyUserId(null);
    }
  };

  const handleCreateClubPostFromModal = async (draft: any) => {
    if (!club) return;
    const contentText = typeof draft?.description === 'string' ? draft.description.trim() : '';
    if (!contentText) return;
    const hashtags = Array.isArray(draft?.tags)
      ? draft.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean)
      : [];
    const imageFile: File | undefined = draft?.imageFile instanceof File ? draft.imageFile : undefined;
    setIsPosting(true);
    try {
      const created = await apiCreateUserPost(
        currentUserId,
        {
          postType: 'club_activity',
          visibility: 'club_members',
          clubId: club.id,
          contentText,
          hashtags,
        },
        auth.session?.token,
        imageFile ? [imageFile] : undefined,
      );
      setPosts((current) => [userPostToOpportunity(created, {}, auth.currentUser ?? null), ...current]);
      toast.success('Club post published');
      setIsCreatePostOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish club post');
    } finally {
      setIsPosting(false);
    }
  };

  const handleApproveRequest = async (userId: string) => {
    if (!club) return;
    setBusyMemberId(userId);
    try {
      await apiApproveClubMember(club.id, userId, auth.session?.token);
      await loadClubData();
      toast.success('Membership request approved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve request');
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRejectRequest = async (userId: string) => {
    if (!club) return;
    setBusyMemberId(userId);
    try {
      await apiRemoveClubMember(club.id, userId, auth.session?.token, { reason: 'Request rejected' });
      await loadClubData();
      toast.success('Membership request rejected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject request');
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleToggleAdminRole = async (member: ClubMember) => {
    if (!club) return;
    const nextRole = member.role === 'admin' ? 'member' : 'admin';
    setBusyMemberId(member.userId);
    try {
      await apiUpdateClubMemberRole(club.id, member.userId, nextRole, auth.session?.token);
      await loadClubData();
      toast.success(nextRole === 'admin' ? 'Member promoted to admin' : 'Admin role removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update admin role');
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!club) return;

    setIsSavingSettings(true);
    try {
      const updated = await apiUpdateClub(
        club.id,
        {
          name: settingsForm.name.trim(),
          description: settingsForm.description.trim(),
          privacy: settingsForm.privacy,
          primaryCategory: settingsForm.primaryCategory.trim(),
          removeAvatar,
          removeCoverImage,
        },
        auth.session?.token,
        {
          avatar: settingsAvatarFile,
          coverImage: settingsCoverImageFile,
        },
      );

      setClub(updated);
      setSettingsAvatarFile(null);
      setSettingsCoverImageFile(null);
      setRemoveAvatar(false);
      setRemoveCoverImage(false);
      await loadClubData();
      toast.success('Club settings updated');
      setIsSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleDeleteClub = async () => {
    if (!club) return;
    const confirmed = window.confirm('Delete this club permanently? This cannot be undone.');
    if (!confirmed) return;

    setIsDeletingClub(true);
    try {
      await apiDeleteClub(club.id, auth.session?.token);
      toast.success('Club deleted');
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete club');
    } finally {
      setIsDeletingClub(false);
    }
  };

  if (isLoading) {
    return <LoadingState type="page" />;
  }

  if (!club) {
    return <p className="p-6 text-red-600">{error ?? 'Club not found.'}</p>;
  }

  const canManageClub = Boolean(club.permissions?.canManageClub);
  const canInviteMembers = Boolean(club.permissions?.canInviteMembers);
  const canModerateMembers = Boolean(club.permissions?.canModerateMembers);
  const membershipRole = club.permissions?.membershipRole;
  const canShowRequestsTab = canManageClub && club.privacy !== 'private';
  const pendingMembers = members.filter((member) => member.status === 'pending');
  const invitedMembers = members.filter((member) => member.status === 'invited');
  const activeMembers = members.filter((member) => member.status === 'active');
  const isInvited = club.membership?.status === 'invited' || club.permissions?.membershipStatus === 'invited';
  const isPendingMembership = club.membership?.status === 'pending' || club.permissions?.membershipStatus === 'pending';
  const isActiveMember = club.membership?.status === 'active' || club.permissions?.membershipStatus === 'active';
  const canAccessRestrictedContent = isActiveMember || club.privacy === 'open';
  const isPrivateInvitePreview = !canAccessRestrictedContent;

  const handleJoinCurrentClub = async () => {
    if (!club) return;
    setIsPosting(true);
    try {
      const updated = await apiJoinClub(club.id, auth.session?.token);
      setClub(updated);
      await loadClubData();
      toast.success('You joined the club');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join club');
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <div className="animate-slide-in-down">
          <Card className="overflow-hidden border-0 shadow-xl">
            <div className="relative h-48 md:h-64 bg-gradient-to-r from-blue-500 to-purple-600">
              {club.coverImageUrl || club.avatarUrl ? (
                <ImageWithFallback
                  src={club.coverImageUrl ?? club.avatarUrl ?? undefined}
                  alt={club.name}
                  className="w-full h-full object-cover opacity-40"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                <Button variant="ghost" onClick={onBack} className="bg-black/30 text-white hover:bg-black/45 hover:text-white transition-all">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Clubs
                </Button>
                {canManageClub ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="rounded-full bg-black/30 text-white border-white/30 hover:bg-black/45 hover:text-white">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
                        Club Settings
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full border border-white/40 bg-white/15 overflow-hidden shrink-0">
                    {club.avatarUrl || club.coverImageUrl ? (
                      <ImageWithFallback
                        src={club.avatarUrl ?? club.coverImageUrl ?? undefined}
                        alt={`${club.name} logo`}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-white truncate">{club.name}</h1>
                    <Badge className="mt-1 bg-white/15 text-white border-white/20">Sports</Badge>
                  </div>
                  {!isActiveMember ? (
                    <Button
                      size="sm"
                      onClick={() => void handleJoinCurrentClub()}
                      disabled={isPendingMembership || isPosting}
                      className="bg-white text-primary hover:bg-white/90 shrink-0"
                    >
                      {isPendingMembership
                        ? 'Request Pending'
                        : (isInvited ? 'Join Group' : (club.privacy === 'request' ? 'Request to Join' : 'Join Group'))}
                    </Button>
                  ) : null}
                  {club.privacy === 'private' ? <Lock className="w-4 h-4 text-white shrink-0" /> : null}
                </div>
                <p className="text-white/90 text-sm md:text-base mb-4">{club.description ?? club.shortDescription}</p>
                {canAccessRestrictedContent ? (
                  <div className="flex flex-wrap items-center gap-4 text-white/90 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>{club.memberCount} members</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      <span>{club.postCount} posts</span>
                    </div>
                  </div>
                ) : null}
                {isInvited ? (
                  <div className="mt-3 text-xs text-white/80 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    You are invited to this club
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {isPrivateInvitePreview ? (
          <Card className="border border-primary/10 shadow-sm gap-0">
            <CardContent className="px-5 py-4 !pb-4 md:px-6 md:py-4">
              <p className="text-gray-700 leading-relaxed">
                This is a restricted club. Join to view posts and member information.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {!isPrivateInvitePreview ? (
        <Tabs defaultValue="feed" className="space-y-6">
          <TabsList className={`grid w-full ${canShowRequestsTab ? 'grid-cols-3' : 'grid-cols-2'} bg-white shadow-sm border border-gray-200`}>
            <TabsTrigger value="feed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Feed
            </TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Members
            </TabsTrigger>
            {canShowRequestsTab ? (
              <TabsTrigger value="requests" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
                Requests
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="feed" className="space-y-6">
            {club.permissions?.canCreatePosts ? (
              <Card className="border border-primary/10 shadow-sm">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-gray-900">Share with the community</h3>
                    <Button onClick={() => setIsCreatePostOpen(true)} className="bg-gradient-to-r from-primary to-secondary" disabled={isPosting}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Post
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="space-y-4">
              {posts.map((post) => (
                <OpportunityCard
                  key={post.id}
                  opportunity={post}
                  currentUserId={currentUserId}
                  onLike={() => {}}
                  onSave={() => {}}
                  onComment={() => {}}
                  onViewProfile={onViewProfile}
                />
              ))}
              {posts.length === 0 ? <p className="text-sm text-gray-500">No club posts yet.</p> : null}
            </div>
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            {club.privacy === 'private' && canInviteMembers ? (
              <Card className="border border-primary/10 shadow-sm">
                <CardContent className="p-4 md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-gray-900">Invite Members</p>
                      <p className="text-sm text-gray-600">Invite-only club: add members directly.</p>
                    </div>
                    <Button onClick={() => setIsInviteOpen(true)} className="bg-gradient-to-r from-primary to-secondary">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Invite
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeMembers.map((member) => {
                const profile = memberLookup.get(member.userId);
                return (
                  <Card key={member.clubMembershipId} className="border border-primary/10 shadow-sm hover:shadow-lg transition-all duration-300">
                    <CardContent className="p-4 md:p-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="w-14 h-14 ring-2 ring-primary/20">
                          <AvatarImage src={profile?.avatar ?? member.profilePictureUrl ?? undefined} />
                          <AvatarFallback>{member.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">{profile?.name ?? member.username}</p>
                            <Badge className="bg-primary/10 text-primary text-xs capitalize">{member.role}</Badge>
                            {member.role === 'owner' ? <Crown className="w-4 h-4 text-amber-500" /> : null}
                          </div>
                          <p className="text-sm text-gray-600">{profile?.branch ?? 'Unknown branch'}</p>
                        </div>
                        <div className="flex gap-2">
                          {canModerateMembers && membershipRole === 'owner' && member.role !== 'owner' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="hover:bg-primary/5"
                              onClick={() => void handleToggleAdminRole(member)}
                              disabled={busyMemberId === member.userId}
                            >
                              <ShieldCheck className="w-4 h-4 mr-1" />
                              {member.role === 'admin' ? 'Demote' : 'Make Admin'}
                            </Button>
                          ) : null}
                          <Button variant="outline" size="sm" className="hover:bg-primary/5" onClick={() => onViewProfile?.(member.userId)}>
                            View Profile
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {canModerateMembers && invitedMembers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Invited (not joined yet)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {invitedMembers.map((member) => (
                    <Card key={member.clubMembershipId} className="border border-primary/10 shadow-sm">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={member.profilePictureUrl ?? undefined} />
                            <AvatarFallback>{member.username[0]}</AvatarFallback>
                          </Avatar>
                          <p className="text-sm text-gray-900 truncate">{member.username}</p>
                        </div>
                        <Badge variant="outline">Invited</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>

          {canShowRequestsTab ? (
            <TabsContent value="requests" className="space-y-4">
              {pendingMembers.length === 0 ? <p className="text-sm text-gray-500">No pending requests.</p> : null}
              {pendingMembers.map((member) => (
                <Card key={member.clubMembershipId} className="border border-primary/10 shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{member.username}</p>
                      <p className="text-xs text-gray-500">Requested to join</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="bg-gradient-to-r from-primary to-secondary"
                        onClick={() => void handleApproveRequest(member.userId)}
                        disabled={busyMemberId === member.userId}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => void handleRejectRequest(member.userId)}
                        disabled={busyMemberId === member.userId}
                      >
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          ) : null}

        </Tabs>
        ) : null}
        <Dialog open={isInviteOpen} onOpenChange={(next) => !inviteBusyUserId && setIsInviteOpen(next)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto max-w-[95vw]">
            <DialogHeader>
              <DialogTitle>Invite Members</DialogTitle>
              <DialogDescription>
                Connected users are shown first, then other users. Search finds users from the database.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={inviteSearch}
                  onChange={(event) => setInviteSearch(event.target.value)}
                  placeholder="Search users by name or email"
                  className="pl-11"
                />
              </div>

              {isSearchingInviteUsers ? (
                <LoadingIndicator label="Searching users..." size={20} className="justify-start" />
              ) : null}

              {inviteCandidates.connected.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Connected users</p>
                  <div className="space-y-2">
                    {inviteCandidates.connected.map((user) => (
                      <Card key={user.userId} className="border border-primary/10">
                        <CardContent className="p-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={user.profilePictureUrl ?? undefined} />
                              <AvatarFallback>{user.username[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 truncate">{user.username}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {user.branch ?? 'Unknown branch'}{user.year ? ` · Year ${user.year}` : ''}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            className="bg-gradient-to-r from-primary to-secondary"
                            onClick={() => void handleInviteMember(user.userId)}
                            disabled={inviteBusyUserId === user.userId}
                          >
                            {inviteBusyUserId === user.userId ? 'Inviting...' : 'Invite'}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}

              {inviteCandidates.others.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Other users</p>
                  <div className="space-y-2">
                    {inviteCandidates.others.map((user) => (
                      <Card key={user.userId} className="border border-primary/10">
                        <CardContent className="p-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="w-10 h-10">
                              <AvatarImage src={user.profilePictureUrl ?? undefined} />
                              <AvatarFallback>{user.username[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-900 truncate">{user.username}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {user.branch ?? 'Unknown branch'}{user.year ? ` · Year ${user.year}` : ''}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleInviteMember(user.userId)}
                            disabled={inviteBusyUserId === user.userId}
                          >
                            {inviteBusyUserId === user.userId ? 'Inviting...' : 'Invite'}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : null}

              {!isSearchingInviteUsers && inviteCandidates.connected.length === 0 && inviteCandidates.others.length === 0 ? (
                <p className="text-sm text-gray-500">No users available to invite.</p>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
        {canManageClub ? (
          <Dialog open={isSettingsOpen} onOpenChange={(nextOpen) => !isSavingSettings && setIsSettingsOpen(nextOpen)}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto max-w-[95vw]">
              <DialogHeader>
                <DialogTitle>Club Settings</DialogTitle>
                <DialogDescription>
                  Update this club using the same layout as the club creation form.
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-5" onSubmit={handleSaveSettings}>
                <div className="space-y-2">
                  <Label>Club Name *</Label>
                  <Input
                    value={settingsForm.name}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, name: event.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Privacy *</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'open', label: 'Open' },
                      { value: 'request', label: 'Request' },
                      { value: 'private', label: 'Private' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSettingsForm((current) => ({ ...current, privacy: option.value as Club['privacy'] }))}
                        className={`p-3 rounded-xl border-2 transition-all text-sm ${
                          settingsForm.privacy === option.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Primary Category *</Label>
                  <Input
                    value={settingsForm.primaryCategory}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, primaryCategory: event.target.value }))}
                    placeholder="e.g. Sports"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Textarea
                    rows={4}
                    value={settingsForm.description}
                    onChange={(event) => setSettingsForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Describe what your club is about, goals, and activities..."
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <ClubLogoUpload
                      label="Club Logo (optional)"
                      file={settingsAvatarFile}
                      onFileChange={(file) => {
                        setSettingsAvatarFile(file);
                        if (file) {
                          setRemoveAvatar(false);
                        }
                      }}
                      disabled={isSavingSettings}
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={removeAvatar}
                        onChange={(event) => {
                          setRemoveAvatar(event.target.checked);
                          if (event.target.checked) {
                            setSettingsAvatarFile(null);
                          }
                        }}
                      />
                      Remove existing logo
                    </label>
                  </div>

                  <div className="space-y-2">
                    <ImageUpload
                      onFileChange={(file) => {
                        setSettingsCoverImageFile(file);
                        if (file) {
                          setRemoveCoverImage(false);
                        }
                      }}
                      disabled={isSavingSettings}
                      label="Club Background Image (optional)"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={removeCoverImage}
                        onChange={(event) => {
                          setRemoveCoverImage(event.target.checked);
                          if (event.target.checked) {
                            setSettingsCoverImageFile(null);
                          }
                        }}
                      />
                      Remove existing background image
                    </label>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="destructive" onClick={handleDeleteClub} disabled={isDeletingClub || isSavingSettings}>
                    {isDeletingClub ? 'Deleting...' : 'Delete Club'}
                  </Button>
                  <Button type="submit" className="ml-auto bg-gradient-to-r from-primary to-secondary" disabled={isSavingSettings || isDeletingClub}>
                    {isSavingSettings ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
        <CreateUnifiedPostModal
          isOpen={isCreatePostOpen}
          onClose={() => setIsCreatePostOpen(false)}
          onCreatePost={handleCreateClubPostFromModal}
          onCreateEvent={() => {}}
          onCreateOpportunity={() => {}}
          currentUser={auth.currentUser}
          initialTab="post"
          postOnly
        />
      </div>
    </div>
  );
}
