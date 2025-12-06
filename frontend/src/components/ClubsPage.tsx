import { Users, UserPlus, CheckCircle } from 'lucide-react';
import { Club, Student } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent, CardHeader } from './ui/card';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { CreateClubModal } from './CreateClubModal';
import { ClubActivityPage } from './ClubActivityPage';
import { useState } from 'react';

interface ClubsPageProps {
  clubs: Club[];
  students: Student[];
  currentUserId: string;
  onJoinClub: (clubId: string) => void;
  onLeaveClub: (clubId: string) => void;
  onCreateClub?: (club: Club) => void;
  onViewProfile?: (studentId: string) => void;
}

export function ClubsPage({ clubs, students, currentUserId, onJoinClub, onLeaveClub, onCreateClub, onViewProfile }: ClubsPageProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const isMember = (club: Club) => club.members.includes(currentUserId);

  const handleCreateClub = (club: Club) => {
    if (onCreateClub) {
      onCreateClub(club);
    }
  };

  const handleViewActivity = (club: Club) => {
    setSelectedClub(club);
  };

  // If viewing a specific club's activity
  if (selectedClub) {
    return (
      <ClubActivityPage
        club={selectedClub}
        students={students}
        currentUserId={currentUserId}
        onBack={() => setSelectedClub(null)}
        onViewProfile={onViewProfile}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6 md:space-y-8">
        {/* Header */}
        <div className="animate-slide-in-down">
          <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2">Campus Clubs</h1>
          <p className="text-gray-600">Join clubs and groups to connect with like-minded peers</p>
        </div>

        {/* Create Club Section - Moved to Top */}
        <Card className="border-2 border-dashed border-primary/20 hover:border-primary/40 transition-all duration-300 hover-lift bg-gradient-to-br from-white to-blue-50/30 animate-slide-in-up">
          <CardContent className="p-6 md:p-8 lg:p-10">
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center flex-shrink-0">
                <Users className="w-8 h-8 md:w-10 md:h-10 text-primary" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-gray-900 mb-2 text-xl md:text-2xl">Start Your Own Club</h3>
                <p className="text-gray-600 text-sm md:text-base">
                  Have a passion or interest? Create a club and bring together like-minded students!
                </p>
              </div>
              <Button 
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-gradient-to-r from-primary to-secondary hover:shadow-xl transition-all duration-300 hover:scale-105 flex-shrink-0"
              >
                <Users className="w-4 h-4 mr-2" />
                Create New Club
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Clubs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 animate-slide-in-up">
          {clubs.map(club => (
            <Card key={club.id} className="overflow-hidden hover-lift transition-all duration-300 shadow-sm hover:shadow-xl border border-primary/10">
              {/* Club Banner */}
              <div className="relative h-32 md:h-40 bg-gradient-to-r from-blue-500 to-purple-600">
                <ImageWithFallback
                  src={club.avatar}
                  alt={club.name}
                  className="w-full h-full object-cover opacity-50"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
                <div className="absolute bottom-3 md:bottom-4 left-3 md:left-4 right-3 md:right-4">
                  <h2 className="text-white text-lg md:text-xl">{club.name}</h2>
                </div>
              </div>

              <CardContent className="p-4 md:p-6 space-y-3 md:space-y-4">
                {/* Description */}
                <p className="text-gray-600 text-sm md:text-base line-clamp-2">{club.description}</p>

                {/* Stats */}
                <div className="flex items-center gap-3 md:gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <Users className="w-4 h-4 text-primary" />
                    <span>{club.members.length} members</span>
                  </div>
                  <div className="flex items-center gap-1 md:gap-1.5">
                    <span>{club.posts.length} posts</span>
                  </div>
                </div>

                {/* Members Preview */}
                <div>
                  <p className="text-xs md:text-sm text-gray-600 mb-2">Members</p>
                  <div className="flex -space-x-2">
                    {club.members.slice(0, 5).map(memberId => {
                      const member = students.find(s => s.id === memberId);
                      return member ? (
                        <Avatar key={memberId} className="w-8 h-8 md:w-9 md:h-9 border-2 border-white ring-1 ring-gray-100">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>{member.name[0]}</AvatarFallback>
                        </Avatar>
                      ) : null;
                    })}
                    {club.members.length > 5 && (
                      <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center ring-1 ring-gray-100">
                        <span className="text-xs text-gray-600">+{club.members.length - 5}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                {isMember(club) ? (
                  <div className="space-y-2 pt-2">
                    <Badge className="bg-green-100 text-green-800 w-full justify-center py-2 hover:bg-green-200 transition-colors">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Member
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleViewActivity(club)}
                        size="sm"
                        className="flex-1 hover:bg-primary/5 hover:border-primary/30 transition-all"
                      >
                        View Activity
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => onLeaveClub(club.id)}
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 hover:border-red-200 transition-all"
                      >
                        Leave
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    onClick={() => onJoinClub(club.id)}
                    className="w-full mt-2 bg-gradient-to-r from-primary to-secondary hover:shadow-lg transition-all duration-300 hover:scale-105"
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Join Club
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Create Club Modal */}
        <CreateClubModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreateClub={handleCreateClub}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}