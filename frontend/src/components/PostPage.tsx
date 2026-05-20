import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Calendar, Heart, MapPin, MessageCircle, Trash2, MoreHorizontal, Flag, Share2, Link as LinkIcon, BriefcaseBusiness, Wallet, Clock3, Pencil } from 'lucide-react';
import { ShareToChatDialog } from './share/ShareToChatDialog';
import { Opportunity, Comment } from '../types';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { PostCarousel } from './feed/PostCarousel';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { ExpandableText } from './ExpandableText';
import { useAuth } from '../context/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import type { ReportTargetDescriptor } from './ReportDialog';

interface DiscussionListState {
  isLoading: boolean;
  hasMore: boolean;
  hasHydrated: boolean;
}

interface ReplyThreadViewState extends DiscussionListState {
  isExpanded: boolean;
}

interface AutoLoadTriggerProps {
  enabled: boolean;
  onVisible?: () => void;
}

function AutoLoadTrigger({ enabled, onVisible }: AutoLoadTriggerProps) {
  const triggerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = triggerRef.current;
    if (!enabled || !element || !onVisible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisible();
        }
      },
      {
        rootMargin: '160px 0px',
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, onVisible]);

  return <div ref={triggerRef} className="h-1 w-full" aria-hidden="true" />;
}

interface PostPageProps {
  post: Opportunity;
  currentUserId: string;
  focusCommentId?: string | null;
  commentsState: DiscussionListState;
  repliesByCommentId: Record<string, ReplyThreadViewState>;
  onBack: () => void;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (id: string, comment: string) => void;
  onReply?: (commentId: string, content: string) => void;
  onLoadMoreComments?: () => Promise<void> | void;
  onToggleReplies?: (commentId: string) => Promise<void> | void;
  onLoadMoreReplies?: (commentId: string) => Promise<void> | void;
  onLikeComment?: (commentId: string, alreadyLiked: boolean) => void;
  onDeleteComment?: (commentId: string) => void;
  onEditPost?: (postId: string, updates: Partial<Opportunity>) => void;
  onDeletePost?: (postId: string) => Promise<void> | void;
  onViewProfile?: (authorId: string) => void;
  onReportTarget?: (target: ReportTargetDescriptor) => void;
}

export function PostPage({
  post,
  currentUserId,
  focusCommentId,
  commentsState,
  repliesByCommentId,
  onBack,
  onLike,
  onSave,
  onComment,
  onReply,
  onLoadMoreComments,
  onToggleReplies,
  onLoadMoreReplies,
  onLikeComment,
  onDeleteComment,
  onEditPost,
  onDeletePost,
  onViewProfile,
  onReportTarget,
}: PostPageProps) {
  const editableImageSources = post.images?.length ? post.images : post.image ? [post.image] : [];

  const auth = useAuth();
  const [commentText, setCommentText] = useState('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: post.title,
    description: post.description,
    company: post.company ?? '',
    deadline: post.deadline ?? '',
    stipend: post.stipend ?? '',
    duration: post.duration ?? '',
    location: post.location ?? '',
    link: post.link ?? '',
    tags: (post.tags ?? []).join(', '),
  });

  const isLiked = post.isLikedByMe ?? post.likes.includes(currentUserId);
  const isSaved = post.isSavedByMe ?? post.saved.includes(currentUserId);
  const likeCount = post.likeCount ?? post.likes.length;
  const saveCount = post.saveCount ?? post.saved.length;
  const commentCount = post.commentCount ?? post.comments.length;
  const currentUserAvatar = auth.profile?.profilePictureUrl ?? undefined;
  const currentUserInitial =
    auth.profile?.username?.trim()?.charAt(0)?.toUpperCase() ||
    auth.currentUser?.name?.trim()?.charAt(0)?.toUpperCase() ||
    'U';

  const typeColors = {
    internship: 'bg-accent/10 text-accent border-accent/20',
    hackathon: 'bg-purple-100 text-purple-700 border-purple-200',
    event: 'bg-secondary/10 text-secondary border-secondary/20',
    contest: 'bg-orange-100 text-orange-700 border-orange-200',
    club: 'bg-pink-100 text-pink-700 border-pink-200',
    general: 'bg-gray-100 text-gray-700 border-gray-200',
  };
  const showTitleField = post.type !== 'general' || post.title.trim().length > 0;
  const showDescriptionField =
    post.type === 'general' ||
    post.type === 'project' ||
    post.type === 'internship' ||
    post.type === 'hackathon' ||
    post.type === 'event' ||
    post.type === 'contest' ||
    post.type === 'club' ||
    post.description.trim().length > 0;
  const showCompanyField = Boolean(post.company?.trim());
  const showLocationField = Boolean(post.location?.trim());
  const showDeadlineField = Boolean(post.deadline?.trim());
  const showLinkField = Boolean(post.link?.trim());
  const showStipendField = Boolean(post.stipend?.trim());
  const showDurationField = Boolean(post.duration?.trim());
  const showTagsField = (post.tags?.length ?? 0) > 0;
  const visibleEditableImages = editableImageSources.filter((_, index) => {
    const mediaId = post.imageMediaIds?.[index] ?? '';
    return !mediaId.startsWith('certification:');
  });

  const topLevelComments = useMemo(
    () => (post.comments ?? []).filter((comment) => !comment.parentCommentId),
    [post.comments],
  );
  const visibleTags = useMemo(
    () => (post.tags ?? []).filter((tag) => tag.trim().toLowerCase() !== 'general'),
    [post.tags],
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

  useEffect(() => {
    setEditDraft({
      title: post.title,
      description: post.description,
      company: post.company ?? '',
      deadline: post.deadline ?? '',
      stipend: post.stipend ?? '',
      duration: post.duration ?? '',
      location: post.location ?? '',
      link: post.link ?? '',
      tags: (post.tags ?? []).join(', '),
    });
    setEditingPost(false);
  }, [post]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const detailItems: Array<{
    key: string;
    icon?: JSX.Element;
    label: string;
    value: string;
    href?: string;
  }> = [];

  detailItems.push({
    key: 'posted',
    icon: <Calendar className="h-4 w-4" />,
    label: 'Posted',
    value: formatDate(post.date),
  });

  if (post.eventDate) {
    detailItems.push({
      key: 'event-date',
      icon: <Calendar className="h-4 w-4" />,
      label: post.type === 'event' ? 'Event Date & Time' : 'Schedule',
      value: formatDateTime(post.eventDate),
    });
  }

  if (post.location) {
    detailItems.push({
      key: 'location',
      icon: <MapPin className="h-4 w-4" />,
      label: post.type === 'event' ? 'Venue' : 'Location',
      value: post.location,
    });
  }

  if (post.company) {
    detailItems.push({
      key: 'company',
      icon: <BriefcaseBusiness className="h-4 w-4" />,
      label: 'Company',
      value: post.company,
    });
  }

  if (post.deadline) {
    detailItems.push({
      key: 'deadline',
      icon: <Calendar className="h-4 w-4" />,
      label: 'Deadline',
      value: formatDateTime(post.deadline),
    });
  }

  if (post.stipend) {
    detailItems.push({
      key: 'stipend',
      icon: <Wallet className="h-4 w-4" />,
      label: 'Stipend',
      value: post.stipend,
    });
  }

  if (post.duration) {
    detailItems.push({
      key: 'duration',
      icon: <Clock3 className="h-4 w-4" />,
      label: 'Duration',
      value: post.duration,
    });
  }

  if (post.link) {
    detailItems.push({
      key: 'link',
      icon: <LinkIcon className="h-4 w-4" />,
      label: post.type === 'event' ? 'Registration Link' : 'External Link',
      value: post.link,
      href: post.link,
    });
  }

  const submitComposer = () => {
    const next = commentText.trim();
    if (!next) return;

    if (replyTarget && onReply) {
      onReply(replyTarget.id, next);
      setReplyTarget(null);
      setCommentText('');
      return;
    }

    onComment(post.id, next);
    setCommentText('');
  };

  const submitPostEdit = () => {
    if (!onEditPost) return;

    const tags = editDraft.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    onEditPost(post.id, {
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

  const openPostReport = () => {
    onReportTarget?.({
      targetType: 'post',
      targetId: post.id,
      label: post.title || `${post.authorName}'s post`,
      preview: post.description || post.title,
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

  const renderComment = (comment: Comment, depth = 0) => {
    const childComments = comment.replies ?? [];
    const replyCount = comment.replyCount ?? childComments.length;
    const threadState = repliesByCommentId[comment.id];
    const isExpanded = Boolean(threadState?.isExpanded);
    const isLoadingReplies = Boolean(threadState?.isLoading);
    const hasHydratedReplies = Boolean(threadState?.hasHydrated);
    const hasMoreReplies = Boolean(threadState?.hasMore);
    const isCommentLiked = comment.isLikedByMe ?? false;
    const commentLikes = comment.likeCount ?? 0;

    return (
      <div
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`${depth > 0 ? 'ml-8 mt-4' : 'mt-0'} rounded-xl transition-colors duration-300 ${
          highlightedCommentId === comment.id ? 'bg-yellow-100/70' : ''
        }`}
      >
        <div className="flex gap-3">
          <Avatar className="w-8 h-8 ring-2 ring-primary/10">
            <AvatarImage src={comment.authorAvatar} />
            <AvatarFallback>{comment.authorName[0]}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="text-sm text-gray-900 text-left hover:text-primary"
                  onClick={() => onViewProfile?.(comment.authorId)}
                >
                  {comment.authorName}
                </button>
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
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => openCommentReport(comment)}>
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
              <p className="text-sm text-gray-600 mt-2">{comment.content}</p>
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
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
                  className={`flex items-center gap-1 ${replyTarget?.id === comment.id ? 'text-primary' : 'hover:text-gray-700'}`}
                  onClick={() => {
                    setReplyTarget((prev) => (prev?.id === comment.id ? null : comment));
                    window.setTimeout(() => {
                      const composer = document.getElementById('post-comment-composer');
                      composer?.focus();
                    }, 0);
                  }}
                >
                  <MessageCircle className="w-3 h-3" />
                  Reply
                </button>
              )}
            </div>

            {replyCount > 0 && (
              <button
                type="button"
                className="mt-2 text-xs text-primary hover:underline"
                onClick={() => void onToggleReplies?.(comment.id)}
              >
                {isLoadingReplies
                  ? 'Loading replies...'
                  : isExpanded
                    ? 'Hide replies'
                    : `View replies (${replyCount})`}
              </button>
            )}

            {isExpanded && !isLoadingReplies && hasHydratedReplies && replyCount > 0 && childComments.length === 0 && (
              <p className="mt-2 text-xs text-gray-500">No replies found.</p>
            )}

            {isExpanded && childComments.map((reply) => renderComment(reply, depth + 1))}

            {isExpanded && hasMoreReplies && (
              <div className="mt-2">
                <AutoLoadTrigger
                  enabled={!isLoadingReplies}
                  onVisible={() => {
                    void onLoadMoreReplies?.(comment.id);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <ShareToChatDialog isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} post={post} />
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="cl-post-detail-card bg-white rounded-2xl border border-primary/10 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <button type="button" className="flex items-center gap-3 min-w-0" onClick={() => onViewProfile?.(post.authorId)}>
              <Avatar className="w-10 h-10 ring-2 ring-primary/20 shrink-0">
                <AvatarImage src={post.authorAvatar} />
                <AvatarFallback>{post.authorName[0]}</AvatarFallback>
              </Avatar>
              <div className="text-left min-w-0">
                <p className="text-gray-900">{post.authorName}</p>
                <p className="text-sm text-gray-500">{new Date(post.date).toLocaleString()}</p>
              </div>
            </button>
            <div className="flex items-center gap-2 shrink-0">
            {post.type !== 'general' ? (
              <Badge className={`${typeColors[post.type]} border`}>
                {post.type.charAt(0).toUpperCase() + post.type.slice(1)}
              </Badge>
            ) : null}
            {editingPost ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setEditDraft({
                    title: post.title,
                    description: post.description,
                    company: post.company ?? '',
                    deadline: post.deadline ?? '',
                    stipend: post.stipend ?? '',
                    duration: post.duration ?? '',
                    location: post.location ?? '',
                    link: post.link ?? '',
                    tags: (post.tags ?? []).join(', '),
                  });
                  setEditingPost(false);
                }}
              >
                Cancel edit
              </Button>
            ) : (
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
                <DropdownMenuItem onClick={() => onSave(post.id)}>
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
                {post.canEdit && onEditPost ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setEditDraft({
                          title: post.title,
                          description: post.description,
                          company: post.company ?? '',
                          deadline: post.deadline ?? '',
                          stipend: post.stipend ?? '',
                          duration: post.duration ?? '',
                          location: post.location ?? '',
                          link: post.link ?? '',
                          tags: (post.tags ?? []).join(', '),
                        });
                        setEditingPost(true);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                  </>
                ) : null}
                {post.canDelete && onDeletePost ? (
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void onDeletePost(post.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
            </div>
          </div>

          {editingPost ? (
            <div className="space-y-4 mb-4">
              {visibleEditableImages.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Post images</p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {visibleEditableImages.map((imageUrl, index) => (
                      <div key={`${post.id}:edit-image:${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
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
                <Textarea value={editDraft.description} onChange={(e) => setEditDraft((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Description" />
              ) : null}
              {showCompanyField || showLocationField || showDeadlineField || showLinkField || showStipendField || showDurationField ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditDraft({
                      title: post.title,
                      description: post.description,
                      company: post.company ?? '',
                      deadline: post.deadline ?? '',
                      stipend: post.stipend ?? '',
                      duration: post.duration ?? '',
                      location: post.location ?? '',
                      link: post.link ?? '',
                      tags: (post.tags ?? []).join(', '),
                    });
                    setEditingPost(false);
                  }}
                >
                  Exit edit
                </Button>
                <Button type="button" onClick={submitPostEdit} className="gradient-primary">
                  Save changes
                </Button>
              </div>
            </div>
          ) : (
            <>
          <div className="space-y-2 mb-4">
            <h1 className="text-2xl text-gray-900">{post.title}</h1>
            <ExpandableText
              text={post.description}
              className="text-gray-700 whitespace-pre-wrap"
              buttonClassName="cl-opportunity-description-toggle text-primary"
            />
          </div>

          {((post.images?.length ?? 0) > 0 || post.image) && (
            <div className="mb-4 rounded-xl bg-gray-50 overflow-hidden">
              <PostCarousel opportunity={post} variant="detail" enableLightbox />
            </div>
          )}

          {detailItems.length > 0 && (
            <div className="mb-4 grid grid-cols-1 gap-3 text-sm text-gray-700 md:grid-cols-2">
              {detailItems.map((item) => (
                <div key={item.key} className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  {item.icon ? <span className="mt-0.5 shrink-0 text-slate-500">{item.icon}</span> : null}
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                    {item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all text-primary hover:underline"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="break-words text-slate-700">{item.value}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {visibleTags.map((tag) => (
                <Badge key={`${post.id}-${tag}`} className="bg-primary/10 text-primary border-primary/20">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}
            </>
          )}
          </div>

          <div className="cl-post-detail-actions flex items-center gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-primary/10">
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

          <div className="cl-post-detail-comments px-4 sm:px-6 py-4 sm:py-6 border-t border-primary/10 space-y-4">
            <div className="space-y-4">
            {topLevelComments.map((comment) => renderComment(comment))}
            </div>

            {commentsState.isLoading && topLevelComments.length === 0 && (
              <LoadingIndicator label="Loading comments..." className="justify-start py-1" size={20} />
            )}

            {!commentsState.isLoading && commentsState.hasHydrated && topLevelComments.length === 0 && (
              <p className="text-sm text-gray-500">No comments yet.</p>
            )}

            {commentsState.hasMore && (
              <div>
                <AutoLoadTrigger
                  enabled={!commentsState.isLoading}
                  onVisible={() => {
                    void onLoadMoreComments?.();
                  }}
                />
                {commentsState.isLoading && topLevelComments.length > 0 && (
                  <LoadingIndicator label="Loading more comments..." className="justify-start py-1 text-xs" size={18} />
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Avatar className="w-8 h-8 ring-2 ring-primary/10 shrink-0">
                <AvatarImage src={currentUserAvatar} />
                <AvatarFallback>{currentUserInitial}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                {replyTarget && (
                  <div className="flex items-center justify-between rounded-xl bg-primary/5 px-3 py-2 text-sm text-primary">
                    <span>Replying to {replyTarget.authorName}</span>
                    <button
                      type="button"
                      className="text-xs hover:underline"
                      onClick={() => setReplyTarget(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <Textarea
                  id="post-comment-composer"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={replyTarget ? `Write a reply to ${replyTarget.authorName}...` : 'Write a comment...'}
                  className="resize-none border-primary/20 focus:border-primary rounded-xl"
                  rows={3}
                />
                <Button
                  onClick={submitComposer}
                  size="sm"
                  disabled={!commentText.trim()}
                  className="gradient-primary"
                >
                  {replyTarget ? 'Reply' : 'Comment'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
