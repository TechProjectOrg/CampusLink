import { User, Briefcase, Award, Users, Eye, Edit } from 'lucide-react';
import { Student } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface ProfileCardProps {
  student: Student;
  onViewProfile: () => void;
}

export function ProfileCard({ student, onViewProfile }: ProfileCardProps) {
  return (
    <div className="space-y-4">
      {/* Main Profile Card */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift overflow-hidden animate-slide-in-up">
        {/* Gradient Header */}
        <div className="h-20 bg-gradient-to-r from-primary via-secondary to-purple-600 relative">
          <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
        </div>
        
        <CardContent className="relative px-6 pb-6">
          {/* Avatar */}
          <div className="flex justify-center -mt-12 mb-4">
            <Avatar className="w-24 h-24 ring-4 ring-white shadow-xl">
              <AvatarImage src={student.avatar} />
              <AvatarFallback className="text-2xl">{student.name[0]}</AvatarFallback>
            </Avatar>
          </div>

          {/* Name & Info */}
          <div className="text-center space-y-1 mb-4">
            <h3 className="text-gray-900">{student.name}</h3>
            <p className="text-sm text-gray-600">{student.branch}</p>
            <p className="text-sm text-secondary">Year {student.year}</p>
          </div>

          {/* Bio */}
          <p className="text-sm text-gray-600 text-center mb-4 line-clamp-3">
            {student.bio}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4 pt-4 border-t border-primary/10">
            <div className="text-center">
              <p className="text-xl text-primary">{student.connections.length}</p>
              <p className="text-xs text-gray-600">Connections</p>
            </div>
            <div className="text-center">
              <p className="text-xl text-primary">{student.projects.length}</p>
              <p className="text-xs text-gray-600">Projects</p>
            </div>
            <div className="text-center">
              <p className="text-xl text-primary">{student.skills.length}</p>
              <p className="text-xs text-gray-600">Skills</p>
            </div>
          </div>

          {/* View Profile Button */}
          <Button
            onClick={onViewProfile}
            className="w-full gradient-primary shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl rounded-xl"
          >
            <Eye className="w-4 h-4 mr-2" />
            View Full Profile
          </Button>
        </CardContent>
      </Card>

      {/* Quick Skills Card */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up" style={{ animationDelay: '100ms' }}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <h4 className="text-gray-900">Top Skills</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {student.skills.slice(0, 5).map(skill => (
              <Badge 
                key={skill} 
                className="bg-primary/10 text-primary border-primary/20 transition-all duration-300 hover:scale-105 hover:bg-primary/20"
              >
                {skill}
              </Badge>
            ))}
            {student.skills.length > 5 && (
              <Badge className="bg-gray-100 text-gray-600">
                +{student.skills.length - 5} more
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions Card */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up" style={{ animationDelay: '200ms' }}>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-5 h-5 text-primary" />
            <h4 className="text-gray-900">Quick Actions</h4>
          </div>
          <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:scale-105 text-left">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Edit className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-gray-900">Edit Profile</p>
              <p className="text-xs text-gray-500">Update your information</p>
            </div>
          </button>
          <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:scale-105 text-left">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-gray-900">My Network</p>
              <p className="text-xs text-gray-500">View connections</p>
            </div>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
