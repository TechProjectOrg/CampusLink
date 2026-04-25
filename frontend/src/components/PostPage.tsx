import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bookmark, Calendar, Heart, MapPin, MessageCircle, Trash2 } from 'lucide-react';
import { Opportunity, Comment } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface PostPageProps {
  post: Opportunity;
  currentUserId: string;
  focusCommentId?: string | null;
  onBack: () => void;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onReply?: (commentId: string, content: string) => void;
  onLikeComment?: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment?: (commentId: string) => void;
  onViewProfile?: (authorId: string) => void;
}

export function PostPage({
  post,
  currentUserId,
  focusCommentId,
  onBack,
  onLike,
  onSave,
  onComment,
  onReply,
  onLikeComment,
  onDeleteComment,
  onViewProfile,
}: PostPageProps) {
  const [commentText, setCommentText] = useState('');
  const [replyByCommentId, setReplyByCommentId] = useState<Record<string, string>>({});
  const [openReplyByCommentId, setOpenReplyByCommentId] = useState<Record<string, boolean>>({});
  const [expandedRepliesByCommentId, setExpandedRepliesByCommentId] = useState<Record<string, boolean>>({});
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);

  const isLiked = post.isLikedByMe ?? post.likes.includes(currentUserId);
  const isSaved = post.isSavedByMe ?? post.saved.includes(currentUserId);
  const likeCount = post.likeCount ?? post.likes.length;
  const saveCount = post.saveCount ?? post.saved.length;
  const commentCount = post.commentCount ?? post.comments.length;

  const typeColors = {
    internship: 'bg-accent/10 text-accent border-accent/20',
    hackathon: 'bg-purple-100 text-purple-700 border-purple-200',
    event: 'bg-secondary/10 text-secondary border-secondary/20',
    contest: 'bg-orange-100 text-orange-700 border-orange-200',
    club: 'bg-pink-100 text-pink-700 border-pink-200',
    general: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const topLevelComments = useMemo(
    () => (post.comments ?? []).filter((comment) => !comment.parentCommentId),
    [post.comments],
  );

  const parentCommentById = useMemo(() => {
    const parentMap = new Map<string, string | null>();

    const walk = (comments: Comment[]) => {
      for (const item of comments) {
        parentMap.set(item.id, item.parentCommentId ?? null);
        if (item.replies && item.replies.length > 0) {
          walk(item.replies);
        }
      }
    };

    walk(post.comments ?? []);
    return parentMap;
  }, [post.comments]);

  useEffect(() => {
    if (!focusCommentId) return;
    if (!parentCommentById.has(focusCommentId)) return;

    const toExpand: Record<string, boolean> = {};
    let cursor: string | null = focusCommentId;

    while (cursor) {
      const parentId = parentCommentById.get(cursor) ?? null;
      if (!parentId) break;
      toExpand[parentId] = true;
      cursor = parentId;
    }

    if (Object.keys(toExpand).length > 0) {
      setExpandedRepliesByCommentId((prev) => ({ ...prev, ...toExpand }));
    }

    setHighlightedCommentId(focusCommentId);
    const scrollTimeout = window.setTimeout(() => {
      const target = document.getElementById(`comment-${focusCommentId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const clearTimeoutId = window.setTimeout(() => {
      setHighlightedCommentId((prev) => (prev === focusCommentId ? null : prev));
    }, 2000);

    return () => {
      window.clearTimeout(scrollTimeout);
      window.clearTimeout(clearTimeoutId);
    };
  }, [focusCommentId, parentCommentById]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  const renderComment = (comment: Comment, depth = 0) => {
    const childComments = comment.replies ?? [];
    const isCommentLiked = comment.isLikedByMe ?? false;
    const commentLikes = comment.likeCount ?? 0;

    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`${depth > 0 ? 'ml-8 mt-3' : ''} rounded-xl transition-colors duration-300 ${
          highlightedCommentId === comment.id ? 'bg-yellow-100/70' : ''
        }`}
      >
        <div className="flex gap-3">
          <Avatar className="w-8 h-8 ring-2 ring-primary/10">
            <AvatarImage src={comment.authorAvatar} />
            <AvatarFallback>{comment.authorName[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="bg-gray-50 rounded-xl p-3">
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

            {expandedRepliesByCommentId[comment.id] && childComments.map((reply) => renderComment(reply, depth + 1))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-2xl border border-primary/10 p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <button type="button" className="flex items-center gap-3" onClick={() => onViewProfile?.(post.authorId)}>
              <Avatar>
                <AvatarImage src={post.authorAvatar} />
                <AvatarFallback>{post.authorName[0]}</AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="text-gray-900">{post.authorName}</p>
                <p className="text-sm text-gray-500">{new Date(post.date).toLocaleString()}</p>
              </div>
            </button>
            <Badge className={`${typeColors[post.type]} border ml-auto`}>
              {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
            </Badge>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl text-gray-900">{post.title}</h1>
            <p className="text-gray-700 whitespace-pre-wrap">{post.description}</p>
          </div>

          {post.image && (
            <ImageWithFallback src={post.image} alt={post.title} className="w-full max-h-[34rem] object-contain rounded-xl bg-gray-50" />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4" /><span>Posted: {formatDate(post.date)}</span></div>
            {post.location && <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /><span>Location: {post.location}</span></div>}
            {post.company && <div>Company: {post.company}</div>}
            {post.deadline && <div>Deadline: {formatDate(post.deadline)}</div>}
            {post.stipend && <div>Stipend: {post.stipend}</div>}
            {post.duration && <div>Duration: {post.duration}</div>}
            {post.link && <div className="break-all">Link: {post.link}</div>}
          </div>

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={`${post.id}-${tag}`} className="bg-primary/10 text-primary border-primary/20">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-primary/10">
            <button
              onClick={() => onLike(post.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 ${
                isLiked ? 'text-red-600 bg-red-50' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              <span className="text-sm">{likeCount}</span>
            </button>
            <button
              onClick={() => onSave(post.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 ${
                isSaved ? 'text-primary bg-primary/10' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
              <span className="text-sm">{saveCount}</span>
            </button>
            <span className="text-sm text-gray-600 ml-auto">{commentCount} comments</span>
          </div>

          <div className="space-y-4 border-t border-primary/10 pt-4">
            {topLevelComments.map((comment) => renderComment(comment))}
            <div className="flex gap-3">
              <Avatar className="w-8 h-8 ring-2 ring-primary/10">

                <AvatarFallback>Y</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="resize-none border-primary/20 focus:border-primary rounded-xl"
                  rows={3}
                />
                <Button
                  onClick={() => {
                    if (!commentText.trim()) return;
                    onComment(post.id, commentText.trim());
                    setCommentText('');
                  }}
                  size="sm"
                  disabled={!commentText.trim()}
                  className="gradient-primary"
                >
                  Comment
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
