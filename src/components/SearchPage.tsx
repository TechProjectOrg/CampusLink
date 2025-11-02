import { useState, useEffect } from 'react';
import { Search, Filter, UserPlus } from 'lucide-react';
import { Student } from '../types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';

interface SearchPageProps {
  students: Student[];
  currentUserId: string;
  onConnect: (studentId: string) => void;
  onViewProfile: (studentId: string) => void;
  initialSearchQuery?: string;
}

export function SearchPage({ students, currentUserId, onConnect, onViewProfile, initialSearchQuery = '' }: SearchPageProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  const branches = ['all', ...Array.from(new Set(students.map(s => s.branch)))];
  const years = ['all', '2', '3', '4'];

  const filteredStudents = students.filter(student => {
    if (student.id === currentUserId) return false;

    const matchesSearch = searchQuery === '' || 
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase())) ||
      student.interests.some(interest => interest.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesBranch = selectedBranch === 'all' || student.branch === selectedBranch;
    const matchesYear = selectedYear === 'all' || student.year === parseInt(selectedYear);

    return matchesSearch && matchesBranch && matchesYear;
  });

  const isConnected = (studentId: string) => {
    const currentUser = students.find(s => s.id === currentUserId);
    return currentUser?.connections.includes(studentId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Search Students
          </h1>
          <p className="text-gray-600">Find peers with similar skills and interests</p>
        </div>

        {/* Search Bar */}
        <div className="relative animate-slide-in-up">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-primary transition-all duration-300" />
          <Input
            type="text"
            placeholder="Search by name, skills, or interests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-14 border-primary/20 focus:border-primary rounded-2xl shadow-lg transition-all duration-300 hover:shadow-xl"
          />
        </div>

        {/* Filters */}
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

        {/* Results */}
        <div>
          <p className="text-gray-600 mb-4 animate-fade-in">
            {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'} found
          </p>
          
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
                      <p className="text-sm text-secondary">Year {student.year}</p>
                    </div>
                  </div>

                  {/* Bio */}
                  <p className="text-sm text-gray-600 line-clamp-2">{student.bio}</p>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1">
                    {student.skills.slice(0, 3).map(skill => (
                      <Badge key={skill} variant="outline" className="text-xs border-primary/20 text-primary">
                        {skill}
                      </Badge>
                    ))}
                    {student.skills.length > 3 && (
                      <Badge variant="outline" className="text-xs border-primary/20 text-primary">
                        +{student.skills.length - 3}
                      </Badge>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex gap-4 text-sm text-gray-600 pt-2 border-t border-primary/10">
                    <div>
                      <span className="text-primary">{student.connections.length}</span>
                      <span className="ml-1">connections</span>
                    </div>
                    <div>
                      <span className="text-primary">{student.projects.length}</span>
                      <span className="ml-1">projects</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => onViewProfile(student.id)}
                      variant="outline"
                      className="flex-1 border-primary/20 hover:border-primary transition-all duration-300 hover:scale-105 rounded-xl"
                      size="sm"
                    >
                      View Profile
                    </Button>
                    {!isConnected(student.id) && (
                      <Button
                        onClick={() => onConnect(student.id)}
                        className="flex-1 gradient-primary shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl rounded-xl"
                        size="sm"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Connect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredStudents.length === 0 && (
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
