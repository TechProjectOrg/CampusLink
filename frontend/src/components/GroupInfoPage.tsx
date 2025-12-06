import { useState } from 'react';
import { ArrowLeft, Users, Calendar, Crown, UserPlus, Settings, LogOut, UserMinus, MoreVertical } from 'lucide-react';
import { Group, Student } from '../types';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader } from './ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface GroupInfoPageProps {
  group: Group;
  students: Student[];
  currentUserId: string;
  onBack: () => void;
  onViewProfile?: (studentId: string) => void;
  onLeaveGroup?: (groupId: string) => void;
  onRemoveMember?: (groupId: string, memberId: string) => void;
  onMakeAdmin?: (groupId: string, memberId: string) => void;
}

export function GroupInfoPage({
  group,
  students,
  currentUserId,
  onBack,
  onViewProfile,
  onLeaveGroup,
  onRemoveMember,
  onMakeAdmin
}: GroupInfoPageProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = group.admins.includes(currentUserId);
  const groupMembers = students.filter(s => group.members.includes(s.id));

  const filteredMembers = groupMembers.filter(member =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="rounded-full w-10 h-10 p-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-gray-900">Group Info</h1>
        </div>

        {/* Group Header Card */}
        <Card className="border-primary/10 rounded-2xl shadow-lg overflow-hidden">
          <div className="h-32 bg-gradient-to-br from-primary to-secondary"></div>
          <CardContent className="relative pt-0 pb-6">
            {/* Group Avatar */}
            <div className="flex flex-col items-center -mt-16 mb-4">
              <Avatar className="w-32 h-32 ring-4 ring-white shadow-xl">
                <AvatarImage src={group.avatar} />
                <AvatarFallback className="text-3xl bg-gradient-to-br from-primary to-secondary text-white">
                  {group.name[0]}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-gray-900 mt-4">{group.name}</h2>
              <p className="text-gray-600 text-center max-w-md mt-2">{group.description}</p>
            </div>

            {/* Group Stats */}
            <div className="flex justify-center gap-8 mt-6 pt-6 border-t border-gray-100">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <p className="text-gray-900">{group.members.length}</p>
                </div>
                <p className="text-sm text-gray-600 mt-1">Members</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-500" />
                  <p className="text-gray-900">{group.admins.length}</p>
                </div>
                <p className="text-sm text-gray-600 mt-1">Admins</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Calendar className="w-5 h-5 text-accent" />
                  <p className="text-gray-900">{formatDate(group.createdAt).split(',')[0]}</p>
                </div>
                <p className="text-sm text-gray-600 mt-1">Created</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              {isAdmin && (
                <Button className="flex-1 gradient-primary rounded-xl">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Members
                </Button>
              )}
              {onLeaveGroup && (
                <Button
                  variant="outline"
                  onClick={() => onLeaveGroup(group.id)}
                  className="flex-1 border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Leave Group
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Members Section */}
        <Card className="border-primary/10 rounded-2xl shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-gray-900">Members ({group.members.length})</h3>
              {isAdmin && (
                <Button variant="ghost" size="sm">
                  <Settings className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredMembers.map(member => {
              const isMemberAdmin = group.admins.includes(member.id);
              const isCurrentUser = member.id === currentUserId;
              const isCreator = member.id === group.createdBy;

              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <button
                    onClick={() => onViewProfile?.(member.id)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    <Avatar className="w-12 h-12 ring-2 ring-primary/20">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>{member.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {member.name}
                          {isCurrentUser && ' (You)'}
                        </p>
                        {isCreator && (
                          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                            <Crown className="w-3 h-3 mr-1" />
                            Creator
                          </Badge>
                        )}
                        {isMemberAdmin && !isCreator && (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                            Admin
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {member.branch} • Year {member.year}
                      </p>
                    </div>
                  </button>

                  {/* Member Actions (only for admins) */}
                  {isAdmin && !isCurrentUser && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onViewProfile?.(member.id)}>
                          View Profile
                        </DropdownMenuItem>
                        {!isMemberAdmin && onMakeAdmin && (
                          <DropdownMenuItem onClick={() => onMakeAdmin(group.id, member.id)}>
                            Make Admin
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {onRemoveMember && !isCreator && (
                          <DropdownMenuItem
                            onClick={() => onRemoveMember(group.id, member.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserMinus className="w-4 h-4 mr-2" />
                            Remove from Group
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Group Settings (Admin Only) */}
        {isAdmin && (
          <Card className="border-primary/10 rounded-2xl shadow-lg">
            <CardHeader>
              <h3 className="text-gray-900">Group Settings</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start rounded-xl">
                <Settings className="w-4 h-4 mr-2" />
                Edit Group Info
              </Button>
              <Button variant="outline" className="w-full justify-start rounded-xl">
                <Users className="w-4 h-4 mr-2" />
                Manage Admins
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl"
              >
                Delete Group
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
