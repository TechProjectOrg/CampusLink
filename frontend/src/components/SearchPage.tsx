import { useState, useEffect } from 'react';
import { Search, Filter, Loader2, Hash } from 'lucide-react';
import type { Student } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { useAuth } from '../context/AuthContext';
import { apiSearchAll, type SearchHashtagResult, type SearchUserResult } from '../lib/networkApi';

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
  students: _students,
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
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHashtagResults([]);
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
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
        setHashtagResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timerId);
  }, [searchQuery, auth.session?.token]);

  const branches = ['all', ...Array.from(new Set(searchResults.map((s) => s.branch).filter(Boolean)))];
  const years = ['all', '1', '2', '3', '4'];

  const filteredStudents = searchResults.filter((student) => {
    const matchesBranch = selectedBranch === 'all' || student.branch === selectedBranch;
    const matchesYear = selectedYear === 'all' || student.year === parseInt(selectedYear, 10);
    return matchesBranch && matchesYear;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Search
          </h1>
          <p className="text-gray-600">Find users and hashtags in one place</p>
        </div>

        <div className="relative animate-slide-in-up">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary transition-all duration-300" />
          <Input
            type="text"
            placeholder="Search users or hashtags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-14 border-primary/20 focus:border-primary rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl"
          />
          {isLoading && (
            <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
          )}
        </div>

        {searchResults.length > 0 && (
          <Card className="border-primary/10 shadow-lg hover-lift animate-slide-in-up rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-primary" />
                <span className="text-gray-900">User Filters:</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-sm text-gray-600">Branch</label>
                  <div className="flex flex-wrap gap-2">
                    {branches.map((branch) => (
                      <Badge
                        key={branch}
                        onClick={() => setSelectedBranch(branch)}
                        className={`cursor-pointer transition-all duration-300 hover:scale-105 border ${
                          selectedBranch === branch
                            ? 'gradient-primary text-white shadow-lg scale-105'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-primary/20'
                        }`}
                      >
                        {branch === 'all' ? 'All Branches' : branch}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm text-gray-600">Year</label>
                  <div className="flex flex-wrap gap-2">
                    {years.map((year) => (
                      <Badge
                        key={year}
                        onClick={() => setSelectedYear(year)}
                        className={`cursor-pointer transition-all duration-300 hover:scale-105 border ${
                          selectedYear === year
                            ? 'gradient-primary text-white shadow-lg scale-105'
                            : 'bg-white text-gray-700 hover:bg-gray-50 border-primary/20'
                        }`}
                      >
                        {year === 'all' ? 'All Years' : `Year ${year}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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

        <div>
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

          {!hasSearched && (
            <Card className="border-primary/10 rounded-2xl shadow-lg animate-fade-in">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Search className="w-8 h-8 text-white" />
                </div>
                <p className="text-gray-500">Start typing to search users and hashtags</p>
              </CardContent>
            </Card>
          )}

          {hasSearched && !isLoading && filteredStudents.length === 0 && hashtagResults.length === 0 && (
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
