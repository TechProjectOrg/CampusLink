import { useState } from 'react';
import { Plus, Filter, Sparkles } from 'lucide-react';
import { Opportunity, Student } from '../types';
import { OpportunityCard } from './OpportunityCard';
import { ProfileCard } from './ProfileCard';
import { SuggestionsCard } from './SuggestionsCard';
import { CreateOpportunityModal } from './CreateOpportunityModal';
import { EmptyState } from './EmptyState';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

import { CreatePostModal } from './CreatePostModal';

import { CreateEventModal } from './CreateEventModal';

interface FeedPageProps {
  opportunities: Opportunity[];
  currentUserId: string;
  currentUser?: Student;
  students?: Student[];
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onDelete?: (id: string) => void;
  onCreateOpportunity?: (opportunity: Opportunity) => void;
  onCreatePost?: (post: any) => void;
  onCreateEvent?: (event: any) => void;
  onViewProfile?: () => void;
  onConnect?: (studentId: string) => void;
  onViewStudentProfile?: (studentId: string) => void;
}

export function FeedPage({ 
  opportunities, 
  currentUserId,
  currentUser,
  students = [],
  onLike, 
  onSave, 
  onComment,
  onDelete,
  onCreateOpportunity,
  onCreatePost,
  onCreateEvent,
  onViewProfile,
  onConnect,
  onViewStudentProfile
}: FeedPageProps) {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false);
  const [isCreateEventModalOpen, setIsCreateEventModalOpen] = useState(false);

  const filters = [
    { id: 'all', label: 'All', icon: Sparkles },
    { id: 'internship', label: 'Internships' },
    { id: 'hackathon', label: 'Hackathons' },
    { id: 'event', label: 'Events' },
    { id: 'contest', label: 'Contests' },
    { id: 'club', label: 'Club Activities' }
  ];

  const filteredOpportunities = selectedFilter === 'all'
    ? opportunities
    : opportunities.filter(opp => opp.type === selectedFilter);

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
                <Button className="flex items-center gap-2" variant="outline" onClick={() => setIsCreatePostModalOpen(true)}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">New Post</span>
                </Button>
                <Button className="flex items-center gap-2" variant="outline" onClick={() => setIsCreateEventModalOpen(true)}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Create Event</span>
                </Button>
                <Button className="flex items-center gap-2 gradient-success shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Post Opportunity</span>
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="glass-morphism rounded-2xl border border-white/50 p-4 shadow-lg hover-lift animate-slide-in-up">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-5 h-5 text-primary" />
                <span className="text-gray-900">Filter by:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {filters.map((filter) => {
                  const Icon = filter.icon;
                  return (
                    <Badge
                      key={filter.id}
                      onClick={() => setSelectedFilter(filter.id)}
                      className={`cursor-pointer transition-all duration-300 hover:scale-105 border ${
                        selectedFilter === filter.id
                          ? 'gradient-primary text-white shadow-lg scale-105'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border-primary/20'
                      }`}
                    >
                      {Icon && <Icon className="w-3 h-3 mr-1" />}
                      {filter.label}
                    </Badge>
                  );
                })}
              </div>
            </div>

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
                    onLike={onLike}
                    onSave={onSave}
                    onComment={onComment}
                    onDelete={(id) => onDelete?.(id)}
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
      <CreateOpportunityModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreateOpportunity={(opp) => onCreateOpportunity?.(opp)}
        currentUser={currentUser}
      />
      <CreatePostModal
        isOpen={isCreatePostModalOpen}
        onClose={() => setIsCreatePostModalOpen(false)}
        onCreatePost={(post) => onCreatePost?.(post)}
        currentUser={currentUser}
      />
      <CreateEventModal
        isOpen={isCreateEventModalOpen}
        onClose={() => setIsCreateEventModalOpen(false)}
        onCreateEvent={(event) => onCreateEvent?.(event)}
        currentUser={currentUser}
      />
    </div>
  );
}