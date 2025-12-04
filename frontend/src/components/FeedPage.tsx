import { useState } from 'react';
import { Plus, Filter, Sparkles } from 'lucide-react';
import { Opportunity, Student } from '../types';
import { OpportunityCard } from './OpportunityCard';
import { ProfileCard } from './ProfileCard';
import { SuggestionsCard } from './SuggestionsCard';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface FeedPageProps {
  opportunities: Opportunity[];
  currentUserId: string;
  currentUser?: Student;
  students?: Student[];
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
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
  onViewProfile,
  onConnect,
  onViewStudentProfile
}: FeedPageProps) {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar - Profile Card (Hidden on mobile and tablets) */}
          <div className="hidden show-on-laptop xl:col-span-3">
            <div className="sticky top-24">
              {currentUser && (
                <ProfileCard 
                  student={currentUser} 
                  onViewProfile={() => onViewProfile?.()} 
                />
              )}
            </div>
          </div>

          {/* Main Feed */}
          <div className="lg:col-span-8 xl:col-span-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between animate-slide-in-down">
              <div>
                <h1 className="text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Opportunities Feed
                </h1>
                <p className="text-gray-600">Discover internships, events, and more</p>
              </div>
              <Button className="flex items-center gap-2 gradient-success shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Post</span>
              </Button>
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

          {/* Right Sidebar - Suggestions (Hidden on mobile) */}
          <div className="hidden lg:block lg:col-span-4 xl:col-span-3">
            <div className="sticky top-24">
              {students.length > 0 && (
                <SuggestionsCard
                  students={students}
                  currentUserId={currentUserId}
                  onConnect={(id) => onConnect?.(id)}
                  onViewProfile={(id) => onViewStudentProfile?.(id)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
