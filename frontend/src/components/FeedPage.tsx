import { useState } from 'react';
import { Filter, FileText, CalendarPlus, BriefcaseBusiness } from 'lucide-react';
import { Opportunity, Student } from '../types';
import { OpportunityCard } from './OpportunityCard';
import { ProfileCard } from './ProfileCard';
import { SuggestionsCard } from './SuggestionsCard';
import { EmptyState } from './EmptyState';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { CreateUnifiedPostModal } from './CreateUnifiedPostModal';
import { LoadingState } from './LoadingState';
import { LoadingIndicator } from './ui/LoadingIndicator';

interface FeedPageProps {
  opportunities: Opportunity[];
  isLoading?: boolean;
  isLoadingMore?: boolean;
  currentUserId: string;
  selectedHashtag?: string | null;
  onClearHashtagFilter?: () => void;
  currentUser?: Student;
  students?: Student[];
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onReply: (commentId: string, content: string) => void;
  onLikeComment: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment: (commentId: string) => void;
  onEditPost: (postId: string, updates: Partial<Opportunity>) => void;
  onDeletePost: (postId: string) => void;
  onOpenPost: (post: Opportunity) => void;

  onCreateOpportunity?: (opportunity: Opportunity) => void;
  onCreatePost?: (post: any) => void;
  onCreateEvent?: (event: any) => void;
  onViewProfile?: () => void;
  onViewStudentProfile?: (studentId: string) => void;
}

export function FeedPage({ 
  opportunities, 
  isLoading = false,
  isLoadingMore = false,
  currentUserId,
  selectedHashtag,
  onClearHashtagFilter,
  currentUser,
  students = [],
  onLike, 
  onSave, 
  onComment,
  onReply,
  onLikeComment,
  onDeleteComment,
  onEditPost,
  onDeletePost,
  onOpenPost,
  onCreateOpportunity,
  onCreatePost,
  onCreateEvent,
  onViewProfile,
  onViewStudentProfile
}: FeedPageProps) {
  const [isCreateUnifiedModalOpen, setIsCreateUnifiedModalOpen] = useState(false);
  const [createTab, setCreateTab] = useState<'post' | 'event' | 'opportunity'>('post');

  const filteredOpportunities = opportunities;

  return (
    <>
        <div className="cl-feed-page mx-auto w-full space-y-4 sm:space-y-6 pb-24 md:pb-6" style={{ maxWidth: '1000px' }}>
          {/* Main Feed */}
          <div className="space-y-6">
            {/* Header */}
            <div className="animate-slide-in-down">
              <div className="cl-feed-composer rounded-3xl border border-slate-200/80 bg-white shadow-lg hover-lift overflow-hidden transition-all duration-300 hover:shadow-xl">
                <div className="cl-feed-composer-top flex items-center sm:items-start gap-3 sm:gap-4 p-3 sm:p-4 md:p-5">
                  <Avatar className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 flex-shrink-0 ring-2 ring-primary/10">
                    <AvatarImage src={currentUser?.avatar} alt={currentUser?.name} />
                    <AvatarFallback className="bg-slate-100 text-slate-700 text-base font-medium">
                      {currentUser?.name?.[0] ?? 'U'}
                    </AvatarFallback>
                  </Avatar>

                  <button
                    type="button"
                    onClick={() => {
                      setCreateTab('post');
                      setIsCreateUnifiedModalOpen(true);
                    }}
                    className="cl-start-post-trigger flex-1 min-h-12 sm:min-h-14 cursor-pointer rounded-full border border-slate-300 bg-white py-2 sm:py-3 pl-5 sm:pl-8 pr-4 sm:pr-5 text-left text-sm sm:text-base text-slate-500 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-slate-50 hover:shadow-xl"
                  >
                    Start a post
                  </button>
                </div>

                <div className="cl-feed-action-row grid grid-cols-3 gap-1.5 sm:gap-2 border-t border-slate-100 p-2 sm:p-3">
                  <Button
                    variant="ghost"
                    className="cl-feed-action-button flex h-10 sm:h-12 cursor-pointer items-center justify-center gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-700 hover:shadow-xl px-2"
                    onClick={() => {
                      setCreateTab('post');
                      setIsCreateUnifiedModalOpen(true);
                    }}
                  >
                    <FileText className="cl-feed-action-icon-post w-4 h-4" />
                    <span className="cl-feed-action-label text-[11px] sm:text-sm font-medium">Post</span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="cl-feed-action-button flex h-10 sm:h-12 cursor-pointer items-center justify-center gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-700 hover:shadow-xl px-2"
                    onClick={() => {
                      setCreateTab('event');
                      setIsCreateUnifiedModalOpen(true);
                    }}
                  >
                    <CalendarPlus className="cl-feed-action-icon-event w-4 h-4" />
                    <span className="cl-feed-action-label cl-feed-action-label-full text-[11px] sm:text-sm font-medium">Create Event</span>
                    <span className="cl-feed-action-label cl-feed-action-label-mobile text-[11px] sm:text-sm font-medium">Event</span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="cl-feed-action-button flex h-10 sm:h-12 cursor-pointer items-center justify-center gap-1 sm:gap-2 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-700 hover:shadow-xl px-2"
                    onClick={() => {
                      setCreateTab('opportunity');
                      setIsCreateUnifiedModalOpen(true);
                    }}
                  >
                    <BriefcaseBusiness className="cl-feed-action-icon-job w-4 h-4" />
                    <span className="cl-feed-action-label cl-feed-action-label-full text-[11px] sm:text-sm font-medium">Post Opportunity</span>
                    <span className="cl-feed-action-label cl-feed-action-label-mobile text-[11px] sm:text-sm font-medium">Job</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Filters */}
            {selectedHashtag && (
              <div className="glass-morphism rounded-2xl border border-white/50 p-4 shadow-lg hover-lift animate-slide-in-up">
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-primary/10 text-primary border-primary/20">#{selectedHashtag}</Badge>
                  <button
                    type="button"
                    className="text-sm text-gray-600 hover:text-gray-900"
                    onClick={onClearHashtagFilter}
                  >
                    Clear hashtag filter
                  </button>
                </div>
              </div>
            )}

            {/* Opportunities List */}
            <div className="space-y-4">
              {isLoading && filteredOpportunities.length === 0 ? <LoadingState type="feed" /> : null}
              {filteredOpportunities.map((opportunity, index) => (
                <div 
                  key={opportunity.id}
                  style={{ animationDelay: `${index * 100}ms` }}
                  className="animate-slide-in-up"
                >
                  <OpportunityCard
                    opportunity={opportunity}
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

                    onViewProfile={onViewStudentProfile}
                  />
                </div>
              ))}
              {isLoadingMore && filteredOpportunities.length > 0 ? (
                <LoadingIndicator label="Loading more posts..." size={20} className="py-4" />
              ) : null}
              {!isLoading && filteredOpportunities.length === 0 && (
                <div className="glass-morphism rounded-2xl border border-white/50 p-12 text-center shadow-lg animate-fade-in">
                  <div className="w-16 h-16 gradient-primary rounded-2xl mx-auto mb-4 flex items-center justify-center">
                    <Filter className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-gray-500">No opportunities found for this filter.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      <CreateUnifiedPostModal
        isOpen={isCreateUnifiedModalOpen}
        onClose={() => setIsCreateUnifiedModalOpen(false)}
        onCreatePost={(post) => onCreatePost?.(post)}
        onCreateEvent={(event) => onCreateEvent?.(event)}
        onCreateOpportunity={(opp) => onCreateOpportunity?.(opp)}
        currentUser={currentUser}
        initialTab={createTab}
      />
    </>
  );
}
