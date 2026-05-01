import { useEffect, useMemo, useState } from 'react';
import { Search, Hash, Users } from 'lucide-react';
import type { Student } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { useAuth } from '../context/AuthContext';
import { apiSearchAll, type SearchClubResult, type SearchHashtagResult, type SearchUserResult } from '../lib/networkApi';

interface SearchPageProps {
  students: Student[];
  currentUserId: string;
  followGraph: FollowGraph;
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
    name: r.username,
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
  }, [currentUser, currentUserId, followGraph.followingByUserId, followGraph.outgoingRequestsByUserId, students]);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHashtagResults([]);
      setClubResults([]);
      setHasSearched(false);
      return;
    }

    const timerId = setTimeout(async () => {
      setIsLoading(true);
      setHasSearched(true);
      try {
        const result = await apiSearchAll(searchQuery.trim(), auth.session?.token, 50, 25);
        setSearchResults(result.users.map(searchResultToStudent));
        setHashtagResults(result.hashtags);
        setClubResults(result.clubs ?? []);
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
        setHashtagResults([]);
        setClubResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timerId);
  }, [searchQuery, auth.session?.token]);

  const filteredStudents = searchResults;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="animate-slide-in-down">
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

        <div>
          {!searchQuery.trim() && !isLoading && suggestedUsers.length > 0 && (
            <Card className="border-primary/10 shadow-lg rounded-2xl animate-slide-in-up mb-6">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="text-gray-900">Suggested Users</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {suggestedUsers.map((suggestion, index) => {
                    const { student, sharedSkills, sharedInterests } = suggestion;

                    return (
                      <Card
                        key={student.id}
                        className="hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 border-primary/10 rounded-2xl animate-slide-in-up"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <CardContent className="p-5 space-y-4">
                          <div className="flex items-start gap-3">
                            <Avatar className="w-14 h-14 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
                              <AvatarImage src={student.avatar} />
                              <AvatarFallback>{student.name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-gray-900 truncate">{student.name}</h3>
                              <p className="text-sm text-gray-600">{student.branch}</p>
                              {student.year > 0 && <p className="text-sm text-secondary">Year {student.year}</p>}
                              <p className="text-xs text-gray-500 mt-1">
                                {sharedSkills.length > 0
                                  ? `Shared skills: ${sharedSkills.slice(0, 2).join(', ')}`
                                  : sharedInterests.length > 0
                                    ? `Shared interests: ${sharedInterests.slice(0, 2).join(', ')}`
                                    : 'New member'}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-4 text-sm text-gray-600 pt-2 border-t border-primary/10">
                            <div>
                              <span className="text-primary">{(followGraph.followersByUserId[student.id] ?? []).length}</span>
                              <span className="ml-1">followers</span>
                            </div>
                            <div>
                              <span className="text-primary">{student.projects.length}</span>
                              <span className="ml-1">projects</span>
                            </div>
                          </div>

                          <div className="flex gap-2 items-center">
                            <button
                              type="button"
                              onClick={() => onViewProfile(student.id)}
                              className="flex-1 border border-primary/20 hover:border-primary transition-all duration-300 hover:scale-105 rounded-xl px-3 py-2 text-sm"
                            >
                              View Profile
                            </button>
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
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {hasSearched && !isLoading && (
            <p className="text-gray-600 mb-4 animate-fade-in">
              {filteredStudents.length} {filteredStudents.length === 1 ? 'user' : 'users'} found
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudents.map((student, index) => (
              <Card
                key={student.id}
                className="hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border-primary/10 rounded-2xl animate-slide-in-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="w-16 h-16 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
                      <AvatarImage src={student.avatar} />
                      <AvatarFallback>{student.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-gray-900 truncate">{student.name}</h3>
                      <p className="text-sm text-gray-600">{student.branch}</p>
                      {student.year > 0 && <p className="text-sm text-secondary">Year {student.year}</p>}
                    </div>
                  </div>

                  <div className="flex gap-4 text-sm text-gray-600 pt-2 border-t border-primary/10">
                    <div>
                      <span className="text-primary">{(followGraph.followersByUserId[student.id] ?? []).length}</span>
                      <span className="ml-1">followers</span>
                    </div>
                    <div>
                      <span className="text-primary">{student.projects.length}</span>
                      <span className="ml-1">projects</span>
                    </div>
                  </div>

                  <div className="flex gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => onViewProfile(student.id)}
                      className="flex-1 border border-primary/20 hover:border-primary transition-all duration-300 hover:scale-105 rounded-xl px-3 py-2 text-sm"
                    >
                      View Profile
                    </button>
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
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!hasSearched && searchQuery.trim().length > 0 && (
            <Card className="border-primary/10 rounded-2xl shadow-lg animate-fade-in">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Search className="w-8 h-8 text-white" />
                </div>
                <p className="text-gray-500">Start typing to search users and hashtags</p>
              </CardContent>
            </Card>
          )}

          {hasSearched && !isLoading && filteredStudents.length === 0 && hashtagResults.length === 0 && clubResults.length === 0 && (
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
