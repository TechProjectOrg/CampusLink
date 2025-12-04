import { Users, UserPlus, CheckCircle } from 'lucide-react';
import { Club, Student } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardHeader } from './ui/card';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface ClubsPageProps {
  clubs: Club[];
  students: Student[];
  currentUserId: string;
  onJoinClub: (clubId: string) => void;
  onLeaveClub: (clubId: string) => void;
}

export function ClubsPage({ clubs, students, currentUserId, onJoinClub, onLeaveClub }: ClubsPageProps) {
  const isMember = (club: Club) => club.members.includes(currentUserId);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-gray-900">Campus Clubs</h1>
          <p className="text-gray-600">Join clubs and groups to connect with like-minded peers</p>
        </div>

        {/* Clubs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {clubs.map(club => (
            <Card key={club.id} className="overflow-hidden">
              {/* Club Banner */}
              <div className="relative h-32 bg-gradient-to-r from-blue-500 to-purple-600">
                <ImageWithFallback
                  src={club.avatar}
                  alt={club.name}
                  className="w-full h-full object-cover opacity-50"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                <div className="absolute bottom-4 left-4 right-4">
                  <h2 className="text-white">{club.name}</h2>
                </div>
              </div>

              <CardContent className="p-6 space-y-4">
                {/* Description */}
                <p className="text-gray-600">{club.description}</p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{club.members.length} members</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span>{club.posts.length} posts</span>
                  </div>
                </div>

                {/* Members Preview */}
                <div>
                  <p className="text-sm text-gray-600 mb-2">Members</p>
                  <div className="flex -space-x-2">
                    {club.members.slice(0, 5).map(memberId => {
                      const member = students.find(s => s.id === memberId);
                      return member ? (
                        <Avatar key={memberId} className="w-8 h-8 border-2 border-white">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{member.name[0]}</AvatarFallback>
                        </Avatar>
                      ) : null;
                    })}
                    {club.members.length > 5 && (
                      <div className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center">
                        <span className="text-xs text-gray-600">+{club.members.length - 5}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                {isMember(club) ? (
                  <div className="space-y-2">
                    <Badge className="bg-green-100 text-green-800 w-full justify-center py-2">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Member
                    </Badge>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" size="sm">
                        View Activity
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => onLeaveClub(club.id)}
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Leave
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => onJoinClub(club.id)}
                    className="w-full"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Join Club
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Create Club Section */}
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-gray-900 mb-2">Start Your Own Club</h3>
            <p className="text-gray-600 mb-4">
              Have a passion or interest? Create a club and bring together like-minded students!
            </p>
            <Button>Create New Club</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
