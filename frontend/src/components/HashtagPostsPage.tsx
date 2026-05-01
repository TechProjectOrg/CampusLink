import { ArrowLeft, Hash } from 'lucide-react';
import { Opportunity } from '../types';
import { OpportunityCard } from './OpportunityCard';
import { Button } from './ui/button';
import { LoadingIndicator } from './ui/LoadingIndicator';

interface HashtagPostsPageProps {
  hashtag: string;
  posts: Opportunity[];
  isLoading?: boolean;
  currentUserId: string;
  onBack: () => void;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onReply: (commentId: string, content: string) => void;
  onLikeComment: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onEditPost: (postId: string, updates: Partial<Opportunity>) => void;
  onDeletePost: (postId: string) => void;
  onOpenPost: (post: Opportunity) => void;
  onViewProfile: (authorId: string) => void;
}

export function HashtagPostsPage({
  hashtag,
  posts,
  isLoading = false,
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
}: HashtagPostsPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 px-4 py-1.5 text-primary bg-primary/5">
            <Hash className="w-4 h-4" />
            <span className="font-medium">{hashtag}</span>
          </div>
        </div>

        <div className="space-y-4">
          {isLoading ? (
            <div className="rounded-2xl border border-primary/10 bg-white p-8 text-center text-gray-600 shadow-sm">
              <LoadingIndicator label="Loading posts..." />
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-primary/10 bg-white p-8 text-center text-gray-600 shadow-sm">
              No posts found for this hashtag.
            </div>
          ) : (
            posts.map((post) => (
              <OpportunityCard
                key={post.id}
                opportunity={post}
                currentUserId={currentUserId}
                showManagementControls={false}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
