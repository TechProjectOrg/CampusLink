import { useMemo, useState } from 'react';
import { Heart, MessageCircle, Bookmark, MapPin, Calendar, Trash2, Pencil } from 'lucide-react';
import { Opportunity, Comment } from '../types';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface OpportunityCardProps {
  opportunity: Opportunity;
  currentUserId: string;
  showManagementControls?: boolean;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onReply?: (commentId: string, content: string) => void;
  onLikeComment?: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment?: (commentId: string) => void;
  onEditPost?: (postId: string, updates: Partial<Opportunity>) => void;
  onDeletePost?: (postId: string) => void;
  onViewProfile?: (authorId: string) => void;
  onOpenPost?: (post: Opportunity) => void;
}

export function OpportunityCard({
  opportunity,
  currentUserId,
  showManagementControls = false,
  onLike,
  onSave,
  onComment,
  onReply,
  onLikeComment,
  onDeleteComment,
  onEditPost,
  onDeletePost,
  onViewProfile,
  onOpenPost,
}: OpportunityCardProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyByCommentId, setReplyByCommentId] = useState<Record<string, string>>({});
  const [openReplyByCommentId, setOpenReplyByCommentId] = useState<Record<string, boolean>>({});
  const [expandedRepliesByCommentId, setExpandedRepliesByCommentId] = useState<Record<string, boolean>>({});
  const [editingPost, setEditingPost] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: opportunity.title,
    description: opportunity.description,
    company: opportunity.company ?? '',
    deadline: opportunity.deadline ?? '',
    stipend: opportunity.stipend ?? '',
    duration: opportunity.duration ?? '',
    location: opportunity.location ?? '',
    link: opportunity.link ?? '',
    tags: (opportunity.tags ?? []).join(', '),
  });

  const likeCount = opportunity.likeCount ?? opportunity.likes.length;
  const saveCount = opportunity.saveCount ?? opportunity.saved.length;
  const commentCount = opportunity.commentCount ?? opportunity.comments.length;

  const isLiked = opportunity.isLikedByMe ?? opportunity.likes.includes(currentUserId);
  const isSaved = opportunity.isSavedByMe ?? opportunity.saved.includes(currentUserId);

  const typeColors = {
    internship: 'bg-accent/10 text-accent border-accent/20',
    hackathon: 'bg-purple-100 text-purple-700 border-purple-200',
    event: 'bg-secondary/10 text-secondary border-secondary/20',
    contest: 'bg-orange-100 text-orange-700 border-orange-200',
    club: 'bg-pink-100 text-pink-700 border-pink-200',
    general: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const comments = useMemo(() => opportunity.comments ?? [], [opportunity.comments]);
  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parentCommentId),
    [comments],
  );
  const inlineTopLevelComments = topLevelComments.slice(0, 3);

  const handleComment = () => {
    if (!commentText.trim()) return;
    onComment(opportunity.id, commentText.trim());
    setCommentText('');
  };

  const submitReply = (commentId: string) => {
    const next = (replyByCommentId[commentId] ?? '').trim();
    if (!next || !onReply) return;
    onReply(commentId, next);
    setReplyByCommentId((prev) => ({ ...prev, [commentId]: '' }));
    setOpenReplyByCommentId((prev) => ({ ...prev, [commentId]: false }));
  };

  const toggleReplies = (commentId: string) => {
    setExpandedRepliesByCommentId((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderCommentItem = (comment: Comment, depth = 0) => {
    const childComments = comment.replies ?? [];
    const isCommentLiked = comment.isLikedByMe ?? false;
    const commentLikes = comment.likeCount ?? 0;

    return (
      <div key={comment.id} className={`${depth > 0 ? 'ml-8 mt-3' : ''}`}>
        <div className="flex gap-3 animate-slide-in-up">
          <Avatar className="w-8 h-8 ring-2 ring-primary/10">
            <AvatarImage src={comment.authorAvatar} />
            <AvatarFallback>{comment.authorName[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="bg-gray-50 rounded-xl p-3 transition-all duration-300 hover:bg-gray-100">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-gray-900">{comment.authorName}</p>
                {comment.canDelete && onDeleteComment && (
                  <button
                    type="button"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => onDeleteComment(comment.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1">{comment.content}</p>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
              <span>{new Date(comment.timestamp).toLocaleString()}</span>
              <button
                type="button"
                className={`flex items-center gap-1 ${isCommentLiked ? 'text-red-600' : 'hover:text-gray-700'}`}
                onClick={() => onLikeComment?.(comment.id, isCommentLiked)}
              >
                <Heart className={`w-3 h-3 ${isCommentLiked ? 'fill-current' : ''}`} />
                {commentLikes}
              </button>
              {onReply && (
                <button
                  type="button"
                  className={`flex items-center gap-1 ${openReplyByCommentId[comment.id] ? 'text-primary' : 'hover:text-gray-700'}`}
                  onClick={() =>
                    setOpenReplyByCommentId((prev) => ({
                      ...prev,
                      [comment.id]: !prev[comment.id],
                    }))
                  }
                >
                  <MessageCircle className="w-3 h-3" />
                  Reply
                </button>
              )}
            </div>

            {onReply && openReplyByCommentId[comment.id] && (
              <div className="mt-2 flex gap-2">
                <Input
                  value={replyByCommentId[comment.id] ?? ''}
                  onChange={(e) =>
                    setReplyByCommentId((prev) => ({
                      ...prev,
                      [comment.id]: e.target.value,
                    }))
                  }
                  placeholder="Write a reply..."
                  className="h-8 text-sm"
                />
                <Button size="sm" type="button" onClick={() => submitReply(comment.id)}>
                  Reply
                </Button>
              </div>
            )}

            {childComments.length > 0 && (
              <button
                type="button"
                className="mt-2 text-xs text-primary hover:underline"
                onClick={() => toggleReplies(comment.id)}
              >
                {expandedRepliesByCommentId[comment.id] ? 'Hide replies' : `View replies (${childComments.length})`}
              </button>
            )}

            {expandedRepliesByCommentId[comment.id] && childComments.map((reply) => renderCommentItem(reply, depth + 1))}
          </div>
        </div>
      </div>
    );
  };

  const submitPostEdit = () => {
    if (!onEditPost) return;

    const tags = editDraft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    onEditPost(opportunity.id, {
      title: editDraft.title,
      description: editDraft.description,
      company: editDraft.company,
      deadline: editDraft.deadline,
      stipend: editDraft.stipend,
      duration: editDraft.duration,
      location: editDraft.location,
      link: editDraft.link,
      tags,
    });
    setEditingPost(false);
  };

  const postCore = (
    <>
      <div className="space-y-2 cursor-pointer" onClick={() => onOpenPost?.(opportunity)}>
        <h3 className="text-gray-900">{opportunity.title}</h3>
        <p className="text-gray-600">{opportunity.description}</p>
      </div>

      {opportunity.image && (
        <div className="relative w-full overflow-hidden group cursor-pointer" onClick={() => onOpenPost?.(opportunity)}>
          <ImageWithFallback
            src={opportunity.image}
            alt={opportunity.title}
            className="w-full h-80 object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        </div>
      )}

      <div className="px-6 pt-4 cursor-pointer" onClick={() => onOpenPost?.(opportunity)}>
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
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="bg-white rounded-2xl border border-primary/10 overflow-hidden hover-lift animate-slide-in-up shadow-sm hover:shadow-xl transition-all duration-300">
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onViewProfile?.(opportunity.authorId)}>
              <Avatar className="ring-2 ring-primary/20 transition-all duration-300 group-hover:ring-primary/40">
                <AvatarImage src={opportunity.authorAvatar} />
                <AvatarFallback>{opportunity.authorName[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-gray-900 group-hover:text-primary transition-colors">{opportunity.authorName}</p>
                <p className="text-sm text-gray-500">{formatDate(opportunity.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`${typeColors[opportunity.type]} border transition-all duration-300 hover:scale-110`}>
                {opportunity.type.charAt(0).toUpperCase() + opportunity.type.slice(1)}
              </Badge>
              {showManagementControls && opportunity.canEdit && (
                <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => setEditingPost((prev) => !prev)}>
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {showManagementControls && opportunity.canDelete && onDeletePost && (
                <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => onDeletePost(opportunity.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {showManagementControls && editingPost ? (
            <div className="space-y-2">
              <Input value={editDraft.title} onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" />
              <Textarea value={editDraft.description} onChange={(e) => setEditDraft((prev) => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Description" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <Input value={editDraft.company} onChange={(e) => setEditDraft((prev) => ({ ...prev, company: e.target.value }))} placeholder="Company" />
                <Input value={editDraft.location} onChange={(e) => setEditDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" />
                <Input type="date" value={editDraft.deadline ? editDraft.deadline.slice(0, 10) : ''} onChange={(e) => setEditDraft((prev) => ({ ...prev, deadline: e.target.value }))} />
                <Input value={editDraft.link} onChange={(e) => setEditDraft((prev) => ({ ...prev, link: e.target.value }))} placeholder="External link" />
                <Input value={editDraft.stipend} onChange={(e) => setEditDraft((prev) => ({ ...prev, stipend: e.target.value }))} placeholder="Stipend" />
                <Input value={editDraft.duration} onChange={(e) => setEditDraft((prev) => ({ ...prev, duration: e.target.value }))} placeholder="Duration" />
              </div>
              <Input value={editDraft.tags} onChange={(e) => setEditDraft((prev) => ({ ...prev, tags: e.target.value }))} placeholder="Tags (comma separated)" />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" type="button" onClick={() => setEditingPost(false)}>
                  Cancel
                </Button>
                <Button size="sm" type="button" onClick={submitPostEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : postCore}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-primary/5">
          <button
            onClick={() => onLike(opportunity.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
              isLiked ? 'text-red-600 bg-red-50 scale-105 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
            }`}
          >
            <Heart className={`w-5 h-5 transition-transform duration-300 ${isLiked ? 'fill-current scale-110' : ''}`} />
            <span className="text-sm">{likeCount}</span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
              showComments ? 'text-primary bg-primary/10 scale-105 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm">{commentCount}</span>
          </button>

          <button
            onClick={() => onSave(opportunity.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ml-auto transition-all duration-300 ${
              isSaved ? 'text-primary bg-primary/10 scale-105 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
            }`}
          >
            <Bookmark className={`w-5 h-5 transition-transform duration-300 ${isSaved ? 'fill-current scale-110' : ''}`} />
            <span className="text-sm">{saveCount}</span>
          </button>
        </div>

        {showComments && (
          <div className="px-6 pb-6 pt-2 space-y-4 border-t border-primary/5 animate-fade-in">
            {inlineTopLevelComments.map((comment) => renderCommentItem(comment))}
            {topLevelComments.length > 3 && (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => onOpenPost?.(opportunity)}
              >
                View all comments ({commentCount})
              </button>
            )}

            <div className="flex gap-3">
              <Avatar className="w-8 h-8 ring-2 ring-primary/10">

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
    </>
  );
}
