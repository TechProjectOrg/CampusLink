import { useState, useEffect } from 'react';
import { Search, Filter, Loader2 } from 'lucide-react';
import type { Student } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { useAuth } from '../context/AuthContext';
import { apiSearchUsers, type SearchUserResult } from '../lib/networkApi';

interface SearchPageProps {
  students: Student[];
  currentUserId: string;
  followGraph: FollowGraph;
  onFollow: (targetUserId: string) => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;
  onViewProfile: (studentId: string) => void;
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
    avatar: r.profilePictureUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  students: _students,
  currentUserId,
  followGraph,
  onFollow,
  onUnfollow,
  onCancelRequest,
  onViewProfile,
  initialSearchQuery = ''
}: SearchPageProps) {
  const auth = useAuth();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    const timerId = setTimeout(async () => {
      setIsLoading(true);
      setHasSearched(true);
      try {
        const results = await apiSearchUsers(searchQuery.trim(), auth.session?.token, 50, 0);
        setSearchResults(results.map(searchResultToStudent));
      } catch (err) {
        console.error('Search failed:', err);
        setSearchResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timerId);
  }, [searchQuery, auth.session?.token]);

  // Extract available branch values from search results
  const branches = ['all', ...Array.from(new Set(searchResults.map(s => s.branch).filter(Boolean)))];
  const years = ['all', '1', '2', '3', '4'];

  const filteredStudents = searchResults.filter(student => {
    const matchesBranch = selectedBranch === 'all' || student.branch === selectedBranch;
    const matchesYear = selectedYear === 'all' || student.year === parseInt(selectedYear);
    return matchesBranch && matchesYear;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Search Students
          </h1>
          <p className="text-gray-600">Find peers by username or email</p>
        </div>

        {/* Search Bar */}
        <div className="relative animate-slide-in-up">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary transition-all duration-300" />
          <Input
            type="text"
            placeholder="Search by username or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-14 border-primary/20 focus:border-primary rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl"
          />
          {isLoading && (
            <Loader2 className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary animate-spin" />
          )}
        </div>

        {/* Filters — only show when we have results */}
        {searchResults.length > 0 && (
          <Card className="border-primary/10 shadow-lg hover-lift animate-slide-in-up rounded-2xl">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-primary" />
                <span className="text-gray-900">Filters:</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Branch Filter */}
                <div className="space-y-3">
                  <label className="text-sm text-gray-600">Branch</label>
                  <div className="flex flex-wrap gap-2">
                    {branches.map(branch => (
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

                {/* Year Filter */}
                <div className="space-y-3">
                  <label className="text-sm text-gray-600">Year</label>
                  <div className="flex flex-wrap gap-2">
                    {years.map(year => (
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

        {/* Results */}
        <div>
          {hasSearched && !isLoading && (
            <p className="text-gray-600 mb-4 animate-fade-in">
              {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'} found
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
                  {/* Avatar & Name */}
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

                  {/* Stats */}
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

                  {/* Actions */}
                  <div className="flex gap-2 items-center">
                    <Button
                      onClick={() => onViewProfile(student.id)}
                      variant="outline"
                      className="flex-1 border-primary/20 hover:border-primary transition-all duration-300 hover:scale-105 rounded-xl"
                      size="sm"
                    >
                      View Profile
                    </Button>
                    <div className="flex-shrink-0">
                      <FollowButton
                        targetName={student.name}
                        accountType={student.accountType}
                        isFollowing={(followGraph.followingByUserId[currentUserId] ?? []).includes(student.id)}
                        isFollower={(followGraph.followersByUserId[currentUserId] ?? []).includes(student.id)}
                        requestStatus={(followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id) ? 'requested' : 'none'}
                        onFollow={() => onFollow(student.id)}
                        onUnfollow={() => onUnfollow(student.id)}
                        onCancelRequest={() => onCancelRequest(student.id)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty / Prompt states */}
          {!hasSearched && (
            <Card className="border-primary/10 rounded-2xl shadow-lg animate-fade-in">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Search className="w-8 h-8 text-white" />
                </div>
                <p className="text-gray-500">Start typing to search for students</p>
              </CardContent>
            </Card>
          )}

          {hasSearched && !isLoading && filteredStudents.length === 0 && (
            <Card className="border-primary/10 rounded-2xl shadow-lg animate-fade-in">
              <CardContent className="p-12 text-center">
                <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                  <Search className="w-8 h-8 text-white" />
                </div>
                <p className="text-gray-500">No students found matching your criteria.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}