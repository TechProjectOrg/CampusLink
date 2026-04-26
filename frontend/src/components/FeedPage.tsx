import { useState } from 'react';
import { Plus, Filter } from 'lucide-react';
import { Opportunity, Student } from '../types';
import { OpportunityCard } from './OpportunityCard';
import { ProfileCard } from './ProfileCard';
import { SuggestionsCard } from './SuggestionsCard';
import { EmptyState } from './EmptyState';
import { Button } from './ui/button';
import { CreateUnifiedPostModal } from './CreateUnifiedPostModal';

interface FeedPageProps {
  opportunities: Opportunity[];
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

  const filteredOpportunities = opportunities;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Main Feed */}
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between animate-slide-in-down">
              <div>
                <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Opportunities Feed
                </h1>
                <p className="text-gray-600">Discover internships, events, and more</p>
              </div>
              <div className="flex gap-2">
                <Button className="flex items-center gap-2 gradient-primary shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105" onClick={() => setIsCreateUnifiedModalOpen(true)}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Post</span>
                </Button>
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
              {filteredOpportunities.length === 0 && (
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
      />
    </div>
  );
}
