import { useMemo, useState } from 'react';
import { ShareToChatDialog } from './share/ShareToChatDialog';
import { Heart, MessageCircle, Bookmark, MapPin, Trash2, Pencil, Loader2, MoreHorizontal, Flag, Share2 } from 'lucide-react';
import { Opportunity, Comment } from '../types';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { ExpandableText } from './ExpandableText';
import { PostCarousel } from './feed/PostCarousel';
import { useAuth } from '../context/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import type { ReportTargetDescriptor } from './ReportDialog';

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
  onDeletePost?: (postId: string) => Promise<void> | void;
  onViewProfile?: (authorId: string) => void;
  onOpenPost?: (post: Opportunity) => void;
  onReportTarget?: (target: ReportTargetDescriptor) => void;
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
  onReportTarget,
}: OpportunityCardProps) {
  const auth = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyByCommentId, setReplyByCommentId] = useState<Record<string, string>>({});
  const [openReplyByCommentId, setOpenReplyByCommentId] = useState<Record<string, boolean>>({});
  const [expandedRepliesByCommentId, setExpandedRepliesByCommentId] = useState<Record<string, boolean>>({});
  const [editingPost, setEditingPost] = useState(false);
  const [deletingPost, setDeletingPost] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
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
  const currentUserAvatar = auth.profile?.profilePictureUrl ?? undefined;
  const currentUserInitial =
    auth.profile?.username?.trim()?.charAt(0)?.toUpperCase() ||
    auth.currentUser?.name?.trim()?.charAt(0)?.toUpperCase() ||
    'U';

  const isLiked = opportunity.isLikedByMe ?? opportunity.likes.includes(currentUserId);
  const isSaved = opportunity.isSavedByMe ?? opportunity.saved.includes(currentUserId);
  const hasCertificateTag = (opportunity.tags ?? []).some((tag) => tag.trim().toLowerCase() === 'certificate');

  const typeColors = {
    internship: 'bg-accent/10 text-accent border-accent/20',
    hackathon: 'bg-purple-100 text-purple-700 border-purple-200',
    event: 'bg-secondary/10 text-secondary border-secondary/20',
    contest: 'bg-orange-100 text-orange-700 border-orange-200',
    club: 'bg-pink-100 text-pink-700 border-pink-200',
    project: 'bg-blue-100 text-blue-700 border-blue-200',
    general: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const comments = useMemo(() => opportunity.comments ?? [], [opportunity.comments]);
  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parentCommentId),
    [comments],
  );
  const inlineTopLevelComments = topLevelComments.slice(0, 3);
  const showTitleField = opportunity.type !== 'general' || opportunity.title.trim().length > 0;
  const showDescriptionField =
    opportunity.type === 'general' ||
    opportunity.type === 'project' ||
    opportunity.type === 'internship' ||
    opportunity.type === 'hackathon' ||
    opportunity.type === 'event' ||
    opportunity.type === 'contest' ||
    opportunity.type === 'club' ||
    opportunity.description.trim().length > 0;
  const showCompanyField = Boolean(opportunity.company?.trim());
  const showLocationField = Boolean(opportunity.location?.trim());
  const showDeadlineField = Boolean(opportunity.deadline?.trim());
  const showLinkField = Boolean(opportunity.link?.trim());
  const showStipendField = Boolean(opportunity.stipend?.trim());
  const showDurationField = Boolean(opportunity.duration?.trim());
  const showTagsField = (opportunity.tags?.length ?? 0) > 0;
  const editableImageSources = opportunity.images?.length ? opportunity.images : opportunity.image ? [opportunity.image] : [];
  const visibleEditableImages = editableImageSources.filter((_, index) => {
    const mediaId = opportunity.imageMediaIds?.[index] ?? '';
    return !mediaId || !mediaId.startsWith('certification:');
  });

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

  const openPostReport = () => {
    onReportTarget?.({
      targetType: 'post',
      targetId: opportunity.id,
      label: opportunity.title || `${opportunity.authorName}'s post`,
      preview: opportunity.description || opportunity.title,
    });
  };

  const openCommentReport = (comment: Comment) => {
    onReportTarget?.({
      targetType: 'comment',
      targetId: comment.id,
      label: `Comment by ${comment.authorName}`,
      preview: comment.content,
    });
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
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        aria-label="Comment actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => openCommentReport(comment)}
                      >
                        <Flag className="mr-2 h-4 w-4" />
                        Report
                      </DropdownMenuItem>
                      {comment.canDelete && onDeleteComment ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => onDeleteComment(comment.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
        <h3 className="cl-opportunity-title text-gray-900">{opportunity.title}</h3>
        <ExpandableText
          text={opportunity.description}
          className="cl-opportunity-description text-gray-600"
          buttonClassName="cl-opportunity-description-toggle text-primary"
        />
      </div>

      {((opportunity.images?.length ?? 0) > 0 || opportunity.image) && (
        <PostCarousel
          opportunity={opportunity}
          onOpenPost={onOpenPost ? () => onOpenPost(opportunity) : undefined}
        />
      )}

      <div className="px-6 pt-4 cursor-pointer" onClick={() => onOpenPost?.(opportunity)}>
        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          {opportunity.location && (
            <div className="flex items-center gap-1 transition-colors duration-300 hover:text-primary">
              <MapPin className="w-4 h-4" />
              <span className="cl-opportunity-meta-text">{opportunity.location}</span>
            </div>
          )}
        </div>
      </div>
      
    </>
  );

  return (
    <>
      <ShareToChatDialog isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} post={opportunity} />
      <div className="cl-opportunity-card bg-white rounded-2xl border border-primary/10 overflow-hidden hover-lift animate-slide-in-up shadow-sm hover:shadow-xl transition-all duration-300">
        <div className="cl-opportunity-card-body p-2 sm:p-6 pb-2 sm:pb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onViewProfile?.(opportunity.authorId)}>
              <Avatar className="w-10 h-10 ring-2 ring-primary/20 transition-all duration-300 group-hover:ring-primary/40 flex-shrink-0">
                <AvatarImage src={opportunity.authorAvatar} />
                <AvatarFallback>{opportunity.authorName[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="cl-opportunity-author-name text-gray-900 group-hover:text-primary transition-colors">{opportunity.authorName}</p>
                <p className="text-sm text-gray-500">{formatDate(opportunity.date)}</p>
                {opportunity.clubName ? (
                  <p className="text-xs text-primary">{opportunity.clubName}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasCertificateTag ? (
                <Badge className="border border-amber-200 bg-amber-50 text-amber-700 transition-all duration-300 hover:scale-110">
                  Certificate
                </Badge>
              ) : null}
              {opportunity.type !== 'general' ? (
                <Badge className={`cl-opportunity-type-badge ${typeColors[opportunity.type]} border transition-all duration-300 hover:scale-110`}>
                  {opportunity.type.charAt(0).toUpperCase() + opportunity.type.slice(1)}
                </Badge>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Post actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => onSave(opportunity.id)}>
                    <Bookmark className="mr-2 h-4 w-4" />
                    {isSaved ? 'Unsave' : 'Save'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsShareOpen(true)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={openPostReport}>
                    <Flag className="mr-2 h-4 w-4" />
                    Report
                  </DropdownMenuItem>
                  {showManagementControls && opportunity.canEdit ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setEditingPost((prev) => !prev)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {showManagementControls && opportunity.canDelete && onDeletePost ? (
                    <DropdownMenuItem
                      disabled={deletingPost}
                      className="text-destructive focus:text-destructive"
                      onClick={async () => {
                        setDeletingPost(true);
                        try {
                          await onDeletePost(opportunity.id);
                        } finally {
                          setDeletingPost(false);
                        }
                      }}
                    >
                      {deletingPost ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {showManagementControls && editingPost ? (
            <div className="space-y-2">
              {visibleEditableImages.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Post images</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {visibleEditableImages.map((imageUrl, index) => (
                      <div key={`${opportunity.id}:edit-image:${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <img src={imageUrl} alt="Post media" className="h-24 w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {showTitleField ? (
                <Input value={editDraft.title} onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" />
              ) : null}
              {showDescriptionField ? (
                <Textarea value={editDraft.description} onChange={(e) => setEditDraft((prev) => ({ ...prev, description: e.target.value }))} rows={3} placeholder="Description" />
              ) : null}
              {showCompanyField || showLocationField || showDeadlineField || showLinkField || showStipendField || showDurationField ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {showCompanyField ? (
                    <Input value={editDraft.company} onChange={(e) => setEditDraft((prev) => ({ ...prev, company: e.target.value }))} placeholder="Company" />
                  ) : null}
                  {showLocationField ? (
                    <Input value={editDraft.location} onChange={(e) => setEditDraft((prev) => ({ ...prev, location: e.target.value }))} placeholder="Location" />
                  ) : null}
                  {showDeadlineField ? (
                    <Input type="date" value={editDraft.deadline ? editDraft.deadline.slice(0, 10) : ''} onChange={(e) => setEditDraft((prev) => ({ ...prev, deadline: e.target.value }))} />
                  ) : null}
                  {showLinkField ? (
                    <Input value={editDraft.link} onChange={(e) => setEditDraft((prev) => ({ ...prev, link: e.target.value }))} placeholder="External link" />
                  ) : null}
                  {showStipendField ? (
                    <Input value={editDraft.stipend} onChange={(e) => setEditDraft((prev) => ({ ...prev, stipend: e.target.value }))} placeholder="Stipend" />
                  ) : null}
                  {showDurationField ? (
                    <Input value={editDraft.duration} onChange={(e) => setEditDraft((prev) => ({ ...prev, duration: e.target.value }))} placeholder="Duration" />
                  ) : null}
                </div>
              ) : null}
              {showTagsField ? (
                <Input value={editDraft.tags} onChange={(e) => setEditDraft((prev) => ({ ...prev, tags: e.target.value }))} placeholder="Tags (comma separated)" />
              ) : null}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setEditingPost(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" type="button" onClick={submitPostEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : postCore}
        </div>

        <div className="cl-opportunity-card-actions flex items-center gap-1 sm:gap-2 px-2 sm:px-6 py-2 sm:py-4 border-t border-primary/5">
          <button
            onClick={() => onLike(opportunity.id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all duration-300 ${
              isLiked ? 'text-red-600 bg-red-50 scale-105 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
            }`}
          >
            <Heart className={`w-5 h-5 transition-transform duration-300 ${isLiked ? 'fill-current scale-110' : ''}`} />
            <span className="text-xs sm:text-sm">{likeCount}</span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all duration-300 ${
              showComments ? 'text-primary bg-primary/10 scale-105 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
            }`}
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs sm:text-sm">{commentCount}</span>
          </button>

          <button
            onClick={() => onSave(opportunity.id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl ml-auto transition-all duration-300 ${
              isSaved ? 'text-primary bg-primary/10 scale-105 shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:scale-105'
            }`}
          >
            <Bookmark className={`w-5 h-5 transition-transform duration-300 ${isSaved ? 'fill-current scale-110' : ''}`} />
            <span className="text-xs sm:text-sm">{saveCount}</span>
          </button>
        </div>

        {showComments && (
          <div className="px-2 sm:px-6 pb-2 sm:pb-6 pt-2 space-y-4 border-t border-primary/5 animate-fade-in">
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
                <AvatarImage src={currentUserAvatar} />
                <AvatarFallback>{currentUserInitial}</AvatarFallback>
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
