import { User, Briefcase, Award, Users, Eye, Edit } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Student } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { useAuth } from '../context/AuthContext';
import { apiFetchUserSkills } from '../lib/skillsApi';

interface ProfileCardProps {
  student: Student | null | undefined;
  followerCount: number;
  followingCount: number;
  onViewProfile: () => void;
  onEditProfile: () => void;
  onViewNetwork: () => void;
}

export function ProfileCard({ student, followerCount, followingCount, onViewProfile, onEditProfile, onViewNetwork }: ProfileCardProps) {
  const auth = useAuth();
  const displayName = student?.name?.trim() || student?.displayName?.trim() || student?.username?.trim() || 'User';
  const avatarSrc = student?.avatar || undefined;
  const avatarFallback = displayName.charAt(0).toUpperCase() || 'U';
  const branch = student?.branch?.trim() || 'Branch not added';
  const year = typeof student?.year === 'number' && student.year > 0 ? student.year : null;
  const bio = student?.bio?.trim() || 'Add a short bio to help others understand what you are interested in.';
  const [loadedSkills, setLoadedSkills] = useState<string[]>(Array.isArray(student?.skills) ? student.skills : []);

  useEffect(() => {
    setLoadedSkills(Array.isArray(student?.skills) ? student.skills : []);
  }, [student?.skills, student?.id]);

  useEffect(() => {
    if (!student?.id) return;

    let cancelled = false;

    void (async () => {
      try {
        const list = await apiFetchUserSkills(student.id, auth.session?.token);
        if (!cancelled && list.length > 0) {
          setLoadedSkills(list.map((skill) => skill.name).filter(Boolean));
        }
      } catch {
        // Keep the profile card lightweight and fall back to existing profile data.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [student?.id, auth.session?.token]);

  const skills = loadedSkills;
  const topSkills = skills.slice(0, 4);

  return (
    <div className="space-y-4">
      {/* Main Profile Card */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift overflow-hidden animate-slide-in-up">
        {/* Cover Photo / Gradient Header */}
        <div className="h-20 bg-gradient-to-r from-primary via-secondary to-purple-600 relative overflow-hidden">
          {student.coverPhotoUrl ? (
            <img
              src={student.coverPhotoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>
        </div>
        
        <CardContent className="relative px-6 pb-6">
          {/* Avatar */}
          <div className="flex justify-center -mt-12 mb-4">
            <Avatar className="w-24 h-24 ring-4 ring-white shadow-xl">
              <AvatarImage src={avatarSrc} />
              <AvatarFallback className="text-2xl">{avatarFallback}</AvatarFallback>
            </Avatar>
          </div>

          {/* Name & Info */}
          <div className="text-center space-y-1 mb-4">
            <h3 className="text-gray-900">{displayName}</h3>
            <p className="text-sm text-gray-600">{branch}</p>
            <p className="text-sm text-secondary">{year ? `Year ${year}` : 'Year not added'}</p>
          </div>

          {/* Bio */}
          <p className="text-sm text-gray-600 text-center mb-4 line-clamp-3">
            {bio}
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-4 pt-4 border-t border-primary/10">
            <div className="text-center">
              <p className="text-xl text-primary">{followerCount}</p>
              <p className="text-xs text-gray-600">Followers</p>
            </div>
            <div className="text-center">
              <p className="text-xl text-primary">{followingCount}</p>
              <p className="text-xs text-gray-600">Following</p>
            </div>
            <div className="text-center">
              <p className="text-xl text-primary">{skills.length}</p>
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
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            <h4 className="text-gray-900">Top Skills</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {topSkills.map(skill => (
              <Badge 
                key={skill} 
                className="bg-primary/10 text-primary border-primary/20 transition-all duration-300 hover:scale-105 hover:bg-primary/20"
              >
                {skill}
              </Badge>
            ))}
            {skills.length > 4 && (
              <Badge className="bg-gray-100 text-gray-600">
                +{skills.length - 4} more
              </Badge>
            )}
            {skills.length === 0 ? (
              <Badge className="bg-gray-100 text-gray-600">
                Add skills to highlight your profile
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions Card */}
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up" style={{ animationDelay: '200ms' }}>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="w-5 h-5 text-primary" />
            <h4 className="text-gray-900">Quick Actions</h4>
          </div>
          <button
            type="button"
            onClick={onEditProfile}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:scale-105 text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Edit className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-gray-900">Edit Profile</p>
              <p className="text-xs text-gray-500">Update your information</p>
            </div>
          </button>
          <button
            type="button"
            onClick={onViewNetwork}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-all duration-300 hover:scale-105 text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <p className="text-sm text-gray-900">My Network</p>
              <p className="text-xs text-gray-500">Followers & following</p>
            </div>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
