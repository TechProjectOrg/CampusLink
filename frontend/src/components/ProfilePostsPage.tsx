import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { Student, Opportunity } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiFetchProfilePosts, type UserPost } from '../lib/postsApi';
import { OpportunityCard } from './OpportunityCard';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { LoadingIndicator } from './ui/LoadingIndicator';

interface ProfilePostsPageProps {
  student: Student;
  currentUserId: string;
  isOwnProfile: boolean;
  onBack: () => void;
  onLike: (opportunityId: string) => void;
  onSave: (opportunityId: string) => void;
  onComment: (opportunityId: string, comment: string) => void;
  onReply: (commentId: string, comment: string) => void;
  onLikeComment: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onEditPost: (postId: string, updates: Partial<Opportunity>) => void;
  onDeletePost: (postId: string) => void;
  onOpenPost: (post: Opportunity) => void;
  onViewProfile: (studentId: string) => void;
}

function mapApiPostToOpportunity(post: UserPost, student: Student): Opportunity {
  let mappedType: Opportunity['type'] = 'general';
  if (post.postType === 'event') {
    mappedType = 'event';
  } else if (post.postType === 'club_activity') {
    mappedType = 'club';
  } else if (post.postType === 'opportunity') {
    mappedType = (post.opportunityType ?? 'event') as Opportunity['type'];
  }

  return {
    id: post.id,
    authorId: post.authorUserId || student.id,
    authorName: post.authorUsername || student.name,
    authorAvatar: post.authorProfilePictureUrl || student.avatar,
    clubId: post.clubId,
    clubName: post.clubName,
    clubSlug: post.clubSlug,
    clubAvatarUrl: post.clubAvatarUrl,
    type: mappedType,
    title: post.title ?? '',
    description: post.contentText ?? '',
    date: post.createdAt,
    company: post.company ?? undefined,
    deadline: post.deadline ?? undefined,
    stipend: post.stipend ?? undefined,
    duration: post.duration ?? undefined,
    location: post.location ?? undefined,
    link: post.externalUrl ?? undefined,
    image: post.media[0]?.mediaUrl,
    tags: post.hashtags,
    likes: [],
    comments: (post.comments ?? []).map((comment) => ({
      id: comment.id,
      postId: comment.postId,
      authorId: comment.authorUserId,
      authorName: comment.authorUsername,
      authorAvatar: comment.authorProfilePictureUrl ?? '',
      content: comment.content,
      timestamp: comment.createdAt,
      parentCommentId: comment.parentCommentId,
      likeCount: comment.likeCount,
      replyCount: comment.replyCount,
      isLikedByMe: comment.isLikedByMe,
      canDelete: comment.canDelete,
      replies: comment.replies.map((reply) => ({
        id: reply.id,
        postId: reply.postId,
        authorId: reply.authorUserId,
        authorName: reply.authorUsername,
        authorAvatar: reply.authorProfilePictureUrl ?? '',
        content: reply.content,
        timestamp: reply.createdAt,
        parentCommentId: reply.parentCommentId,
        likeCount: reply.likeCount,
        replyCount: reply.replyCount,
        isLikedByMe: reply.isLikedByMe,
        canDelete: reply.canDelete,
        replies: [],
      })),
    })),
    saved: [],
    likeCount: post.likeCount,
    saveCount: post.saveCount,
    commentCount: post.commentCount,
    isLikedByMe: post.isLikedByMe,
    isSavedByMe: post.isSavedByMe,
    canEdit: post.canEdit,
    canDelete: post.canDelete,
  };
}

export function ProfilePostsPage({
  student,
  currentUserId,
  isOwnProfile,
  onBack,
  onLike,
  onSave,
  onComment,
  onReply,
  onLikeComment,
  onDeleteComment,
  onEditPost,
  onDeletePost,
  onOpenPost,
  onViewProfile,
}: ProfilePostsPageProps) {
  const auth = useAuth();
  const [posts, setPosts] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiFetchProfilePosts(student.id, auth.session?.token)
      .then((list) => {
        if (!cancelled) {
          setPosts(list.map((post) => mapApiPostToOpportunity(post, student)));
        }
      })
      .catch(() => {
        if (!cancelled) setPosts([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [student, auth.session?.token]);

  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);
  const hasMore = visibleCount < posts.length;

  return (
    <main className="min-h-screen bg-slate-50 pb-24 md:pb-8">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <header className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-4 rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-4 ring-slate-100">
              <AvatarImage src={student.avatar} alt={student.name} />
              <AvatarFallback>{student.name[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">Posts</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{student.name}</h1>
              <p className="mt-1 text-sm text-slate-500">{student.headline || student.branch}</p>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <LoadingIndicator label="Loading posts..." />
          </div>
        ) : visiblePosts.length > 0 ? (
          <div className="space-y-5">
            {visiblePosts.map((post) => (
              <OpportunityCard
                key={post.id}
                opportunity={post}
                currentUserId={currentUserId}
                showManagementControls={isOwnProfile}
                onLike={onLike}
                onSave={onSave}
                onComment={onComment}
                onReply={onReply}
                onLikeComment={onLikeComment}
                onDeleteComment={onDeleteComment}
                onEditPost={onEditPost}
                onDeletePost={onDeletePost}
                onOpenPost={onOpenPost}
                onViewProfile={onViewProfile}
              />
            ))}
            {hasMore ? (
              <Button variant="outline" className="w-full rounded-2xl bg-white" onClick={() => setVisibleCount((count) => count + 8)}>
                Load more posts
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
            <MessageCircle className="mx-auto h-10 w-10 text-blue-300" />
            <p className="mt-4 font-medium text-slate-700">
              {isOwnProfile ? 'No posts yet. Share your first campus update from the feed.' : `${student.name} has not posted yet.`}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
