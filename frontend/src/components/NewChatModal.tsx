import { useState } from 'react';
import { X, Search, Users, User, Check } from 'lucide-react';
import { Student } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  currentUserId: string;
  onStartChat: (studentId: string) => void;
  onCreateGroup: (name: string, description: string, memberIds: string[]) => void;
}

export function NewChatModal({
  isOpen,
  onClose,
  students,
  currentUserId,
  onStartChat,
  onCreateGroup
}: NewChatModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'person' | 'group'>('person');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');

  // Filter students excluding current user
  const availableStudents = students.filter(s => s.id !== currentUserId);

  // Filter students based on search
  const filteredStudents = availableStudents.filter(student =>
    student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.branch.toLowerCase().includes(searchQuery.toLowerCase()) ||
    student.skills.some(skill => skill.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleMemberSelection = (studentId: string) => {
    setSelectedMembers(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedMembers.length > 0) {
      onCreateGroup(groupName, groupDescription, selectedMembers);
      handleClose();
    }
  };

  const handleStartChat = (studentId: string) => {
    onStartChat(studentId);
    handleClose();
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedMembers([]);
    setGroupName('');
    setGroupDescription('');
    setSelectedTab('person');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>New Message</DialogTitle>
          <DialogDescription>Select a person or create a group to start a chat.</DialogDescription>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'person' | 'group')} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6">
            <TabsList className="w-full grid grid-cols-2 mt-4">
              <TabsTrigger value="person" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Person
              </TabsTrigger>
              <TabsTrigger value="group" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Group
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Search Bar */}
          <div className="px-6 pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder={selectedTab === 'person' ? 'Search people...' : 'Search members...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl"
              />
            </div>
          </div>

          {/* Person Tab */}
          <TabsContent value="person" className="flex-1 overflow-y-auto mt-4">
            <div className="px-6 pb-6">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">No students found</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredStudents.map(student => (
                    <button
                      key={student.id}
                      onClick={() => handleStartChat(student.id)}
                      className="w-full p-3 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-3 text-left"
                    >
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={student.avatar} />
                        <AvatarFallback>{student.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{student.name}</p>
                        <p className="text-xs text-gray-500">{student.branch} • Year {student.year}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Group Tab */}
          <TabsContent value="group" className="flex-1 flex flex-col overflow-y-auto mt-4">
            <div className="px-6 pb-6 flex-1 flex flex-col gap-4">
              {/* Group Info */}
              <div className="space-y-3">
                <Input
                  placeholder="Group name (required)"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="rounded-xl"
                />
                <Input
                  placeholder="Group description (optional)"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              {/* Selected Members */}
              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-3 border-b">
                  {selectedMembers.map(memberId => {
                    const member = students.find(s => s.id === memberId);
                    if (!member) return null;
                    return (
                      <Badge
                        key={memberId}
                        className="bg-primary/10 text-primary border-primary/20 pr-1 flex items-center gap-1"
                      >
                        {member.name}
                        <button
                          onClick={() => toggleMemberSelection(memberId)}
                          className="hover:bg-primary/20 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Member Selection */}
              <div className="flex-1 overflow-y-auto space-y-2">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Add members ({selectedMembers.length} selected)
                </p>
                {filteredStudents.map(student => {
                  const isSelected = selectedMembers.includes(student.id);
                  return (
                    <button
                      key={student.id}
                      onClick={() => toggleMemberSelection(student.id)}
                      className={`w-full p-3 rounded-xl transition-colors flex items-center gap-3 text-left ${
                        isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-gray-50'
                      }`}
                    >
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={student.avatar} />
                        <AvatarFallback>{student.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{student.name}</p>
                        <p className="text-xs text-gray-500">{student.branch} • Year {student.year}</p>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedMembers.length > 0 && (
              <div className="sticky bottom-0 bg-white p-6 border-t">
                <Button
                  onClick={handleCreateGroup}
                  disabled={!groupName.trim() || selectedMembers.length === 0}
                  className="w-full gradient-primary rounded-xl"
                >
                  Create Group ({selectedMembers.length} members)
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}