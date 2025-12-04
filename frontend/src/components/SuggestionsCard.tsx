import { UserPlus, TrendingUp, Users, Sparkles } from 'lucide-react';
import { Student } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface SuggestionsCardProps {
  students: Student[];
  currentUserId: string;
  onConnect: (studentId: string) => void;
  onViewProfile: (studentId: string) => void;
}

export function SuggestionsCard({ students, currentUserId, onConnect, onViewProfile }: SuggestionsCardProps) {
  const currentUser = students.find(s => s.id === currentUserId);
  
  // Get suggested connections - students in same branch who are not connected
  const suggestedStudents = students
    .filter(s => 
      s.id !== currentUserId && 
      !currentUser?.connections.includes(s.id) &&
      s.branch === currentUser?.branch
    )
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Suggested Connections */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <h4 className="text-gray-900">Suggested For You</h4>
          </div>
          
          <div className="space-y-4">
            {suggestedStudents.map((student) => (
              <div key={student.id} className="space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar 
                    className="w-12 h-12 ring-2 ring-primary/10 cursor-pointer transition-all duration-300 hover:ring-primary/30"
                    onClick={() => onViewProfile(student.id)}
                  >
                    <AvatarImage src={student.avatar} />
                    <AvatarFallback>{student.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p 
                      className="text-sm text-gray-900 hover:text-primary cursor-pointer transition-colors duration-300"
                      onClick={() => onViewProfile(student.id)}
                    >
                      {student.name}
                    </p>
                    <p className="text-xs text-gray-600">{student.branch}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {student.skills.slice(0, 2).map(skill => (
                        <Badge key={skill} variant="outline" className="text-xs border-primary/20 text-primary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => onConnect(student.id)}
                  size="sm"
                  variant="outline"
                  className="w-full border-primary/20 hover:border-primary hover:bg-primary/5 transition-all duration-300 hover:scale-105 rounded-xl"
                >
                  <UserPlus className="w-3 h-3 mr-2" />
                  Connect
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trending Topics */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up" style={{ animationDelay: '100ms' }}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-secondary" />
            </div>
            <h4 className="text-gray-900">Trending Topics</h4>
          </div>
          
          <div className="space-y-3">
            <button className="w-full text-left p-3 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-900">#HackathonSeason</p>
                <Badge className="bg-secondary/10 text-secondary border-secondary/20">
                  Hot
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">125 posts</p>
            </button>
            
            <button className="w-full text-left p-3 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-900">#PlacementPrep</p>
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  New
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">89 posts</p>
            </button>
            
            <button className="w-full text-left p-3 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:scale-105">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-900">#OpenSource</p>
                <Badge className="bg-accent/10 text-accent border-accent/20">
                  Rising
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">67 posts</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Campus Stats */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up" style={{ animationDelay: '200ms' }}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <h4 className="text-gray-900">Campus Stats</h4>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl">
              <p className="text-sm text-gray-700">Active Students</p>
              <p className="text-primary">500+</p>
            </div>
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-secondary/5 to-purple-100/50 rounded-xl">
              <p className="text-sm text-gray-700">Live Opportunities</p>
              <p className="text-secondary">45</p>
            </div>
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-accent/5 to-accent/10 rounded-xl">
              <p className="text-sm text-gray-700">Active Clubs</p>
              <p className="text-accent">12</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
