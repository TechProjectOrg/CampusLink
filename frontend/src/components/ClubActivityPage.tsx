import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crown, Lock, Settings, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { userPostToOpportunity } from '../context/AppDataContext';
import { apiCreateUserPost } from '../lib/postsApi';
import {
  apiApproveClubMember,
  apiDeleteClub,
  apiFetchClub,
  apiFetchClubMembers,
  apiFetchClubPosts,
  apiRemoveClubMember,
  apiUpdateClub,
  apiUpdateClubMemberRole,
  type ClubMember,
} from '../lib/clubsApi';
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

interface ClubActivityPageProps {
  clubSlug: string;
  students: Student[];
  currentUserId: string;
  onBack: () => void;
  onViewProfile?: (studentId: string) => void;
}

export function ClubActivityPage({ clubSlug, students, currentUserId, onBack, onViewProfile }: ClubActivityPageProps) {
  const auth = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [posts, setPosts] = useState<ReturnType<typeof userPostToOpportunity>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [postText, setPostText] = useState('');
  const [postTags, setPostTags] = useState<string[]>([]);
  const [postTagInput, setPostTagInput] = useState('');
  const [postImageFile, setPostImageFile] = useState<File | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDeletingClub, setIsDeletingClub] = useState(false);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [settingsAvatarFile, setSettingsAvatarFile] = useState<File | null>(null);
  const [settingsCoverImageFile, setSettingsCoverImageFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeCoverImage, setRemoveCoverImage] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    name: '',
    shortDescription: '',
    description: '',
    privacy: 'open' as Club['privacy'],
    primaryCategory: '',
    tagsText: '',
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
      shortDescription: clubValue.shortDescription ?? '',
      description: clubValue.description ?? '',
      privacy: clubValue.privacy,
      primaryCategory: clubValue.primaryCategory?.displayName ?? '',
      tagsText: clubValue.tags.join(', '),
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

  const addPostTag = () => {
    const nextTag = postTagInput.trim().replace(/^#+/, '');
    if (!nextTag || postTags.includes(nextTag)) return;
    setPostTags((current) => [...current, nextTag]);
    setPostTagInput('');
  };

  const handleCreateClubPost = async () => {
    if (!club || !postText.trim()) return;
    setIsPosting(true);
    try {
      const created = await apiCreateUserPost(
        currentUserId,
        {
          postType: 'club_activity',
          visibility: 'club_members',
          clubId: club.id,
          contentText: postText.trim(),
          hashtags: postTags,
        },
        auth.session?.token,
        postImageFile ? [postImageFile] : undefined,
      );
      setPosts((current) => [userPostToOpportunity(created, {}, auth.currentUser ?? null), ...current]);
      setPostText('');
      setPostTags([]);
      setPostTagInput('');
      setPostImageFile(null);
      toast.success('Club post published');
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
      const tags = settingsForm.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const updated = await apiUpdateClub(
        club.id,
        {
          name: settingsForm.name.trim(),
          shortDescription: settingsForm.shortDescription.trim(),
          description: settingsForm.description.trim(),
          privacy: settingsForm.privacy,
          primaryCategory: settingsForm.primaryCategory.trim(),
          tags,
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
  const canModerateMembers = Boolean(club.permissions?.canModerateMembers);
  const membershipRole = club.permissions?.membershipRole;
  const pendingMembers = members.filter((member) => member.status === 'pending');
  const activeMembers = members.filter((member) => member.status === 'active');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <div className="animate-slide-in-down">
          <Button variant="ghost" onClick={onBack} className="mb-4 hover:bg-white/50 transition-all">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Clubs
          </Button>

          <Card className="overflow-hidden border-0 shadow-xl">
            <div className="relative h-48 md:h-64 bg-gradient-to-r from-blue-500 to-purple-600">
              <ImageWithFallback
                src={club.coverImageUrl ?? club.avatarUrl ?? undefined}
                alt={club.name}
                className="w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full border border-white/40 bg-white/15 overflow-hidden shrink-0">
                    <ImageWithFallback
                      src={club.avatarUrl ?? club.coverImageUrl ?? undefined}
                      alt={`${club.name} logo`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-white truncate">{club.name}</h1>
                    <Badge className="mt-1 bg-white/15 text-white border-white/20">Sports</Badge>
                  </div>
                  {club.privacy === 'private' ? <Lock className="w-4 h-4 text-white shrink-0" /> : null}
                </div>
                <p className="text-white/90 text-sm md:text-base mb-4">{club.shortDescription ?? club.description}</p>
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
              </div>
            </div>
          </Card>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Tabs defaultValue="feed" className="space-y-6">
          <TabsList className={`grid w-full ${canManageClub ? 'grid-cols-4' : 'grid-cols-2'} bg-white shadow-sm border border-gray-200`}>
            <TabsTrigger value="feed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Feed
            </TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Members
            </TabsTrigger>
            {canManageClub ? (
              <TabsTrigger value="requests" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
                Requests
              </TabsTrigger>
            ) : null}
            {canManageClub ? (
              <TabsTrigger value="settings" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="feed" className="space-y-6">
            {club.permissions?.canCreatePosts ? (
              <Card className="border border-primary/10 shadow-sm">
                <CardContent className="p-4 md:p-6 space-y-4">
                  <h3 className="text-gray-900">Share with the community</h3>
                  <Textarea
                    placeholder="What's happening in the club?"
                    value={postText}
                    onChange={(event) => setPostText(event.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <ImageUpload onFileChange={setPostImageFile} disabled={isPosting} label="Post Image (optional)" />
                  <div className="space-y-2">
                    <Label>Hashtags (optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        value={postTagInput}
                        onChange={(event) => setPostTagInput(event.target.value)}
                        placeholder="Add tags and press Enter"
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addPostTag();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addPostTag}>
                        Add
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {postTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-2">
                          #{tag}
                          <button
                            type="button"
                            onClick={() => setPostTags((current) => current.filter((value) => value !== tag))}
                          >
                            x
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleCreateClubPost} disabled={isPosting || !postText.trim()} className="bg-gradient-to-r from-primary to-secondary">
                      {isPosting ? 'Posting...' : 'Post'}
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
          </TabsContent>

          {canManageClub ? (
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

          {canManageClub ? (
            <TabsContent value="settings" className="space-y-4">
              <Card className="border border-primary/10 shadow-sm">
                <CardContent className="p-4 md:p-6">
                  <form className="space-y-4" onSubmit={handleSaveSettings}>
                    <h3 className="text-gray-900">Club Settings</h3>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Club Name</Label>
                        <Input
                          value={settingsForm.name}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, name: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Primary Category</Label>
                        <Input
                          value={settingsForm.primaryCategory}
                          onChange={(event) => setSettingsForm((current) => ({ ...current, primaryCategory: event.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Short Description</Label>
                      <Input
                        value={settingsForm.shortDescription}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, shortDescription: event.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>About</Label>
                      <Textarea
                        rows={4}
                        value={settingsForm.description}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, description: event.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Tags (comma separated)</Label>
                      <Input
                        value={settingsForm.tagsText}
                        onChange={(event) => setSettingsForm((current) => ({ ...current, tagsText: event.target.value }))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Membership Permission</Label>
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
                            className={`p-2 rounded-xl border-2 transition-all text-sm ${
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

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                          <p className="text-xs text-gray-500 mb-2">Current logo</p>
                          {club.avatarUrl ? (
                            <img src={club.avatarUrl} alt="Current club logo" className="h-16 w-16 rounded-lg object-cover" />
                          ) : (
                            <p className="text-xs text-gray-400">No logo uploaded</p>
                          )}
                        </div>
                        <ClubLogoUpload
                          label="Update Club Logo"
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
                        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50">
                          <p className="text-xs text-gray-500 mb-2">Current background image</p>
                          {club.coverImageUrl ? (
                            <img src={club.coverImageUrl} alt="Current club cover" className="h-16 w-full rounded-lg object-cover" />
                          ) : (
                            <p className="text-xs text-gray-400">No background uploaded</p>
                          )}
                        </div>
                        <ImageUpload
                          onFileChange={(file) => {
                            setSettingsCoverImageFile(file);
                            if (file) {
                              setRemoveCoverImage(false);
                            }
                          }}
                          disabled={isSavingSettings}
                          label="Update Background Image"
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

                    <div className="flex flex-wrap justify-between gap-2 pt-2">
                      <Button type="button" variant="destructive" onClick={handleDeleteClub} disabled={isDeletingClub || isSavingSettings}>
                        {isDeletingClub ? 'Deleting...' : 'Delete Club'}
                      </Button>
                      <Button type="submit" className="bg-gradient-to-r from-primary to-secondary" disabled={isSavingSettings || isDeletingClub}>
                        {isSavingSettings ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </div>
  );
}
