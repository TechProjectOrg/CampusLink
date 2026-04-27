import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Lock, TrendingUp, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userPostToOpportunity } from '../context/AppDataContext';
import { apiCreateUserPost } from '../lib/postsApi';
import { apiFetchClub, apiFetchClubMembers, apiFetchClubPosts, type ClubMember } from '../lib/clubsApi';
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
  const [newPost, setNewPost] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    apiFetchClub(clubSlug, auth.session?.token)
      .then(async (clubValue) => {
        const [memberRows, postRows] = await Promise.all([
          apiFetchClubMembers(clubValue.id, auth.session?.token, 50, 0).catch(() => []),
          apiFetchClubPosts(clubValue.id, auth.session?.token, 25, 0).catch(() => []),
        ]);
        if (!isMounted) return;
        setClub(clubValue);
        setMembers(memberRows);
        setPosts(postRows.map((post) => userPostToOpportunity(post, {}, auth.currentUser ?? null)));
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

  const handleCreateClubPost = async () => {
    if (!club || !newPost.trim()) return;
    setIsPosting(true);
    try {
      const created = await apiCreateUserPost(
        currentUserId,
        {
          postType: 'club_activity',
          visibility: 'club_members',
          clubId: club.id,
          contentText: newPost.trim(),
        },
        auth.session?.token,
      );
      setPosts((current) => [userPostToOpportunity(created, {}, auth.currentUser ?? null), ...current]);
      setNewPost('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish club post');
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) {
    return <LoadingState type="page" />;
  }

  if (!club) {
    return <p className="p-6 text-red-600">{error ?? 'Club not found.'}</p>;
  }

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
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-white/15 text-white border-white/20">{club.primaryCategory?.displayName ?? 'Club'}</Badge>
                  {club.privacy === 'private' ? <Lock className="w-4 h-4 text-white" /> : null}
                </div>
                <h1 className="text-white mb-2">{club.name}</h1>
                <p className="text-white/90 text-sm md:text-base mb-4">{club.description ?? club.shortDescription}</p>
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
          <TabsList className="grid w-full grid-cols-2 bg-white shadow-sm border border-gray-200">
            <TabsTrigger value="feed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Feed
            </TabsTrigger>
            <TabsTrigger value="members" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-secondary data-[state=active]:text-white">
              Members
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-6">
            {club.permissions?.canCreatePosts ? (
              <Card className="border border-primary/10 shadow-sm">
                <CardContent className="p-4 md:p-6 space-y-4">
                  <h3 className="text-gray-900">Share with the community</h3>
                  <Textarea
                    placeholder="What's happening in the club?"
                    value={newPost}
                    onChange={(event) => setNewPost(event.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleCreateClubPost} disabled={isPosting || !newPost.trim()} className="bg-gradient-to-r from-primary to-secondary">
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
              {members.map((member) => {
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
                          </div>
                          <p className="text-sm text-gray-600">{profile?.branch ?? 'Unknown branch'}</p>
                        </div>
                        <Button variant="outline" size="sm" className="hover:bg-primary/5" onClick={() => onViewProfile?.(member.userId)}>
                          View Profile
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
