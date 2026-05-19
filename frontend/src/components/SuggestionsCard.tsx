import { useMemo } from 'react';
import { TrendingUp, Users, X } from 'lucide-react';
import type { Opportunity, Student } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

interface SuggestionsCardProps {
  students: Student[];
  opportunities: Opportunity[];
  currentUserId: string;
  followGraph: FollowGraph;
  suggestedUserIds?: string[];
  onFollow: (targetUserId: string) => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;
  onDismissSuggestion: (targetUserId: string) => void;
  onViewProfile: (studentId: string) => void;
}

export function SuggestionsCard({
  students,
  opportunities,
  currentUserId,
  followGraph,
  suggestedUserIds = [],
  onFollow,
  onUnfollow,
  onCancelRequest,
  onDismissSuggestion,
  onViewProfile,
}: SuggestionsCardProps) {
  const currentUser = students.find((s) => s.id === currentUserId);

  const starterHashtags = [
    { hashtag: 'PlacementPrep',   postCount: 1 },
    { hashtag: 'HackathonSeason', postCount: 1 },
    { hashtag: 'OpenSource',      postCount: 1 },
  ];

  const suggestedStudents = useMemo(() => {
    if (!currentUser) return [];

    if (suggestedUserIds.length > 0) {
      const fromApi = suggestedUserIds
        .map((id) => students.find((s) => s.id === id))
        .filter((s): s is Student => Boolean(s))
        .filter((s) => {
          if (s.id === currentUserId) return false;
          const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(s.id);
          const isRequested = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(s.id);
          return !isFollowing && !isRequested;
        })
        .map((s) => ({
          student: s,
          sharedSkills: s.skills.filter((sk) => currentUser.skills.includes(sk)),
          sharedInterests: s.interests.filter((i) => currentUser.interests.includes(i)),
        }));

      if (fromApi.length > 0) return fromApi.slice(0, 4);
    }

    const candidates = students
      .filter((s) => {
        if (s.id === currentUserId) return false;
        const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(s.id);
        const isRequested = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(s.id);
        return !isFollowing && !isRequested;
      })
      .map((s) => {
        const sharedSkills = s.skills.filter((sk) => currentUser.skills.includes(sk));
        const sharedInterests = s.interests.filter((i) => currentUser.interests.includes(i));
        const branchMatch = s.branch === currentUser.branch;
        const yearMatch = s.year === currentUser.year;
        const score = (branchMatch ? 4 : 0) + (yearMatch ? 2 : 0) + sharedSkills.length * 2 + sharedInterests.length;
        const createdAtMs = s.createdAt ? Date.parse(s.createdAt) : Number.NaN;
        return { student: s, sharedSkills, sharedInterests, branchMatch, yearMatch, score, createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0 };
      })
      .sort((a, b) => {
        if (b.branchMatch !== a.branchMatch) return Number(b.branchMatch) - Number(a.branchMatch);
        if (b.yearMatch !== a.yearMatch) return Number(b.yearMatch) - Number(a.yearMatch);
        if (b.score !== a.score) return b.score - a.score;
        if (b.sharedSkills.length !== a.sharedSkills.length) return b.sharedSkills.length - a.sharedSkills.length;
        if (b.sharedInterests.length !== a.sharedInterests.length) return b.sharedInterests.length - a.sharedInterests.length;
        if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
        return a.student.name.localeCompare(b.student.name);
      });

    if ((candidates[0]?.score ?? 0) < 3) {
      return candidates
        .slice()
        .sort((a, b) => {
          if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
          return a.student.name.localeCompare(b.student.name);
        })
        .slice(0, 4);
    }

    return candidates.slice(0, 4);
  }, [currentUser, currentUserId, followGraph.followingByUserId, followGraph.outgoingRequestsByUserId, students, suggestedUserIds]);

  const trendingTopics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const opp of opportunities) {
      for (const tag of opp.tags ?? []) {
        const n = tag.trim().replace(/^#+/, '');
        if (!n) continue;
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
    const real = Array.from(counts.entries())
      .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
      .slice(0, 3)
      .map(([hashtag, postCount]) => ({ hashtag, postCount }));
    return real.length > 0 ? real : starterHashtags;
  }, [opportunities]);

  return (
    <div className="space-y-3">
      {/* ── Suggested For You ── */}
      {suggestedStudents.length > 0 && (
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm animate-slide-in-up">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-3.5 w-3.5 text-primary" />
          </span>
          <span className="text-sm text-slate-800 tracking-tight">Suggested For You</span>
        </div>

        {/* Suggestion rows */}
        <div className="divide-y divide-slate-100">
          {suggestedStudents.map(({ student }) => {
              const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(student.id);
              const isFollower = (followGraph.followersByUserId[currentUserId] ?? []).includes(student.id);
              const requestStatus = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id)
                ? 'requested'
                : 'none';

              return (
                <div
                  key={student.id}
                  className="group relative flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-slate-50/80"
                >
                  {/* Avatar */}
                  <button
                    type="button"
                    aria-label={`View ${student.name}'s profile`}
                    onClick={() => onViewProfile(student.id)}
                    className="relative shrink-0 pt-0.5"
                  >
                    <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/50 via-sky-400/30 to-indigo-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200 scale-110" />
                    <Avatar className="h-8 w-8 ring-1 ring-white shadow-sm">
                      <AvatarImage src={student.avatar} alt={student.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {student.name[0]}
                      </AvatarFallback>
                    </Avatar>
                  </button>

                  {/* Content column */}
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    {/* Top row: Name & X */}
                    <div className="flex items-start justify-between gap-2 w-full">
                      <div className="flex-1 min-w-0">
                        <p
                          className="cursor-pointer truncate text-sm text-slate-800 transition-colors group-hover:text-primary"
                          onClick={() => onViewProfile(student.id)}
                          title={student.name}
                        >
                          {student.name}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Dismiss ${student.name}`}
                        onClick={() => onDismissSuggestion(student.id)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Bottom section: Branch/Year & Follow Button */}
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-xs text-gray-600" title={`${student.branch} · Y${student.year}`}>
                        <span className="truncate">{student.branch}</span>
                        <span className="text-gray-400 mx-0.5">·</span>
                        <span className="text-secondary">Y{student.year}</span>
                      </p>
                      <div className="shrink-0">
                        <FollowButton
                          compact
                          targetName={student.name}
                          accountType={student.accountType}
                          isFollowing={isFollowing}
                          isFollower={isFollower}
                          requestStatus={requestStatus}
                          onFollow={() => onFollow(student.id)}
                          onUnfollow={() => onUnfollow(student.id)}
                          onCancelRequest={() => onCancelRequest(student.id)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
      )}

      {/* ── Trending Topics ── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-sm animate-slide-in-up" style={{ animationDelay: '80ms' }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-secondary/10">
            <TrendingUp className="h-3.5 w-3.5 text-secondary" />
          </span>
          <span className="text-sm text-slate-800 tracking-tight">Trending Topics</span>
        </div>

        {/* Topic rows */}
        <div className="divide-y divide-slate-100">
          {trendingTopics.length > 0 ? (
            trendingTopics.map((topic) => (
              <div
                key={topic.hashtag}
                className="px-4 py-2.5 transition-colors hover:bg-slate-50/80 cursor-default"
              >
                <p className="truncate text-sm text-slate-700">#{topic.hashtag}</p>
                <p className="text-xs text-gray-500 mt-0.5">{topic.postCount} {topic.postCount === 1 ? 'post' : 'posts'}</p>
              </div>
            ))
          ) : (
            <p className="px-4 py-5 text-xs text-slate-400 text-center">
              No hashtags in the current feed yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
