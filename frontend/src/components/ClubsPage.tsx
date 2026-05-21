import { useEffect, useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Club, Student } from '../types';
import { apiFetchClubs, apiJoinClub } from '../lib/clubsApi';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { CreateClubModal } from './CreateClubModal';
import { ClubActivityPage } from './ClubActivityPage';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { cacheClubsList, readCachedClubsList } from '../cache/socialCache';
import { cacheKeys } from '../cache/keys';
import { PageLayout } from './PageLayout';

interface ClubsPageProps {
  clubs?: Club[];
  students: Student[];
  currentUserId: string;
  initialClubSlug?: string | null;
  onJoinClub?: (clubId: string) => void;
  onLeaveClub?: (clubId: string) => void;
  onCreateClub?: (club: Club) => void;
  onViewProfile?: (studentId: string) => void;
}

export function ClubsPage({ students, currentUserId, initialClubSlug = null, onCreateClub, onViewProfile }: ClubsPageProps) {
  const EXPLORE_CLUBS_LIMIT = 6;
  const auth = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedClubSlug, setSelectedClubSlug] = useState<string | null>(null);

  useEffect(() => {
    if (initialClubSlug?.trim()) {
      setSelectedClubSlug(initialClubSlug.trim());
    }
  }, [initialClubSlug]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    void (async () => {
      const key = cacheKeys.list.clubs();
      const cached = await readCachedClubsList(key);
      if (isMounted && cached.length > 0) {
        setClubs(cached);
      }

      try {
        const items = await apiFetchClubs(auth.session?.token, { limit: 50 });
        await cacheClubsList(key, items);
        if (isMounted) {
          setClubs(items);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load clubs');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [auth.session?.token]);

  const handleClubCreate = (club: Club) => {
    setClubs((current) => {
      const next = [club, ...current];
      void cacheClubsList(cacheKeys.list.clubs(), next);
      return next;
    });
    onCreateClub?.(club);
  };

  const handleJoinClub = async (club: Club) => {
    try {
      const updated = await apiJoinClub(club.id, auth.session?.token);
      setClubs((current) => {
        const next = current.map((item) => (item.id === updated.id ? updated : item));
        void cacheClubsList(cacheKeys.list.clubs(), next);
        return next;
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to join club');
    }
  };

  const joinedClubs = clubs.filter((club) => club.membership?.status === 'active');
  const exploreClubs = clubs
    .filter((club) => club.membership?.status !== 'active')
    .slice(0, EXPLORE_CLUBS_LIMIT);

  const renderClubCard = (club: Club) => {
    const membershipStatus = club.membership?.status ?? null;
    const isMember = membershipStatus === 'active';
    const isPending = membershipStatus === 'pending' || membershipStatus === 'invited';

    return (
      <Card
        key={club.id}
        className="overflow-hidden hover-lift transition-all duration-300 shadow-sm hover:shadow-xl border border-primary/10 cursor-pointer"
        onClick={() => setSelectedClubSlug(club.slug)}
      >
        <div className="relative h-32 md:h-40 bg-gradient-to-r from-blue-500 to-purple-600">
          {club.coverImageUrl || club.avatarUrl ? (
            <ImageWithFallback
              src={club.coverImageUrl ?? club.avatarUrl ?? undefined}
              alt={club.name}
              className="w-full h-full object-cover opacity-60"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-3 md:bottom-4 left-3 md:left-4 right-3 md:right-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-white/40 bg-white/15 overflow-hidden shrink-0">
                {club.avatarUrl || club.coverImageUrl ? (
                  <ImageWithFallback
                    src={club.avatarUrl ?? club.coverImageUrl ?? undefined}
                    alt={`${club.name} logo`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    {club.name.trim().charAt(0).toUpperCase() || 'C'}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-white text-lg md:text-xl truncate">{club.name}</h2>
                <Badge className="mt-1 bg-white/15 text-white border-white/20">
                  {club.primaryCategory?.displayName ?? 'Club'}
                </Badge>
              </div>
              {club.privacy === 'private' ? <Lock className="w-4 h-4 text-white shrink-0" /> : null}
            </div>
          </div>
        </div>

        <CardContent className="p-4 md:p-6 space-y-3 md:space-y-4">
          <p className="text-gray-600 text-sm md:text-base line-clamp-3">
            {club.description ?? club.shortDescription ?? 'No description yet.'}
          </p>

          <div className="flex items-center gap-3 md:gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1 md:gap-1.5">
              <Users className="w-4 h-4 text-primary" />
              <span>{club.memberCount} members</span>
            </div>
            <div className="flex items-center gap-1 md:gap-1.5">
              <span>{club.postCount} posts</span>
            </div>
          </div>

          {isMember ? (
            <Button
              onClick={(event) => {
                event.stopPropagation();
                setSelectedClubSlug(club.slug);
              }}
              variant="outline"
              className="w-full mt-2 hover:bg-primary/5 hover:border-primary/30 transition-all"
            >
              Open Club
            </Button>
          ) : (
            <Button
              onClick={(event) => {
                event.stopPropagation();
                void handleJoinClub(club);
              }}
              disabled={isPending}
              className="w-full mt-2 bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all duration-300 hover:scale-105"
            >
              {isPending ? (membershipStatus === 'invited' ? 'Invited' : 'Request Pending') : club.privacy === 'request' ? 'Request to Join' : 'Join Club'}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  if (selectedClubSlug) {
    return (
      <ClubActivityPage
        clubSlug={selectedClubSlug}
        students={students}
        currentUserId={currentUserId}
        onBack={() => setSelectedClubSlug(null)}
        onViewProfile={onViewProfile}
      />
    );
  }

  if (isLoading) {
    return (
      <PageLayout
        maxWidth="6xl"
        className="cl-clubs-page h-full min-h-0"
        contentClassName="cl-clubs-content flex h-full min-h-0 items-center justify-center px-4 md:px-6"
      >
        <LoadingIndicator
          label="Loading..."
          size={110}
          className="flex-col gap-4 text-2xl text-gray-600"
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      maxWidth="6xl"
      className="cl-clubs-page"
      contentClassName="cl-clubs-content px-4 py-6 md:px-6 md:py-8 space-y-6 md:space-y-8"
    >
        <div className="animate-slide-in-down flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-3">
          <div className="cl-clubs-mobile-header">
            <h1 className="text-3xl md:text-4xl text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Campus Clubs</h1>
            <p className="text-gray-600 mt-2 text-sm md:text-base">Join clubs and groups to connect with like-minded peers.</p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)} className="w-full md:w-auto h-12 md:h-10 text-base md:text-sm mt-2 md:mt-0 rounded-xl md:rounded-md bg-gradient-to-r from-primary to-secondary hover:shadow-xl transition-all duration-300 shrink-0">
            <Users className="w-5 h-5 md:w-4 md:h-4 mr-2" />
            Create Club
          </Button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {clubs.length === 0 ? (
          <p className="text-sm text-gray-600">No clubs found.</p>
        ) : (
          <div className="space-y-8">
            <section className="cl-clubs-mobile-joined-section space-y-4 animate-slide-in-up">
              <div className="space-y-1">
                <h2 className="text-xl md:text-2xl text-gray-900">Joined Clubs</h2>
                <p className="text-sm text-gray-600">Your active club memberships appear here first.</p>
              </div>
              {joinedClubs.length === 0 ? (
                <p className="text-sm text-gray-600">You haven’t joined any clubs yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {joinedClubs.map(renderClubCard)}
                </div>
              )}
            </section>

            <div className="border-t border-primary/10" />

            <section className="space-y-4 animate-slide-in-up">
              <div className="space-y-1">
                <h2 className="text-xl md:text-2xl text-gray-900">Explore Clubs</h2>
                <p className="text-sm text-gray-600">A few clubs you can discover next.</p>
              </div>
              {exploreClubs.length === 0 ? (
                <p className="text-sm text-gray-600">No more clubs to explore right now.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                  {exploreClubs.map(renderClubCard)}
                </div>
              )}
            </section>
          </div>
        )}

        <CreateClubModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateClub={handleClubCreate}
        />
    </PageLayout>
  );
}
