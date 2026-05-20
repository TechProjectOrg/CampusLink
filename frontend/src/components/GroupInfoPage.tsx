import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UIEvent } from 'react';
import { ArrowLeft, Calendar, Crown, Flag, Loader2, LogOut, MoreVertical, Shield, UserMinus, UserPlus, Users } from 'lucide-react';
import { Student } from '../types';
import type { GroupChatDetailsApi } from '../lib/chatApi';
import type { ReportTargetDescriptor } from './ReportDialog';
import { apiSearchAll, type SearchUserResult } from '../lib/networkApi';
import { fetchCachedValue } from '../cache/socialCache';
import { cacheKeys } from '../cache/keys';
import { cachePolicies } from '../cache/policies';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { ProfilePhotoUpload } from './ui/profile-photo-upload';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { useAuth } from '../context/AuthContext';

interface GroupInfoPageProps {
  group: GroupChatDetailsApi;
  students: Student[];
  connectedUsers: Student[];
  currentUserId: string;
  isLoading?: boolean;
  onBack: () => void;
  onViewProfile?: (studentId: string) => void;
  onLeaveGroup?: (groupId: string) => void | Promise<void>;
  onRemoveMember?: (groupId: string, memberId: string) => void | Promise<void>;
  onMakeAdmin?: (groupId: string, memberId: string) => void | Promise<void>;
  onRemoveAdmin?: (groupId: string, memberId: string) => void | Promise<void>;
  onAddMember?: (groupId: string, memberId: string) => void | Promise<void>;
  onDeleteGroup?: (groupId: string) => void | Promise<void>;
  onReportTarget?: (target: ReportTargetDescriptor) => void;
  onGroupPhotoChange?: (
    groupId: string,
    payload: { file?: File; previewUrl?: string; remove?: boolean },
  ) => Promise<void> | void;
  onGroupDescriptionSave?: (groupId: string, description: string) => Promise<void> | void;
}

export function GroupInfoPage({
  group,
  students,
  connectedUsers,
  currentUserId,
  isLoading = false,
  onBack,
  onViewProfile,
  onLeaveGroup,
  onRemoveMember,
  onMakeAdmin,
  onRemoveAdmin,
  onAddMember,
  onDeleteGroup,
  onReportTarget,
  onGroupPhotoChange,
  onGroupDescriptionSave,
}: GroupInfoPageProps) {
  const FEEDBACK_RESET_MS = 3000;
  const ADD_MEMBER_PAGE_SIZE = 5;
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState('');
  const [isAddMembersOpen, setIsAddMembersOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(group.description ?? '');
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [pendingAddIds, setPendingAddIds] = useState<string[]>([]);
  const [pendingRemoveIds, setPendingRemoveIds] = useState<string[]>([]);
  const [memberActionFeedback, setMemberActionFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [addMemberCandidates, setAddMemberCandidates] = useState<SearchUserResult[]>([]);
  const [isInitialCandidateLoad, setIsInitialCandidateLoad] = useState(false);
  const [isLoadingMoreCandidates, setIsLoadingMoreCandidates] = useState(false);
  const [hasMoreCandidates, setHasMoreCandidates] = useState(false);
  const [candidateOffset, setCandidateOffset] = useState(0);
  const auth = useAuth();

  const currentMember = group.members.find((member) => member.userId === currentUserId) ?? null;
  const isAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';
  const isOwner = currentMember?.role === 'owner';
  const normalizedAddMemberQuery = addMemberSearchQuery.trim();
  const isSearchMode = normalizedAddMemberQuery.length > 0;

  const studentLookup = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  );
  const activeMemberIds = useMemo(
    () => new Set(group.members.filter((member) => member.leftAt === null).map((member) => member.userId)),
    [group.members],
  );
  const activeMemberIdList = useMemo(
    () => Array.from(activeMemberIds).sort(),
    [activeMemberIds],
  );
  const availableConnectedCandidates = useMemo(
    () => connectedUsers
      .filter((user) => user.id !== currentUserId && !activeMemberIds.has(user.id))
      .map<SearchUserResult>((user) => ({
        userId: user.id,
        displayName: user.displayName ?? user.name,
        username: user.username,
        email: user.email,
        profilePictureUrl: user.avatar ?? null,
        isPrivate: user.accountType === 'private',
        type: 'student',
        branch: user.branch ?? null,
        year: user.year ?? null,
      })),
    [activeMemberIds, connectedUsers, currentUserId],
  );

  const filteredMembers = useMemo(() => {
    const normalizedQuery = memberSearchQuery.trim().toLowerCase();
    const roleRank: Record<string, number> = {
      owner: 0,
      admin: 1,
      member: 2,
    };

    return group.members.filter((member) => {
      if (!normalizedQuery) return true;
      return member.username.toLowerCase().includes(normalizedQuery)
        || (member.displayName ?? '').toLowerCase().includes(normalizedQuery);
    }).sort((left, right) => {
      const rankDiff = (roleRank[left.role] ?? 99) - (roleRank[right.role] ?? 99);
      if (rankDiff !== 0) return rankDiff;
      return left.username.localeCompare(right.username);
    });
  }, [group.members, memberSearchQuery]);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const formatMemberSubtitle = (
    member: GroupChatDetailsApi['members'][number],
    student?: Student,
  ) => {
    const memberBranch = typeof member.branch === 'string' ? member.branch.trim() : '';
    const memberYear = Number(member.year);
    const fallbackBranch = typeof student?.branch === 'string' ? student.branch.trim() : '';
    const fallbackYear = Number(student?.year);

    const branch = memberBranch || fallbackBranch;
    const year = Number.isFinite(memberYear) && memberYear > 0 ? memberYear : fallbackYear;
    const hasKnownBranch = branch.length > 0 && branch.toLowerCase() !== 'unknown';
    const hasValidYear = Number.isFinite(year) && year > 0;
    if (hasKnownBranch && hasValidYear) {
      return `${branch} - Year ${year}`;
    }
    return 'Group member';
  };

  useEffect(() => {
    setDescriptionDraft(group.description ?? '');
  }, [group.description]);

  useEffect(() => {
    setPendingAddIds((current) => current.filter((userId) => !activeMemberIds.has(userId)));
  }, [activeMemberIds]);

  useEffect(() => {
    setAddMemberCandidates((current) => current.filter((candidate) => !activeMemberIds.has(candidate.userId)));
  }, [activeMemberIds]);

  useEffect(() => {
    setPendingRemoveIds((current) => current.filter((userId) => activeMemberIds.has(userId)));
  }, [activeMemberIds]);

  useEffect(() => {
    if (!memberActionFeedback) return;

    const timeoutId = window.setTimeout(() => {
      setMemberActionFeedback(null);
    }, FEEDBACK_RESET_MS);

    return () => window.clearTimeout(timeoutId);
  }, [memberActionFeedback]);

  const loadSearchCandidates = useCallback(async (options: {
    query: string;
    offset: number;
    reset: boolean;
  }) => {
    const token = auth.session?.token;
    if (!token || !isAdmin || !isAddMembersOpen) return;

    if (options.reset) {
      setIsInitialCandidateLoad(true);
    } else {
      setIsLoadingMoreCandidates(true);
    }

    try {
      const trimmedQuery = options.query.trim();
      const result = await fetchCachedValue({
        key: cacheKeys.page.searchAll(trimmedQuery, options.offset, 0, 0),
        policy: cachePolicies.search,
        fetcher: () => apiSearchAll(trimmedQuery, token, ADD_MEMBER_PAGE_SIZE, 1, 1, options.offset, 0, 0),
      });
      const rows = result.users.filter((candidate) => !activeMemberIds.has(candidate.userId));

      setAddMemberCandidates((current) => {
        if (options.reset) return rows;
        const merged = new Map<string, SearchUserResult>();
        current.forEach((candidate) => merged.set(candidate.userId, candidate));
        rows.forEach((candidate) => merged.set(candidate.userId, candidate));
        return Array.from(merged.values());
      });
      setCandidateOffset(options.offset + rows.length);
      setHasMoreCandidates(rows.length === ADD_MEMBER_PAGE_SIZE);
    } catch (err) {
      console.error('Failed to load add-member candidates:', err);
      if (options.reset) {
        setAddMemberCandidates([]);
      }
      setHasMoreCandidates(false);
      setMemberActionFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to load people to add.',
      });
    } finally {
      setIsInitialCandidateLoad(false);
      setIsLoadingMoreCandidates(false);
    }
  }, [
    ADD_MEMBER_PAGE_SIZE,
    availableConnectedCandidates,
    activeMemberIds,
    auth.session?.token,
    isAdmin,
    isAddMembersOpen,
  ]);

  useEffect(() => {
    if (!isAdmin || !isAddMembersOpen) return;

    setCandidateOffset(0);
    setHasMoreCandidates(false);
    if (!isSearchMode) {
      const nextRows = availableConnectedCandidates.slice(0, ADD_MEMBER_PAGE_SIZE);
      setAddMemberCandidates(nextRows);
      setCandidateOffset(nextRows.length);
      setHasMoreCandidates(nextRows.length < availableConnectedCandidates.length);
      setIsInitialCandidateLoad(false);
      setIsLoadingMoreCandidates(false);
      return;
    }

    const timerId = window.setTimeout(() => {
      void loadSearchCandidates({ query: normalizedAddMemberQuery, offset: 0, reset: true });
    }, 350);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [
    ADD_MEMBER_PAGE_SIZE,
    availableConnectedCandidates,
    group.id,
    isAddMembersOpen,
    isAdmin,
    isSearchMode,
    loadSearchCandidates,
    normalizedAddMemberQuery,
  ]);

  const handleAddMemberListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreCandidates || isInitialCandidateLoad || isLoadingMoreCandidates) return;

    const element = event.currentTarget;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom > 48) return;

    if (!isSearchMode) {
      const nextRows = availableConnectedCandidates.slice(candidateOffset, candidateOffset + ADD_MEMBER_PAGE_SIZE);
      setAddMemberCandidates((current) => [...current, ...nextRows]);
      setCandidateOffset((current) => current + nextRows.length);
      setHasMoreCandidates(candidateOffset + nextRows.length < availableConnectedCandidates.length);
      return;
    }

    void loadSearchCandidates({
      query: normalizedAddMemberQuery,
      offset: candidateOffset,
      reset: false,
    });
  }, [
    ADD_MEMBER_PAGE_SIZE,
    availableConnectedCandidates,
    candidateOffset,
    hasMoreCandidates,
    isInitialCandidateLoad,
    isLoadingMoreCandidates,
    isSearchMode,
    loadSearchCandidates,
    normalizedAddMemberQuery,
  ]);

  const handleSaveDescription = async () => {
    const normalized = descriptionDraft.trim();
    const current = (group.description ?? '').trim();
    if (normalized === current) return;

    setIsSavingDescription(true);
    try {
      await onGroupDescriptionSave?.(group.id, normalized);
    } catch (err) {
      console.error('Failed to update group description:', err);
      window.alert(err instanceof Error ? err.message : 'Failed to update group description');
    } finally {
      setIsSavingDescription(false);
    }
  };

  const handleAddMember = async (studentId: string) => {
    if (!onAddMember || pendingAddIds.includes(studentId)) return;

    setPendingAddIds((current) => [...current, studentId]);
    setMemberActionFeedback(null);
    const candidate = addMemberCandidates.find((entry) => entry.userId === studentId);
    const student = studentLookup.get(studentId);
    try {
      await onAddMember(group.id, studentId);
      setAddMemberCandidates((current) => current.filter((entry) => entry.userId !== studentId));
      setCandidateOffset((current) => Math.max(0, current - 1));
      setMemberActionFeedback({
        kind: 'success',
        message: `${candidate?.displayName ?? student?.displayName ?? student?.name ?? 'Member'} added to the group.`,
      });
    } catch (err) {
      setMemberActionFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to add member.',
      });
    } finally {
      setPendingAddIds((current) => current.filter((userId) => userId !== studentId));
    }
  };

  const handleRemoveMember = async (
    memberId: string,
    memberName: string,
  ) => {
    if (!onRemoveMember || pendingRemoveIds.includes(memberId)) return;

    setPendingRemoveIds((current) => [...current, memberId]);
    setMemberActionFeedback(null);
    try {
      await onRemoveMember(group.id, memberId);
      setMemberActionFeedback({
        kind: 'success',
        message: `${memberName} removed from the group.`,
      });
    } catch (err) {
      setMemberActionFeedback({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Failed to remove member.',
      });
    } finally {
      setPendingRemoveIds((current) => current.filter((userId) => userId !== memberId));
    }
  };

  const hasDescriptionChanges = descriptionDraft.trim() !== (group.description ?? '').trim();

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
              <ProfilePhotoUpload
                currentPhoto={group.avatarUrl ?? undefined}
                name={group.name}
                hasCustomPhoto={Boolean(group.avatarUrl)}
                editable={isAdmin}
                size="lg"
                onPhotoChange={(payload) => onGroupPhotoChange?.(group.id, payload)}
              />
              <h2 className="text-gray-900 mt-4">{group.name}</h2>
              {isAdmin ? (
                <div className="mt-3 w-full max-w-md space-y-2">
                  <Input
                    value={descriptionDraft}
                    onChange={(event) => setDescriptionDraft(event.target.value)}
                    placeholder="Add group description"
                    className="rounded-xl text-center"
                    maxLength={280}
                  />
                  {hasDescriptionChanges && (
                    <Button
                      size="sm"
                      onClick={() => void handleSaveDescription()}
                      disabled={isSavingDescription}
                      className="w-full rounded-xl"
                    >
                      {isSavingDescription ? 'Saving...' : 'Save Description'}
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-gray-600 text-center max-w-md mt-2">
                  {group.description || 'No group description yet.'}
                </p>
              )}
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
                  <Badge variant="secondary">{addMemberCandidates.length} shown</Badge>
                </div>
                {memberActionFeedback && (
                  <div
                    className={`rounded-xl px-3 py-2 text-sm ${
                      memberActionFeedback.kind === 'success'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-red-200 bg-red-50 text-red-700'
                    }`}
                  >
                    {memberActionFeedback.message}
                  </div>
                )}
                <Input
                  value={addMemberSearchQuery}
                  onChange={(event) => setAddMemberSearchQuery(event.target.value)}
                  placeholder="Search students to add"
                  className="rounded-xl"
                />
                <div onScroll={handleAddMemberListScroll} className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {isInitialCandidateLoad ? (
                    <LoadingIndicator
                      label={isSearchMode ? 'Searching users...' : 'Loading connected users...'}
                      className="py-4"
                      size={20}
                    />
                  ) : addMemberCandidates.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      {isSearchMode ? 'No users found for this search.' : 'No connected users available to add.'}
                    </p>
                  ) : (
                    addMemberCandidates.map((candidate) => (
                      <div key={candidate.userId} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3">
                        <button
                          type="button"
                          onClick={() => onViewProfile?.(candidate.userId)}
                          className="flex items-center gap-3 text-left flex-1"
                        >
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={candidate.profilePictureUrl ?? undefined} />
                            <AvatarFallback>{(candidate.displayName ?? candidate.username)[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{candidate.displayName}</p>
                            <p className="text-xs text-gray-500">@{candidate.username}</p>
                            <p className="text-xs text-gray-500">
                              {candidate.branch && candidate.year
                                ? `${candidate.branch} - Year ${candidate.year}`
                                : candidate.branch
                                  ? candidate.branch
                                  : candidate.year
                                    ? `Year ${candidate.year}`
                                    : 'Campus connection'}
                            </p>
                          </div>
                        </button>
                        <Button
                          size="sm"
                          className="rounded-full"
                          disabled={pendingAddIds.includes(candidate.userId)}
                          onClick={() => void handleAddMember(candidate.userId)}
                        >
                          {pendingAddIds.includes(candidate.userId) ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Adding...
                            </span>
                          ) : 'Add'}
                        </Button>
                      </div>
                    ))
                  )}
                  {isLoadingMoreCandidates ? (
                    <LoadingIndicator label="Loading more..." className="py-2 text-xs" size={18} />
                  ) : null}
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
                  {currentMember.role === 'owner' ? 'owner (admin)' : currentMember.role}
                </Badge>
              )}
            </div>
            <Input
              value={memberSearchQuery}
              onChange={(event) => setMemberSearchQuery(event.target.value)}
              placeholder="Search group members"
              className="rounded-xl"
            />
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <LoadingIndicator label="Loading members..." className="justify-start py-1" size={20} />
            ) : filteredMembers.length === 0 ? (
              <p className="text-sm text-gray-500">No members match this search.</p>
            ) : (
              filteredMembers.map((member) => {
                const linkedStudent = studentLookup.get(member.userId);
                const isCurrentUser = member.userId === currentUserId;
                const isOwner = member.role === 'owner';
                const canModerate = isAdmin && !isCurrentUser && !isOwner;
                const canDemoteAdmin = currentMember?.role === 'owner' && member.role === 'admin' && !isCurrentUser;
                const isRemovingMember = pendingRemoveIds.includes(member.userId);
                const memberName = member.displayName ?? member.username;

                return (
                  <div key={member.userId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <button
                      type="button"
                      onClick={() => onViewProfile?.(member.userId)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <Avatar className="w-12 h-12 ring-2 ring-primary/20">
                        <AvatarImage src={member.avatarUrl ?? linkedStudent?.avatar} />
                        <AvatarFallback>{(member.displayName ?? member.username)[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            <div>{member.displayName ?? member.username}</div>
                            <div className="text-xs text-gray-500">@{member.username}</div>
                            {isCurrentUser ? ' (You)' : ''}
                          </p>
                          {isOwner ? (
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
                              <Crown className="w-3 h-3 mr-1" />
                              Owner Admin
                            </Badge>
                          ) : member.role === 'admin' ? (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-gray-500">
                          {formatMemberSubtitle(member, linkedStudent)}
                        </p>
                      </div>
                    </button>

                    {canModerate && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-9 w-9 rounded-full p-0" disabled={isRemovingMember}>
                            {isRemovingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {member.role === 'member' && (
                            <DropdownMenuItem onClick={() => void onMakeAdmin?.(group.id, member.userId)}>
                              <Shield className="w-4 h-4 mr-2" />
                              Make Admin
                            </DropdownMenuItem>
                          )}
                          {canDemoteAdmin && (
                            <DropdownMenuItem onClick={() => void onRemoveAdmin?.(group.id, member.userId)}>
                              <Shield className="w-4 h-4 mr-2" />
                              Remove Admin
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={isRemovingMember}
                            onClick={() => void handleRemoveMember(member.userId, memberName)}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserMinus className="w-4 h-4 mr-2" />
                            {isRemovingMember ? 'Removing...' : 'Remove'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
              {isOwner && (
                <Button
                  variant="outline"
                  className="w-full justify-start border-destructive/20 text-destructive hover:bg-destructive/10 rounded-xl"
                  onClick={() => void onDeleteGroup?.(group.id)}
                >
                  <UserMinus className="w-4 h-4 mr-2" />
                  Delete Group
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full justify-start rounded-xl"
                type="button"
                onClick={() => onReportTarget?.({
                  targetType: 'club',
                  targetId: group.id,
                  label: `Group chat: ${group.name}`,
                  preview: group.description ?? 'Group chat',
                })}
              >
                <Flag className="w-4 h-4 mr-2" />
                Report Group
              </Button>
              <p className="text-xs text-gray-500 px-1">
                Use the Add Members action above for membership changes. Delete and report options stay here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-primary/10 rounded-2xl shadow-lg">
            <CardHeader>
              <h3 className="text-gray-900">Member Settings</h3>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start rounded-xl"
                type="button"
                onClick={() => onReportTarget?.({
                  targetType: 'club',
                  targetId: group.id,
                  label: `Group chat: ${group.name}`,
                  preview: group.description ?? 'Group chat',
                })}
              >
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
