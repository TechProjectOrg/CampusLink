import { useEffect, useState } from 'react';
import { Lock, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Club, Student } from '../types';
import { apiFetchClubs, apiJoinClub } from '../lib/clubsApi';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { CreateClubModal } from './CreateClubModal';
import { ClubActivityPage } from './ClubActivityPage';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface ClubsPageProps {
  clubs?: Club[];
  students: Student[];
  currentUserId: string;
  onJoinClub?: (clubId: string) => void;
  onLeaveClub?: (clubId: string) => void;
  onCreateClub?: (club: Club) => void;
  onViewProfile?: (studentId: string) => void;
}

export function ClubsPage({ students, currentUserId, onCreateClub, onViewProfile }: ClubsPageProps) {
  const auth = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedClubSlug, setSelectedClubSlug] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    apiFetchClubs(auth.session?.token)
      .then((items) => {
        if (isMounted) {
          setClubs(items);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unable to load clubs');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [auth.session?.token]);

  const handleClubCreate = (club: Club) => {
    setClubs((current) => [club, ...current]);
    onCreateClub?.(club);
  };

  const handleJoinClub = async (club: Club) => {
    try {
      const updated = await apiJoinClub(club.id, auth.session?.token);
      setClubs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to join club');
    }
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">Campus Clubs</h1>
          <p className="text-gray-600">Join clubs and groups to connect with like-minded peers.</p>
        </div>

        <Card className="border-2 border-dashed border-primary/20 hover:border-primary/40 transition-all duration-300 hover-lift bg-gradient-to-br from-white to-blue-50/30 animate-slide-in-up">
          <CardContent className="p-6 md:p-8 lg:p-10">
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-8 h-8 md:w-10 md:h-10 text-primary" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-gray-900 mb-2 text-xl md:text-2xl">Start Your Own Club</h3>
                <p className="text-gray-600 text-sm md:text-base">
                  Create a discoverable community with real membership, posts, and moderation controls.
                </p>
              </div>
              <Button onClick={() => setIsCreateModalOpen(true)} className="bg-gradient-to-r from-primary to-secondary hover:shadow-xl transition-all duration-300 hover:scale-105 flex-shrink-0">
                <Users className="w-4 h-4 mr-2" />
                Create New Club
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? <LoadingState type="page" /> : null}
        {!isLoading && error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!isLoading && clubs.length === 0 ? (
          <EmptyState type="clubs" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 animate-slide-in-up">
            {clubs.map((club) => {
              const membershipStatus = club.membership?.status ?? null;
              const isMember = membershipStatus === 'active';
              const isPending = membershipStatus === 'pending' || membershipStatus === 'invited';

              return (
                <Card key={club.id} className="overflow-hidden hover-lift transition-all duration-300 shadow-sm hover:shadow-xl border border-primary/10">
                  <div className="relative h-32 md:h-40 bg-gradient-to-r from-blue-500 to-purple-600">
                    <ImageWithFallback
                      src={club.coverImageUrl ?? club.avatarUrl ?? undefined}
                      alt={club.name}
                      className="w-full h-full object-cover opacity-60"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-3 md:bottom-4 left-3 md:left-4 right-3 md:right-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border border-white/40 bg-white/15 overflow-hidden shrink-0">
                          <ImageWithFallback
                            src={club.avatarUrl ?? club.coverImageUrl ?? undefined}
                            alt={`${club.name} logo`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-white text-lg md:text-xl truncate">{club.name}</h2>
                          <Badge className="mt-1 bg-white/15 text-white border-white/20">Sports</Badge>
                        </div>
                        {club.privacy === 'private' ? <Lock className="w-4 h-4 text-white shrink-0" /> : null}
                      </div>
                    </div>
                  </div>

                  <CardContent className="p-4 md:p-6 space-y-3 md:space-y-4">
                    <p className="text-gray-600 text-sm md:text-base line-clamp-3">{club.description ?? club.shortDescription ?? 'No description yet.'}</p>

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
                        onClick={() => setSelectedClubSlug(club.slug)}
                        variant="outline"
                        className="w-full mt-2 hover:bg-primary/5 hover:border-primary/30 transition-all"
                      >
                        Open Club
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleJoinClub(club)}
                        disabled={isPending}
                        className="w-full mt-2 bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all duration-300 hover:scale-105"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        {isPending ? (membershipStatus === 'invited' ? 'Invited' : 'Request Pending') : club.privacy === 'request' ? 'Request to Join' : 'Join Club'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <CreateClubModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateClub={handleClubCreate}
        />
      </div>
    </div>
  );
}
