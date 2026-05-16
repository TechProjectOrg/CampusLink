import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { Opportunity, Student } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiFetchSavedPosts, type UserPost } from '../lib/postsApi';
import { OpportunityCard } from './OpportunityCard';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { PageLayout } from './PageLayout';
import type { ReportTargetDescriptor } from './ReportDialog';

interface SavedPostsPageProps {
  student: Student;
  currentUserId: string;
  onBack: () => void;
  onLike: (opportunityId: string) => void;
  onSave: (opportunityId: string, currentSavedState?: boolean, currentSaveCount?: number) => Promise<void> | void;
  onComment: (opportunityId: string, comment: string) => void;
  onReply: (commentId: string, comment: string) => void;
  onLikeComment: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onEditPost: (postId: string, updates: Partial<Opportunity>) => void;
  onDeletePost: (postId: string) => void;
  onOpenPost: (post: Opportunity) => void;
  onViewProfile: (studentId: string) => void;
  onReportTarget?: (target: ReportTargetDescriptor) => void;
}

function mapSavedPostToOpportunity(post: UserPost, fallbackStudent: Student): Opportunity {
  let mappedType: Opportunity['type'] = 'general';
  const isProjectPost = (post.hashtags ?? []).some((tag) => tag.trim().toLowerCase() === 'project');
  if (post.postType === 'event') {
    mappedType = 'event';
  } else if (post.postType === 'club_activity') {
    mappedType = 'club';
  } else if (post.postType === 'opportunity') {
    mappedType = (post.opportunityType ?? 'event') as Opportunity['type'];
  } else if (isProjectPost) {
    mappedType = 'project';
  }

  return {
    id: post.id,
    authorId: post.authorUserId || fallbackStudent.id,
    authorName: post.authorDisplayName || post.authorUsername || fallbackStudent.name,
    authorAvatar: post.authorProfilePictureUrl || fallbackStudent.avatar,
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
      authorName: comment.authorDisplayName || comment.authorUsername,
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
        authorName: reply.authorDisplayName || reply.authorUsername,
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

export function SavedPostsPage({
  student,
  currentUserId,
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
  onReportTarget,
}: SavedPostsPageProps) {
  const auth = useAuth();
  const [posts, setPosts] = useState<Opportunity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const list = await apiFetchSavedPosts(auth.session?.token);
        if (!cancelled) {
          setPosts(list.map((post) => mapSavedPostToOpportunity(post, student)));
        }
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth.session?.token, student]);

  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);
  const hasMore = visibleCount < posts.length;

  const handleSavedPageToggle = async (postId: string) => {
    const removedPost = posts.find((post) => post.id === postId) ?? null;
    setPosts((current) => current.filter((post) => post.id !== postId));
    try {
      await onSave(postId, true, removedPost?.saveCount ?? 0);
    } catch {
      if (removedPost) {
        setPosts((current) => [removedPost, ...current]);
      }
    }
  };

  return (
    <PageLayout maxWidth="7xl" className="bg-slate-50 pb-24 md:pb-8" contentClassName="py-4 sm:py-5 lg:py-6">
      <div className="mx-auto w-full space-y-6" style={{ maxWidth: '1000px' }}>
        <header className="overflow-visible rounded-3xl border border-slate-200/80 bg-white px-6 pb-6 pt-4 shadow-sm sm:px-7 sm:pb-7 sm:pt-5">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-5 rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="mt-2 flex items-center gap-4 pl-1 sm:gap-5">
            <Avatar className="aspect-square shrink-0 overflow-hidden rounded-full border border-slate-200 ring-4 ring-white shadow-sm" style={{ width: 80, height: 80 }}>
              <AvatarImage src={student.avatar} alt={student.name} className="h-full w-full object-cover" />
              <AvatarFallback>{student.name[0]}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">Saved Posts</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{student.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Private collection of posts you saved for later.</p>
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm">
            <LoadingIndicator label="Loading saved posts..." />
          </div>
        ) : visiblePosts.length > 0 ? (
          <div className="space-y-5">
            {visiblePosts.map((post) => (
              <OpportunityCard
                key={post.id}
                opportunity={post}
                currentUserId={currentUserId}
                showManagementControls={Boolean(post.canEdit || post.canDelete)}
                onLike={onLike}
                onSave={(postId) => void handleSavedPageToggle(postId)}
                onComment={onComment}
                onReply={onReply}
                onLikeComment={onLikeComment}
                onDeleteComment={onDeleteComment}
                onEditPost={onEditPost}
                onDeletePost={onDeletePost}
                onOpenPost={onOpenPost}
                onViewProfile={onViewProfile}
                onReportTarget={onReportTarget}
              />
            ))}
            {hasMore ? (
              <Button variant="outline" className="w-full rounded-2xl border-slate-200 bg-white text-slate-800 shadow-sm transition-transform duration-200 hover:scale-[1.02]" onClick={() => setVisibleCount((count) => count + 8)}>
                Load more saved posts
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200/80 bg-white p-10 text-center shadow-sm">
            <Bookmark className="mx-auto h-10 w-10 text-blue-300" />
            <p className="mt-4 font-medium text-slate-700">Save posts you want to revisit later.</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
