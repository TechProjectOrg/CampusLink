import type { UserPost } from './postsApi';
import { resolvePostImageUrls, withOpportunityImages } from './mediaUtils';
import type { Opportunity, Student } from '../types';

export function mapPostCommentToComment(comment: UserPost['comments'][number]): Opportunity['comments'][number] {
  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorUserId,
    authorName: comment.authorDisplayName || comment.authorUsername,
    authorAvatar: comment.authorProfilePictureUrl || undefined,
    content: comment.content,
    timestamp: comment.createdAt,
    parentCommentId: comment.parentCommentId,
    likeCount: comment.likeCount,
    replyCount: comment.replyCount,
    isLikedByMe: comment.isLikedByMe,
    canDelete: comment.canDelete,
    replies: comment.replies.map((reply) => mapPostCommentToComment(reply)),
  };
}

export function userPostToOpportunity(
  post: UserPost,
  usersById: Record<string, Student>,
  currentUser: Student | null,
): Opportunity {
  let type: Opportunity['type'] = 'general';
  const isProjectPost = (post.hashtags ?? []).some((tag) => tag.trim().toLowerCase() === 'project');
  if (post.postType === 'event') {
    type = 'event';
  } else if (post.postType === 'club_activity') {
    type = 'club';
  } else if (post.postType === 'opportunity') {
    type = (post.opportunityType ?? 'event') as Opportunity['type'];
  } else if (isProjectPost) {
    type = 'project';
  }

  const author = usersById[post.authorUserId];
  const authorName =
    author?.name ?? post.authorDisplayName ?? post.authorUsername ?? currentUser?.name ?? 'Unknown User';
  const authorAvatar =
    author?.avatar ??
    post.authorProfilePictureUrl ??
    (post.authorUserId === currentUser?.id ? currentUser?.avatar : undefined);

  const imageFields = withOpportunityImages(resolvePostImageUrls(post.media));

  return {
    id: post.id,
    authorId: post.authorUserId,
    authorName,
    authorAvatar,
    clubId: post.clubId,
    clubName: post.clubName ?? null,
    clubSlug: post.clubSlug ?? null,
    clubAvatarUrl: post.clubAvatarUrl ?? null,
    type,
    title: post.title ?? '',
    description: post.contentText ?? '',
    date: post.createdAt,
    company: post.company ?? undefined,
    deadline: post.deadline ?? undefined,
    stipend: post.stipend ?? undefined,
    duration: post.duration ?? undefined,
    location: post.location ?? undefined,
    link: post.externalUrl ?? undefined,
    ...imageFields,
    tags: post.hashtags,
    likes: [],
    comments: (post.comments ?? []).map((comment) => mapPostCommentToComment(comment)),
    saved: [],
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    saveCount: post.saveCount,
    isLikedByMe: post.isLikedByMe,
    isSavedByMe: post.isSavedByMe,
    canEdit: post.canEdit,
    canDelete: post.canDelete,
  };
}
