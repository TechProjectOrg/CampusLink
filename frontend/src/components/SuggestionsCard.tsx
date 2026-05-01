import { useMemo } from 'react';
import { TrendingUp, Users } from 'lucide-react';
import type { Opportunity, Student } from '../types';
import type { FollowGraph } from '../App';
import { FollowButton } from './network/FollowButton';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

interface SuggestionsCardProps {
  students: Student[];
  opportunities: Opportunity[];
  currentUserId: string;
  followGraph: FollowGraph;
  onFollow: (targetUserId: string) => void;
  onUnfollow: (targetUserId: string) => void;
  onCancelRequest: (targetUserId: string) => void;
  onViewProfile: (studentId: string) => void;
}

export function SuggestionsCard({
  students,
  opportunities,
  currentUserId,
  followGraph,
  onFollow,
  onUnfollow,
  onCancelRequest,
  onViewProfile,
}: SuggestionsCardProps) {
  const currentUser = students.find((student) => student.id === currentUserId);

  const starterHashtags = [
    { hashtag: 'PlacementPrep', postCount: 1, badge: 'Starter' },
    { hashtag: 'HackathonSeason', postCount: 1, badge: 'Starter' },
    { hashtag: 'OpenSource', postCount: 1, badge: 'Starter' },
  ];

  const suggestedStudents = useMemo(() => {
    if (!currentUser) return [];

    const candidates = students
      .filter((student) => {
        if (student.id === currentUserId) return false;
        const isFollowing = (followGraph.followingByUserId[currentUserId] ?? []).includes(student.id);
        const isRequested = (followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id);
        return !isFollowing && !isRequested;
      })
      .map((student) => {
        const sharedSkills = student.skills.filter((skill) => currentUser.skills.includes(skill));
        const sharedInterests = student.interests.filter((interest) => currentUser.interests.includes(interest));
        const branchMatch = student.branch === currentUser.branch;
        const yearMatch = student.year === currentUser.year;
        const score = (branchMatch ? 4 : 0)
          + (yearMatch ? 2 : 0)
          + sharedSkills.length * 2
          + sharedInterests.length;
        const createdAtMs = student.createdAt ? Date.parse(student.createdAt) : Number.NaN;

        return {
          student,
          sharedSkills,
          sharedInterests,
          branchMatch,
          yearMatch,
          score,
          createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        };
      })
      .sort((left, right) => {
        if (right.branchMatch !== left.branchMatch) return Number(right.branchMatch) - Number(left.branchMatch);
        if (right.yearMatch !== left.yearMatch) return Number(right.yearMatch) - Number(left.yearMatch);
        if (right.score !== left.score) return right.score - left.score;
        if (right.sharedSkills.length !== left.sharedSkills.length) return right.sharedSkills.length - left.sharedSkills.length;
        if (right.sharedInterests.length !== left.sharedInterests.length) return right.sharedInterests.length - left.sharedInterests.length;
        if (right.createdAtMs !== left.createdAtMs) return right.createdAtMs - left.createdAtMs;
        return left.student.name.localeCompare(right.student.name);
      });

    if (candidates[0]?.score ?? 0 < 3) {
      return candidates
        .slice()
        .sort((left, right) => {
          if (right.createdAtMs !== left.createdAtMs) return right.createdAtMs - left.createdAtMs;
          return left.student.name.localeCompare(right.student.name);
        })
        .slice(0, 3);
    }

    return candidates.slice(0, 3);
  }, [currentUser, currentUserId, followGraph.followingByUserId, followGraph.outgoingRequestsByUserId, students]);

  const trendingTopics = useMemo(() => {
    const counts = new Map<string, number>();

    for (const opportunity of opportunities) {
      for (const tag of opportunity.tags ?? []) {
        const normalized = tag.trim().replace(/^#+/, '');
        if (!normalized) continue;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }

    const realTopics = Array.from(counts.entries())
      .sort((left, right) => {
        if (right[1] !== left[1]) return right[1] - left[1];
        return left[0].localeCompare(right[0]);
      })
      .slice(0, 3)
      .map(([hashtag, postCount], index) => ({
        hashtag,
        postCount,
        badge: index === 0 ? 'Hot' : index === 1 ? 'Trending' : 'Rising',
      }));

      return realTopics.length > 0 ? realTopics : starterHashtags;
  }, [opportunities]);

  return (
    <div className="space-y-4">
      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <h4 className="text-gray-900">Suggested For You</h4>
          </div>

          <div className="space-y-4">
            {suggestedStudents.length > 0 ? suggestedStudents.map(({ student, sharedSkills, sharedInterests }) => (
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
                    <p className="text-xs text-gray-500 mt-1">
                      {sharedSkills.length > 0
                        ? `Shared skills: ${sharedSkills.slice(0, 2).join(', ')}`
                        : sharedInterests.length > 0
                          ? `Shared interests: ${sharedInterests.slice(0, 2).join(', ')}`
                          : `${student.year}th year`}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {student.skills.slice(0, 2).map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs border-primary/20 text-primary">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="w-full">
                  <FollowButton
                    targetName={student.name}
                    accountType={student.accountType}
                    isFollowing={(followGraph.followingByUserId[currentUserId] ?? []).includes(student.id)}
                    isFollower={(followGraph.followersByUserId[currentUserId] ?? []).includes(student.id)}
                    requestStatus={(followGraph.outgoingRequestsByUserId[currentUserId] ?? []).includes(student.id) ? 'requested' : 'none'}
                    onFollow={() => onFollow(student.id)}
                    onUnfollow={() => onUnfollow(student.id)}
                    onCancelRequest={() => onCancelRequest(student.id)}
                  />
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                We’ll show people here once there are more profiles to compare.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/10 rounded-2xl shadow-lg hover-lift animate-slide-in-up" style={{ animationDelay: '100ms' }}>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-secondary" />
            </div>
            <h4 className="text-gray-900">Trending Topics</h4>
          </div>

          <div className="space-y-3">
            {trendingTopics.length > 0 ? trendingTopics.map((topic) => (
              <div key={topic.hashtag} className="w-full rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-gray-900">#{topic.hashtag}</p>
                  <Badge className="bg-secondary/10 text-secondary border-secondary/20">
                    {topic.badge}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-1">{topic.postCount} posts</p>
              </div>
            )) : (
              <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
                No hashtags yet in the current feed.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
