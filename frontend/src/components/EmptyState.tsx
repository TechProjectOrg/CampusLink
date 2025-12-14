import { Inbox, Search, Users, Briefcase, MessageSquare } from 'lucide-react';
import { Button } from './ui/button';

interface EmptyStateProps {
  type: 'feed' | 'search' | 'network' | 'chat' | 'opportunities' | 'clubs';
  onAction?: () => void;
  actionLabel?: string;
}

export function EmptyState({ type, onAction, actionLabel }: EmptyStateProps) {
  const configs = {
    feed: {
      icon: Inbox,
      title: 'No opportunities yet',
      description: 'Be the first to post an opportunity and help your peers discover new possibilities!',
      action: 'Create Opportunity'
    },
    search: {
      icon: Search,
      title: 'No results found',
      description: 'Try adjusting your search filters or check back later for new students.',
      action: 'Clear Filters'
    },
    network: {
      icon: Users,
      title: 'No followers yet',
      description: 'Follow classmates and seniors to keep up with updates, opportunities, and campus life.',
      action: 'Discover People'
    },
    chat: {
      icon: MessageSquare,
      title: 'No conversations',
      description: 'Start a conversation with people you follow to collaborate and share ideas.',
      action: 'Browse Network'
    },
    opportunities: {
      icon: Briefcase,
      title: 'No saved opportunities',
      description: 'Browse the feed and save opportunities you're interested in.',
      action: 'Explore Feed'
    },
    clubs: {
      icon: Users,
      title: 'No clubs yet',
      description: 'Join clubs to connect with students who share your interests.',
      action: 'Browse Clubs'
    }
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <Icon className="w-10 h-10 text-gray-400" />
      </div>
      <h3 className="text-gray-900 mb-2">{config.title}</h3>
      <p className="text-gray-600 max-w-md mb-6">{config.description}</p>
      {onAction && (
        <Button onClick={onAction} className="gradient-primary">
          {actionLabel || config.action}
        </Button>
      )}
    </div>
  );
}
