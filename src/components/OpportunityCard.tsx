import { useState } from 'react';
import { Heart, MessageCircle, Bookmark, ExternalLink, MapPin, Calendar } from 'lucide-react';
import { Opportunity } from '../types';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface OpportunityCardProps {
  opportunity: Opportunity;
  currentUserId: string;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
}

export function OpportunityCard({ 
  opportunity, 
  currentUserId, 
  onLike, 
  onSave, 
  onComment 
}: OpportunityCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');

  const isLiked = opportunity.likes.includes(currentUserId);
  const isSaved = opportunity.saved.includes(currentUserId);

  const typeColors = {
    internship: 'bg-accent/10 text-accent border-accent/20',
    hackathon: 'bg-purple-100 text-purple-700 border-purple-200',
    event: 'bg-secondary/10 text-secondary border-secondary/20',
    contest: 'bg-orange-100 text-orange-700 border-orange-200',
    club: 'bg-pink-100 text-pink-700 border-pink-200'
  };

  const handleComment = () => {
    if (commentText.trim()) {
      onComment(opportunity.id, commentText);
      setCommentText('');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="bg-white rounded-2xl border border-primary/10 overflow-hidden hover-lift animate-slide-in-up shadow-sm hover:shadow-xl transition-all duration-300">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
              <AvatarImage src={opportunity.authorAvatar} />
              <AvatarFallback>{opportunity.authorName[0]}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-gray-900">{opportunity.authorName}</p>
              <p className="text-sm text-gray-500">{formatDate(opportunity.date)}</p>
            </div>
          </div>
          <Badge className={`${typeColors[opportunity.type]} border transition-all duration-300 hover:scale-110`}>
            {opportunity.type.charAt(0).toUpperCase() + opportunity.type.slice(1)}
          </Badge>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h3 className="text-gray-900">{opportunity.title}</h3>
          <p className="text-gray-600">{opportunity.description}</p>
        </div>
      </div>

      {/* Image */}
      {opportunity.image && (
        <div className="relative w-full overflow-hidden group">
          <ImageWithFallback
            src={opportunity.image}
            alt={opportunity.title}
            className="w-full h-80 object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
      )}

      {/* Meta Info */}
      <div className="px-6 pt-4">
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          {opportunity.location && (
            <div className="flex items-center gap-1 transition-colors duration-300 hover:text-primary">
              <MapPin className="w-4 h-4" />
              <span>{opportunity.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1 transition-colors duration-300 hover:text-primary">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(opportunity.date)}</span>
          </div>
          {opportunity.link && (
            <a 
              href={opportunity.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-secondary hover:text-primary transition-all duration-300 hover:underline"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Learn More</span>
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-6 py-4 border-t border-primary/5">
        <button
          onClick={() => onLike(opportunity.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
            isLiked 
              ? 'text-red-600 bg-red-50 scale-105 shadow-sm' 
              : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
          }`}
        >
          <Heart className={`w-5 h-5 transition-transform duration-300 ${isLiked ? 'fill-current scale-110' : ''}`} />
          <span className="text-sm">{opportunity.likes.length}</span>
        </button>

        <button
          onClick={() => setShowComments(!showComments)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
            showComments 
              ? 'text-primary bg-primary/10 scale-105 shadow-sm' 
              : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">{opportunity.comments.length}</span>
        </button>

        <button
          onClick={() => onSave(opportunity.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl ml-auto transition-all duration-300 ${
            isSaved 
              ? 'text-primary bg-primary/10 scale-105 shadow-sm' 
              : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
          }`}
        >
          <Bookmark className={`w-5 h-5 transition-transform duration-300 ${isSaved ? 'fill-current scale-110' : ''}`} />
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="px-6 pb-6 pt-2 space-y-4 border-t border-primary/5 animate-fade-in">
          {/* Existing Comments */}
          {opportunity.comments.map((comment) => (
            <div key={comment.id} className="flex gap-3 animate-slide-in-up">
              <Avatar className="w-8 h-8 ring-2 ring-primary/10">
                <AvatarImage src={comment.authorAvatar} />
                <AvatarFallback>{comment.authorName[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="bg-gray-50 rounded-xl p-3 transition-all duration-300 hover:bg-gray-100">
                  <p className="text-sm text-gray-900">{comment.authorName}</p>
                  <p className="text-sm text-gray-600 mt-1">{comment.content}</p>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(comment.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
          ))}

          {/* Add Comment */}
          <div className="flex gap-3">
            <Avatar className="w-8 h-8 ring-2 ring-primary/10">
              <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=You" />
              <AvatarFallback>Y</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="resize-none border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                rows={2}
              />
              <Button 
                onClick={handleComment} 
                size="sm" 
                disabled={!commentText.trim()}
                className="gradient-primary transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                Comment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
