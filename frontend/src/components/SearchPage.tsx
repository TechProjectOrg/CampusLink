import { useEffect, useMemo, useState } from 'react';
import { Search, Hash, Users } from 'lucide-react';
import type { Student } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { useAuth } from '../context/AuthContext';
import { apiSearchAll, type SearchClubResult, type SearchHashtagResult, type SearchUserResult } from '../lib/networkApi';
import { fetchCachedValue } from '../cache/socialCache';
import { cacheKeys } from '../cache/keys';
import { cachePolicies } from '../cache/policies';

interface SearchPageProps {
  students: Student[];
  currentUserId: string;
  followGraph: FollowGraph;
  suggestedUserIds?: string[];
  onFollow: (targetUserId: string, accountType?: 'public' | 'private') => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;
  onViewProfile: (studentId: string) => void;
  onSelectHashtag: (hashtag: string) => void;
  initialSearchQuery?: string;
}

function searchResultToStudent(r: SearchUserResult): Student {
  const seed = encodeURIComponent(r.username);
  return {
    id: r.userId,
    name: r.displayName,
    displayName: r.displayName,
    username: r.username,
    email: r.email,
    branch: r.branch ?? 'Unknown',
    year: r.year ?? 0,
    avatar: r.profilePictureUrl || undefined,
    bio: '',
    skills: [],
    interests: [],
    certifications: [],
    experience: [],
    societies: [],
    achievements: [],
    projects: [],
    accountType: r.isPrivate ? 'private' : 'public',
  };
}

export function SearchPage({
  students,
  currentUserId,
  followGraph,
  suggestedUserIds = [],
  onFollow,
  onUnfollow,
  onCancelRequest,
  onViewProfile,
  onSelectHashtag,
  initialSearchQuery = '',
}: SearchPageProps) {
  const auth = useAuth();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [hashtagResults, setHashtagResults] = useState<SearchHashtagResult[]>([]);
  const [clubResults, setClubResults] = useState<SearchClubResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const currentUser = students.find((student) => student.id === currentUserId);

  const suggestedUsers = useMemo(() => {
    if (!currentUser) return [];

    if (suggestedUserIds.length > 0) {
      const fromApi = suggestedUserIds
        .map((id) => students.find((s) => s.id === id))
        .filter((s): s is Student => Boolean(s))
        .filter((s) => {
          if (s.id === currentUserId) return false;
          const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(s.id);
          const isRequested = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(s.id);
          return !isFollowing && !isRequested;
        })
        .map((student) => {
          const sharedSkills = student.skills.filter((skill) => currentUser.skills.includes(skill));
          const sharedInterests = student.interests.filter((interest) => currentUser.interests.includes(interest));
          return {
            student,
            sharedSkills,
            sharedInterests,
            branchMatch: student.branch === currentUser.branch,
            yearMatch: student.year === currentUser.year,
            score: 0,
            createdAtMs: 0,
          };
        });

      if (fromApi.length > 0) return fromApi.slice(0, 6);
    }

    return students
      .filter((student) => {
        if (student.id === currentUserId) return false;
        const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(student.id);
        const isRequested = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id);
        return !isFollowing && !isRequested;
      })
      .map((student) => {
        const sharedSkills = student.skills.filter((skill) => currentUser.skills.includes(skill));
        const sharedInterests = student.interests.filter((interest) => currentUser.interests.includes(interest));
        const branchMatch = student.branch === currentUser.branch;
        const yearMatch = student.year === currentUser.year;
        const score = (branchMatch ? 4 : 0)
          + (yearMatch ? 2 : 0)
          + sharedSkills.length * 2
          + sharedInterests.length;
        const createdAtMs = student.createdAt ? Date.parse(student.createdAt) : Number.NaN;

        return {
          student,
          sharedSkills,
          sharedInterests,
          branchMatch,
          yearMatch,
          score,
          createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        };
      })
      .sort((left, right) => {
        if (right.branchMatch !== left.branchMatch) return Number(right.branchMatch) - Number(left.branchMatch);
        if (right.yearMatch !== left.yearMatch) return Number(right.yearMatch) - Number(left.yearMatch);
        if (right.score !== left.score) return right.score - left.score;
        if (right.createdAtMs !== left.createdAtMs) return right.createdAtMs - left.createdAtMs;
        return left.student.name.localeCompare(right.student.name);
      })
      .slice(0, 6);
  }, [currentUser, currentUserId, followGraph.followingByUserId, followGraph.outgoingRequestsByUserId, students, suggestedUserIds]);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHashtagResults([]);
      setClubResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    const timerId = setTimeout(async () => {
      if (!isActive) return;
      setIsLoading(true);
      setHasSearched(true);
      try {
        const trimmedQuery = searchQuery.trim();
        const result = await fetchCachedValue({
          key: cacheKeys.page.searchAll(trimmedQuery, 0, 0, 0),
          policy: cachePolicies.search,
          fetcher: () => apiSearchAll(trimmedQuery, auth.session?.token, 50, 25),
          onCached: (cachedResult) => {
            if (!isActive) return;
            setSearchResults(cachedResult.users.map(searchResultToStudent));
            setHashtagResults(cachedResult.hashtags);
            setClubResults(cachedResult.clubs ?? []);
          },
        });
        if (!isActive) return;
        setSearchResults(result.users.map(searchResultToStudent));
        setHashtagResults(result.hashtags);
        setClubResults(result.clubs ?? []);
      } catch (err) {
        if (!isActive) return;
        console.error('Search failed:', err);
        setSearchResults([]);
        setHashtagResults([]);
        setClubResults([]);
      } finally {
        if (!isActive) return;
        setIsLoading(false);
      }
    }, 350);

    return () => {
      isActive = false;
      clearTimeout(timerId);
    };
  }, [searchQuery, auth.session?.token]);

  const filteredStudents = searchResults;
  const handleSuggestedCardClick = (studentId: string) => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
      onViewProfile(studentId);
    }
  };
  const handleSearchResultCardClick = (studentId: string) => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches) {
      onViewProfile(studentId);
    }
  };

  return (
    <div className="cl-search-page min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="cl-search-content max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="hidden lg:block animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Search
          </h1>
          <p className="text-gray-600">Find users and hashtags in one place</p>
        </div>

        {hashtagResults.length > 0 && (
          <Card className="border-primary/10 shadow-lg rounded-2xl animate-slide-in-up">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Hash className="w-5 h-5 text-primary" />
                <span className="text-gray-900">Hashtags</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {hashtagResults.map((tag) => (
                  <button
                    key={tag.hashtag}
                    type="button"
                    onClick={() => onSelectHashtag(tag.hashtag)}
                    className="px-3 py-1.5 rounded-full border border-primary/20 text-primary hover:bg-primary/10 transition-colors"
                  >
                    #{tag.hashtag} ({tag.postCount})
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {clubResults.length > 0 && (
          <Card className="border-primary/10 shadow-lg rounded-2xl animate-slide-in-up">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-gray-900">Clubs</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {clubResults.map((club) => (
                  <div key={club.clubId} className="rounded-2xl border border-primary/10 p-4 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-gray-900">{club.name}</p>
                        <p className="text-sm text-gray-600">{club.shortDescription ?? club.category ?? 'Club'}</p>
                      </div>
                      <span className="text-xs text-primary">{club.memberCount} members</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="cl-search-results-section">
          {!searchQuery.trim() && !isLoading && suggestedUsers.length > 0 && (
            <Card className="cl-search-suggested-card border-primary/10 shadow-lg rounded-2xl animate-slide-in-up mb-6">
              <CardContent className="cl-search-suggested-card-content p-6">
                <div className="cl-search-suggested-header flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="text-gray-900">Suggested Users</span>
                </div>
                <div className="cl-search-suggested-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {suggestedUsers.map((suggestion, index) => {
                    const { student, sharedSkills, sharedInterests } = suggestion;
                    const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(student.id);
                    const isRequested = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id);
                    const isFollower = (followGraph.followersByUserId[currentUserId] ?? []).includes(student.id);
                    const socialProof = sharedSkills.length > 0
                      ? `Shared skills: ${sharedSkills.slice(0, 2).join(', ')}`
                      : sharedInterests.length > 0
                        ? `Shared interests: ${sharedInterests.slice(0, 2).join(', ')}`
                        : null;

                    return (
                      <Card
                        key={student.id}
                        className="cl-search-suggested-user-card hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border-primary/10 rounded-2xl animate-slide-in-up"
                        style={{ animationDelay: `${index * 50}ms` }}
                        onClick={() => handleSuggestedCardClick(student.id)}
                      >
                        <CardContent className="cl-search-suggested-user-card-content p-3 sm:p-5">
                          <div className="flex items-start gap-3">
                            <Avatar className="h-12 w-12 shrink-0 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40 sm:h-14 sm:w-14">
                              <AvatarImage src={student.avatar} />
                              <AvatarFallback>{student.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-gray-900 truncate">{student.name}</h3>
                              <p className="truncate text-sm text-gray-600">{student.branch}</p>
                              {student.year > 0 && <p className="text-sm text-secondary">Year {student.year}</p>}
                              {socialProof ? (
                                <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                                  {socialProof}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          {/* followers/projects counts hidden in search results */}

                          <div className="mt-4 hidden md:flex flex-col gap-2 md:flex-row md:items-center">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onViewProfile(student.id);
                              }}
                              className="w-full md:flex-1 border border-primary/20 hover:border-primary hover:bg-primary/10 text-primary transition-all duration-300 rounded-xl px-4 py-2.5 text-sm font-medium"
                            >
                              View Profile
                            </button>
                            {!isFollowing && !isRequested && (
                              <div className="w-full md:w-auto md:flex-shrink-0">
                                <FollowButton
                                  compact
                                  className="h-10 w-full rounded-xl px-4 text-sm md:min-w-[124px] md:w-auto"
                                  targetName={student.name}
                                  accountType={student.accountType}
                                  isFollowing={isFollowing}
                                  isFollower={isFollower}
                                  requestStatus={isRequested ? 'requested' : 'none'}
                                  onFollow={() => onFollow(student.id, student.accountType)}
                                  onUnfollow={() => onUnfollow(student.id)}
                                  onCancelRequest={() => onCancelRequest(student.id)}
                                />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {Boolean(searchQuery.trim()) && (
            <div className="mb-4 min-h-6">
              {isLoading ? (
                <p className="text-gray-500 animate-pulse">Searching...</p>
              ) : hasSearched ? (
                <p className="text-gray-600 animate-fade-in">
                  {filteredStudents.length} {filteredStudents.length === 1 ? 'user' : 'users'} found
                </p>
              ) : null}
            </div>
          )}

          {Boolean(searchQuery.trim()) && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStudents.map((student, index) => (
                <Card
                  key={student.id}
                  className="cl-search-result-user-card hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border-primary/10 rounded-2xl animate-slide-in-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => handleSearchResultCardClick(student.id)}
                >
                  <CardContent className="cl-search-result-user-card-content p-6 space-y-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="cl-search-result-user-avatar w-16 h-16 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
                        <AvatarImage src={student.avatar} />
                        <AvatarFallback>{student.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-gray-900 truncate">{student.name}</h3>
                        <p className="text-sm text-gray-600">{student.branch}</p>
                        {student.year > 0 && <p className="text-sm text-secondary">Year {student.year}</p>}
                      </div>
                    </div>

                    {/* followers/projects counts hidden in search results */}

                    <div className="hidden md:flex gap-2 items-center">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onViewProfile(student.id);
                        }}
                        className="flex-1 border border-primary/20 hover:border-primary hover:bg-primary/10 text-primary transition-all duration-300 hover:scale-105 rounded-xl px-3 py-2 text-sm font-medium"
                      >
                        View Profile
                      </button>
                      {!((followGraph.followingByUserId[currentUserId] ?? []).includes(student.id)) && !((followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id)) && (
                        <div className="flex-shrink-0">
                          <FollowButton
                            targetName={student.name}
                            accountType={student.accountType}
                            isFollowing={(followGraph.followingByUserId[currentUserId] ?? []).includes(student.id)}
                            isFollower={(followGraph.followersByUserId[currentUserId] ?? []).includes(student.id)}
                            requestStatus={(followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id) ? 'requested' : 'none'}
                            onFollow={() => onFollow(student.id, student.accountType)}
                            onUnfollow={() => onUnfollow(student.id)}
                            onCancelRequest={() => onCancelRequest(student.id)}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {Boolean(searchQuery.trim()) && hasSearched && !isLoading && filteredStudents.length === 0 && hashtagResults.length === 0 && clubResults.length === 0 && (
            <Card className="border-primary/10 rounded-2xl shadow-lg animate-fade-in">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Search className="w-8 h-8 text-white" />
                </div>
                <p className="text-gray-500">No results found for this search.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
