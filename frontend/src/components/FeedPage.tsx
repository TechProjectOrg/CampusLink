import { useState } from 'react';
import { Filter, FileText, CalendarPlus, BriefcaseBusiness, Loader2 } from 'lucide-react';
import { Opportunity, Student } from '../types';
import { OpportunityCard } from './OpportunityCard';
import { ProfileCard } from './ProfileCard';
import { SuggestionsCard } from './SuggestionsCard';
import { EmptyState } from './EmptyState';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { CreateUnifiedPostModal } from './CreateUnifiedPostModal';
import { LoadingState } from './LoadingState';

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 pb-6 pt-0">
        <div className="space-y-6">
          {/* Main Feed */}
          <div className="space-y-6">
            {/* Header */}
            <div className="animate-slide-in-down">
              <div className="rounded-3xl border border-slate-200/80 bg-white shadow-lg hover-lift overflow-hidden transition-all duration-300 hover:shadow-xl">
                <div className="flex items-start gap-4 p-4 md:p-5">
                  <Avatar className="w-14 h-14 md:w-16 md:h-16 flex-shrink-0 ring-2 ring-primary/10">
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
                    className="flex-1 min-h-14 cursor-pointer rounded-full border border-slate-300 bg-white py-3 pl-8 pr-5 text-left text-slate-500 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-slate-50 hover:shadow-xl md:text-base"
                  >
                    Start a post
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3 sm:gap-3">
                  <Button
                    variant="ghost"
                    className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-700 hover:shadow-xl"
                    onClick={() => {
                      setCreateTab('post');
                      setIsCreateUnifiedModalOpen(true);
                    }}
                  >
                    <FileText className="w-4 h-4" />
                    Post
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-700 hover:shadow-xl"
                    onClick={() => {
                      setCreateTab('event');
                      setIsCreateUnifiedModalOpen(true);
                    }}
                  >
                    <CalendarPlus className="w-4 h-4" />
                    Create Event
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-50 hover:text-slate-700 hover:shadow-xl"
                    onClick={() => {
                      setCreateTab('opportunity');
                      setIsCreateUnifiedModalOpen(true);
                    }}
                  >
                    <BriefcaseBusiness className="w-4 h-4" />
                    Post Opportunity
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
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading more posts...</span>
                </div>
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
    </div>
  );
}
