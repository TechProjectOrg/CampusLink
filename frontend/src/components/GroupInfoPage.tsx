import { useMemo, useState } from 'react';
import { ArrowLeft, Calendar, Crown, Flag, LogOut, Shield, UserMinus, UserPlus, Users } from 'lucide-react';
import { Student } from '../types';
import type { GroupChatDetailsApi } from '../lib/chatApi';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';

interface GroupInfoPageProps {
  group: GroupChatDetailsApi;
  students: Student[];
  currentUserId: string;
  isLoading?: boolean;
  onBack: () => void;
  onViewProfile?: (studentId: string) => void;
  onLeaveGroup?: (groupId: string) => void | Promise<void>;
  onRemoveMember?: (groupId: string, memberId: string) => void | Promise<void>;
  onMakeAdmin?: (groupId: string, memberId: string) => void | Promise<void>;
  onAddMember?: (groupId: string, memberId: string) => void | Promise<void>;
}

export function GroupInfoPage({
  group,
  students,
  currentUserId,
  isLoading = false,
  onBack,
  onViewProfile,
  onLeaveGroup,
  onRemoveMember,
  onMakeAdmin,
  onAddMember,
}: GroupInfoPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);

  const currentMember = group.members.find((member) => member.userId === currentUserId) ?? null;
  const isAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const studentLookup = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );
  const memberIds = useMemo(
    () => new Set(group.members.map((member) => member.userId)),
    [group.members],
  );

  const filteredMembers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return group.members.filter((member) => {
      if (!normalizedQuery) return true;
      return member.username.toLowerCase().includes(normalizedQuery);
    });
  }, [group.members, searchQuery]);

  const addableStudents = useMemo(
    () =>
      students.filter(
        (student) =>
          student.id !== currentUserId &&
          !memberIds.has(student.id) &&
          student.name.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      ),
    [currentUserId, memberIds, searchQuery, students],
  );

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full w-10 h-10 p-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-gray-900">Group Info</h1>
        </div>

        <Card className="border-primary/10 rounded-2xl shadow-lg overflow-hidden">
          <div className="h-32 bg-gradient-to-br from-primary to-secondary" />
          <CardContent className="relative pt-0 pb-6">
            <div className="flex flex-col items-center -mt-16 mb-4">
              <Avatar className="w-32 h-32 ring-4 ring-white shadow-xl">
                <AvatarImage src={group.avatarUrl ?? undefined} />
                <AvatarFallback className="text-3xl bg-gradient-to-br from-primary to-secondary text-white">
                  {group.name[0]}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-gray-900 mt-4">{group.name}</h2>
              <p className="text-gray-600 text-center max-w-md mt-2">
                {group.description || 'No group description yet.'}
              </p>
            </div>

            <div className="flex justify-center gap-8 mt-6 pt-6 border-t border-gray-100">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <p className="text-gray-900">{group.memberCount}</p>
                </div>
                <p className="text-sm text-gray-600 mt-1">Members</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Crown className="w-5 h-5 text-yellow-500" />
                  <p className="text-gray-900">
                    {group.members.filter((member) => member.role === 'owner' || member.role === 'admin').length}
                  </p>
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

            <div className="flex flex-wrap gap-3 mt-6">
              {isAdmin && (
                <Button
                  className="flex-1 min-w-52 gradient-primary rounded-xl"
                  onClick={() => setIsAddMembersOpen((current) => !current)}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {isAddMembersOpen ? 'Close Add Members' : 'Add Members'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => void onLeaveGroup?.(group.id)}
                className="flex-1 min-w-52 border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Leave Group
              </Button>
            </div>

            {isAdmin && isAddMembersOpen && (
              <div className="mt-4 rounded-2xl border border-primary/10 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-gray-900">Add Members</h3>
                  <Badge variant="secondary">{addableStudents.length} available</Badge>
                </div>
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search students to add"
                  className="rounded-xl"
                />
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {addableStudents.length === 0 ? (
                    <p className="text-sm text-gray-500">No more students available to add.</p>
                  ) : (
                    addableStudents.map((student) => (
                      <div key={student.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                        <button
                          type="button"
                          onClick={() => onViewProfile?.(student.id)}
                          className="flex items-center gap-3 text-left flex-1"
                        >
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={student.avatar} />
                            <AvatarFallback>{student.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{student.name}</p>
                            <p className="text-xs text-gray-500">
                              {student.branch} - Year {student.year}
                            </p>
                          </div>
                        </button>
                        <Button size="sm" className="rounded-full" onClick={() => void onAddMember?.(group.id, student.id)}>
                          Add
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/10 rounded-2xl shadow-lg">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-gray-900">Members ({group.memberCount})</h3>
              {currentMember && (
                <Badge className="capitalize bg-blue-100 text-blue-800 border-blue-200">
                  {currentMember.role}
                </Badge>
              )}
            </div>
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search group members"
              className="rounded-xl"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading members...</p>
            ) : filteredMembers.length === 0 ? (
              <p className="text-sm text-gray-500">No members match this search.</p>
            ) : (
              filteredMembers.map((member) => {
                const linkedStudent = studentLookup.get(member.userId);
                const isCurrentUser = member.userId === currentUserId;
                const isOwner = member.role === 'owner';
                const canModerate = isAdmin && !isCurrentUser && !isOwner;

                return (
                  <div key={member.userId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <button
                      type="button"
                      onClick={() => onViewProfile?.(member.userId)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <Avatar className="w-12 h-12 ring-2 ring-primary/20">
                        <AvatarImage src={member.avatarUrl ?? linkedStudent?.avatar} />
                        <AvatarFallback>{member.username[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {member.username}
                            {isCurrentUser ? ' (You)' : ''}
                          </p>
                          {isOwner ? (
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                              <Crown className="w-3 h-3 mr-1" />
                              Creator
                            </Badge>
                          ) : member.role === 'admin' ? (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-500">
                          {linkedStudent ? `${linkedStudent.branch} - Year ${linkedStudent.year}` : 'Group member'}
                        </p>
                      </div>
                    </button>

                    {canModerate && (
                      <div className="flex items-center gap-2">
                        {member.role === 'member' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full"
                            onClick={() => void onMakeAdmin?.(group.id, member.userId)}
                          >
                            Make Admin
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full border-destructive/20 text-destructive hover:bg-destructive/10"
                          onClick={() => void onRemoveMember?.(group.id, member.userId)}
                        >
                          <UserMinus className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card className="border-primary/10 rounded-2xl shadow-lg">
            <CardHeader>
              <h3 className="text-gray-900">Admin Settings</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start rounded-xl" onClick={() => setIsAddMembersOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Manage Members
              </Button>
              <Button variant="outline" className="w-full justify-start rounded-xl" type="button">
                <Flag className="w-4 h-4 mr-2" />
                Report Group
              </Button>
              <p className="text-xs text-gray-500 px-1">
                Admins can manage members here. Editing and delete flows can be connected next.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/10 rounded-2xl shadow-lg">
            <CardHeader>
              <h3 className="text-gray-900">Member Settings</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start rounded-xl" type="button">
                <Flag className="w-4 h-4 mr-2" />
                Report Group
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl"
                onClick={() => void onLeaveGroup?.(group.id)}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Leave Group
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
