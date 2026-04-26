import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { AuthPage } from './components/AuthPage';
import { FeedPage } from './components/FeedPage';
import { ProfilePage } from './components/ProfilePage';
import { SearchPage } from './components/SearchPage';
import { NetworkPage } from './components/NetworkPage';
import { ChatPage } from './components/ChatPage';
import { ClubsPage } from './components/ClubsPage';
import { NotificationsPage } from './components/NotificationsPage';
import { SettingsPage } from './components/SettingsPage';
import { PostPage } from './components/PostPage';
import { HashtagPostsPage } from './components/HashtagPostsPage';
import { FloatingChat } from './components/FloatingChat';
import { LoadingState } from './components/LoadingState';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Student, Opportunity, Club, Notification, Comment } from './types';
import { ProfileCard } from './components/ProfileCard';
import { SuggestionsCard } from './components/SuggestionsCard';
import { useAuth } from './context/AuthContext';
import { apiFetchUserProfile } from './lib/authApi';
import { resolveApiBaseUrl } from './lib/apiBase';
import {
  apiGetFollowGraph,
  apiFollow,
  apiUnfollow,
  apiCancelFollowRequest,
  apiAcceptFollowRequest,
  apiRejectFollowRequest,
  apiRemoveFollower,
  type FollowGraphResponse,
  type NetworkUser,
  type NetworkUserWithRequest,
} from './lib/networkApi';
import {
  apiFetchNotifications,
  apiFetchPushPublicKey,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  apiSavePushSubscription,
  type ApiNotification,
} from './lib/notificationsApi';
import { apiFetchConversations, apiStartConversation } from './lib/chatApi';
import {
  apiAddComment,
  apiAddReply,
  apiCreateUserPost,
  apiDeleteComment,
  apiDeletePost,
  apiFetchHashtagPosts,
  apiFetchCommentContext,
  apiFetchCommentReplies,
  apiFetchFeedPosts,
  apiFetchPostById,
  apiFetchPostComments,
  apiLikeComment,
  apiLikePost,
  apiSavePost,
  apiUnlikeComment,
  apiUnlikePost,
  apiUnsavePost,
  apiUpdatePost,
  type CreateUserPostPayload,
  type UserPost,
} from './lib/postsApi';
import type { ApiUserProfile } from './types';

const POST_COMMENTS_PAGE_SIZE = 20;
const COMMENT_REPLIES_PAGE_SIZE = 10;

// ============================================================
// FollowGraph adapter: backend shape → frontend FollowGraph shape
// ============================================================

export interface FollowGraph {
  followersByUserId: Record<string, string[]>;
  followingByUserId: Record<string, string[]>;
  incomingRequestsByUserId: Record<string, string[]>;
  outgoingRequestsByUserId: Record<string, string[]>;
}

/** Map from requestId to the corresponding user entry */
export type RequestIdMap = Record<string, NetworkUserWithRequest>;

function buildFollowGraph(
  data: FollowGraphResponse,
  currentUserId: string
): { graph: FollowGraph; requestIdMap: RequestIdMap } {
  const graph: FollowGraph = {
    followersByUserId: { [currentUserId]: data.followers.map((u) => u.userId) },
    followingByUserId: { [currentUserId]: data.following.map((u) => u.userId) },
    incomingRequestsByUserId: { [currentUserId]: data.incomingRequests.map((u) => u.userId) },
    outgoingRequestsByUserId: { [currentUserId]: data.outgoingRequests.map((u) => u.userId) },
  };

  const requestIdMap: RequestIdMap = {};
  for (const r of data.incomingRequests) {
    requestIdMap[r.userId] = r;
  }

  return { graph, requestIdMap };
}

/** Convert backend notification → frontend Notification type */
function apiNotificationToLocal(n: ApiNotification): Notification {
  const actorPfp = n.actor?.profilePictureUrl;
  const seed = encodeURIComponent(n.actor?.username ?? n.title ?? 'user');
  const avatar = actorPfp || undefined;

  return {
    id: n.id,
    type: n.type as Notification['type'],
    title: n.title,
    message: n.message,
    avatar,
    timestamp: n.createdAt,
    read: n.read,
    actionUrl: undefined,
    entityType: n.entityType,
    entityId: n.entityId,
    actorId: n.actor?.userId,
  };
}

function mergeRealtimeNotification(prev: Notification[], incoming: Notification): Notification[] {
  const existingIndex = prev.findIndex((item) => item.id === incoming.id);
  if (existingIndex === -1) {
    return [incoming, ...prev];
  }

  const next = [...prev];
  next[existingIndex] = {
    ...next[existingIndex],
    ...incoming,
  };
  return next;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function buildCreatePostPayloadFromDraft(draft: any): CreateUserPostPayload {
  const baseContent = typeof draft?.description === 'string' ? draft.description.trim() : '';
  const normalizedTags = Array.isArray(draft?.tags)
    ? Array.from(
        new Set(
          draft.tags
            .map((tag: unknown) => String(tag).trim())
            .filter(Boolean)
        )
      )
    : [];

  const mediaUrl = typeof draft?.image === 'string' && draft.image.trim().length > 0 ? draft.image.trim() : null;
  const media = mediaUrl && !mediaUrl.startsWith('blob:') ? [{ mediaUrl, mediaType: 'image', sortOrder: 0 }] : [];

  const draftType = String(draft?.type ?? 'general').toLowerCase();

  if (draftType === 'event') {
    return {
      postType: 'event',
      title: typeof draft?.title === 'string' ? draft.title.trim() : '',
      contentText: baseContent,
      eventDate: typeof draft?.eventDate === 'string' ? draft.eventDate : undefined,
      location: typeof draft?.location === 'string' ? draft.location.trim() : undefined,
      externalUrl: typeof draft?.link === 'string' ? draft.link.trim() : undefined,
      hashtags: normalizedTags,
      media,
    };
  }

  if (['internship', 'hackathon', 'event', 'contest', 'club'].includes(draftType)) {
    return {
      postType: 'opportunity',
      opportunityType: draftType as CreateUserPostPayload['opportunityType'],
      title: typeof draft?.title === 'string' ? draft.title.trim() : '',
      contentText: baseContent,
      company: typeof draft?.company === 'string' ? draft.company.trim() : undefined,
      deadline: typeof draft?.deadline === 'string' ? draft.deadline : undefined,
      stipend: typeof draft?.stipend === 'string' ? draft.stipend.trim() : undefined,
      duration: typeof draft?.duration === 'string' ? draft.duration.trim() : undefined,
      eventDate: typeof draft?.deadline === 'string' ? draft.deadline : undefined,
      location: typeof draft?.location === 'string' ? draft.location.trim() : undefined,
      externalUrl: typeof draft?.link === 'string' ? draft.link.trim() : undefined,
      hashtags: normalizedTags,
      media,
    };
  }

  return {
    postType: 'general',
    contentText: baseContent,
    hashtags: normalizedTags,
    media,
  };
}

function mapPostCommentToComment(comment: UserPost['comments'][number]): Opportunity['comments'][number] {
  const fallbackSeed = encodeURIComponent(comment.authorUsername || comment.authorUserId || 'user');
  return {
    id: comment.id,
    postId: comment.postId,
    authorId: comment.authorUserId,
    authorName: comment.authorUsername,
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

function userPostToOpportunity(post: UserPost, currentUser: Student): Opportunity {
  let type: Opportunity['type'] = 'general';
  if (post.postType === 'event') {
    type = 'event';
  } else if (post.postType === 'opportunity') {
    type = (post.opportunityType ?? 'event') as Opportunity['type'];
  }

  const authorName = post.authorUsername ?? currentUser.name;
  const authorAvatar =
    post.authorProfilePictureUrl ??
    (post.authorUserId === currentUser.id
      ? currentUser.avatar
      : undefined);

  return {
    id: post.id,
    authorId: post.authorUserId,
    authorName,
    authorAvatar,
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
    image: post.media[0]?.mediaUrl,
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

interface DiscussionPageState<T> {
  items: T[];
  nextCursor: string | null;
  isLoading: boolean;
  hasMore: boolean;
  hasHydrated: boolean;
}

interface ReplyThreadState extends DiscussionPageState<Comment> {
  isExpanded: boolean;
}

function createInitialDiscussionPageState<T>(): DiscussionPageState<T> {
  return {
    items: [],
    nextCursor: null,
    isLoading: false,
    hasMore: true,
    hasHydrated: false,
  };
}

function mergeUniqueComments(existing: Comment[], incoming: Comment[]): Comment[] {
  const merged = [...existing];
  const seen = new Set(existing.map((comment) => comment.id));
  for (const comment of incoming) {
    if (seen.has(comment.id)) continue;
    merged.push(comment);
    seen.add(comment.id);
  }
  return merged;
}

function findCommentInTree(comments: Comment[], commentId: string): Comment | null {
  for (const comment of comments) {
    if (comment.id === commentId) {
      return comment;
    }
    const nested = findCommentInTree(comment.replies ?? [], commentId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function updateCommentInTree(
  comments: Comment[],
  commentId: string,
  updater: (comment: Comment) => Comment,
): Comment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return updater(comment);
    }

    if (!comment.replies || comment.replies.length === 0) {
      return comment;
    }

    return {
      ...comment,
      replies: updateCommentInTree(comment.replies, commentId, updater),
    };
  });
}

function removeCommentFromTree(comments: Comment[], commentId: string): { comments: Comment[]; removed: Comment | null } {
  let removed: Comment | null = null;
  const nextComments = comments
    .filter((comment) => {
      if (comment.id === commentId) {
        removed = comment;
        return false;
      }
      return true;
    })
    .map((comment) => {
      if (removed || !comment.replies || comment.replies.length === 0) {
        return comment;
      }
      const nested = removeCommentFromTree(comment.replies, commentId);
      if (nested.removed) {
        removed = nested.removed;
        return {
          ...comment,
          replies: nested.comments,
        };
      }
      return comment;
    });

  return { comments: nextComments, removed };
}

function mergeReplyThreadsIntoComments(
  comments: Comment[],
  repliesByCommentId: Record<string, ReplyThreadState>,
): Comment[] {
  return comments.map((comment) => {
    const thread = repliesByCommentId[comment.id];
    const mergedReplies = mergeReplyThreadsIntoComments(thread?.items ?? comment.replies ?? [], repliesByCommentId);
    return {
      ...comment,
      replies: mergedReplies,
      replyCount: comment.replyCount ?? mergedReplies.length,
    };
  });
}

function updateReplyThreads(
  threads: Record<string, ReplyThreadState>,
  updater: (thread: ReplyThreadState) => ReplyThreadState,
): Record<string, ReplyThreadState> {
  const nextEntries = Object.entries(threads).map(([commentId, thread]) => [commentId, updater(thread)] as const);
  return Object.fromEntries(nextEntries);
}

function removeCommentFromReplyThreads(
  threads: Record<string, ReplyThreadState>,
  commentId: string,
): { threads: Record<string, ReplyThreadState>; removed: Comment | null } {
  let removed: Comment | null = null;
  const nextEntries = Object.entries(threads).map(([threadCommentId, thread]) => {
    if (removed) {
      return [threadCommentId, thread] as const;
    }

    const nextItems = removeCommentFromTree(thread.items, commentId);
    if (nextItems.removed) {
      removed = nextItems.removed;
      return [
        threadCommentId,
        {
          ...thread,
          items: nextItems.comments,
        },
      ] as const;
    }

    return [threadCommentId, thread] as const;
  });

  return {
    threads: Object.fromEntries(nextEntries),
    removed,
  };
}

function findCommentStateById(
  opportunities: Opportunity[],
  commentId: string,
): { isLiked: boolean; likeCount: number } | null {
  const stack: Comment[] = [];
  for (const opportunity of opportunities) {
    stack.push(...(opportunity.comments ?? []));
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.id === commentId) {
      return {
        isLiked: Boolean(current.isLikedByMe),
        likeCount: Math.max(current.likeCount ?? 0, 0),
      };
    }
    stack.push(...(current.replies ?? []));
  }

  return null;
}

function updateCommentLikeState(comments: Comment[], commentId: string, nextLiked: boolean): Comment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      const currentLikeCount = comment.likeCount ?? 0;
      return {
        ...comment,
        isLikedByMe: nextLiked,
        likeCount: Math.max(currentLikeCount + (nextLiked ? 1 : -1), 0),
      };
    }

    if (!comment.replies || comment.replies.length === 0) {
      return comment;
    }

    return {
      ...comment,
      replies: updateCommentLikeState(comment.replies, commentId, nextLiked),
    };
  });
}

function restoreCommentLikeState(
  comments: Comment[],
  commentId: string,
  likedState: boolean,
  likeCount: number,
): Comment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return {
        ...comment,
        isLikedByMe: likedState,
        likeCount: Math.max(likeCount, 0),
      };
    }

    if (!comment.replies || comment.replies.length === 0) {
      return comment;
    }

    return {
      ...comment,
      replies: restoreCommentLikeState(comment.replies, commentId, likedState, likeCount),
    };
  });
}

function attachRepliesToComment(comments: Comment[], commentId: string, replies: Comment[]): Comment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return {
        ...comment,
        replies,
        replyCount: replies.length,
      };
    }

    if (!comment.replies || comment.replies.length === 0) {
      return comment;
    }

    return {
      ...comment,
      replies: attachRepliesToComment(comment.replies, commentId, replies),
    };
  });
}

function findRepliesForComment(comments: Comment[], commentId: string): Comment[] | null {
  for (const comment of comments) {
    if (comment.id === commentId) {
      return comment.replies ?? [];
    }

    const nestedReplies = findRepliesForComment(comment.replies ?? [], commentId);
    if (nestedReplies) {
      return nestedReplies;
    }
  }

  return null;
}

// ============================================================
// Merge network users into students list
// ============================================================
function networkUsersToStudents(users: NetworkUser[]): Student[] {
  return users.map((u) => {
    const seed = encodeURIComponent(u.username);
    return {
      id: u.userId,
      name: u.username,
      username: u.username,
      email: '',
      branch: u.branch ?? 'Unknown',
      year: u.year ?? 0,
      avatar: u.profilePictureUrl || undefined,
      bio: '',
      skills: [],
      interests: [],
      certifications: [],
      experience: [],
      societies: [],
      achievements: [],
      projects: [],
      accountType: u.isPrivate ? ('private' as const) : ('public' as const),
    };
  });
}

export default function App() {
  const auth = useAuth();

  const [activeTab, setActiveTab] = useState('feed');
  const [students, setStudents] = useState<Student[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [followGraph, setFollowGraph] = useState<FollowGraph>({
    followersByUserId: {},
    followingByUserId: {},
    incomingRequestsByUserId: {},
    outgoingRequestsByUserId: {},
  });
  const [requestIdMap, setRequestIdMap] = useState<RequestIdMap>({});
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null);
  const [postsRefreshToken, setPostsRefreshToken] = useState(0);
  const [openedPost, setOpenedPost] = useState<Opportunity | null>(null);
  const [openedPostId, setOpenedPostId] = useState<string | null>(null);
  const [openedPostComments, setOpenedPostComments] = useState<DiscussionPageState<Comment>>(
    createInitialDiscussionPageState<Comment>(),
  );
  const [openedPostRepliesByCommentId, setOpenedPostRepliesByCommentId] = useState<Record<string, ReplyThreadState>>({});
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
  const [hashtagPageTag, setHashtagPageTag] = useState<string | null>(null);
  const [hashtagOpportunities, setHashtagOpportunities] = useState<Opportunity[]>([]);
  const [isHashtagPostsLoading, setIsHashtagPostsLoading] = useState(false);

  const prevAuthenticatedRef = useRef<boolean>(auth.isAuthenticated);
  const openedPostCommentsRef = useRef<DiscussionPageState<Comment>>(createInitialDiscussionPageState<Comment>());
  const openedPostRepliesRef = useRef<Record<string, ReplyThreadState>>({});

  const clearSessionScopedState = useCallback(() => {
    setStudents(auth.currentUser ? [auth.currentUser] : []);
    setOpportunities([]);
    setHashtagOpportunities([]);
    setNotifications([]);
    setConversations([]);
    setFollowGraph({
      followersByUserId: {},
      followingByUserId: {},
      incomingRequestsByUserId: {},
      outgoingRequestsByUserId: {},
    });
    setRequestIdMap({});
    setViewingProfileId(null);
    setOpenedPost(null);
    setOpenedPostId(null);
    setOpenedPostComments(createInitialDiscussionPageState<Comment>());
    setOpenedPostRepliesByCommentId({});
    setFocusedCommentId(null);
    setHashtagPageTag(null);
    setSelectedHashtag(null);
  }, [auth.currentUser]);

  // Always land on homescreen after a successful login/signup.
  useLayoutEffect(() => {
    const wasAuthenticated = prevAuthenticatedRef.current;
    const isAuthenticated = auth.isAuthenticated;

    // Transition: logged in
    if (!wasAuthenticated && isAuthenticated) {
      clearSessionScopedState();
      setSearchQuery('');
      setActiveTab('feed');
      window.history.pushState({ tab: 'feed' }, '', '/feed');
    }

    // Transition: logged out (optional, but avoids restoring old tab on next login)
    if (wasAuthenticated && !isAuthenticated) {
      clearSessionScopedState();
      setSearchQuery('');
      setActiveTab('feed');
      window.history.pushState({ tab: 'feed' }, '', '/feed');
    }

    prevAuthenticatedRef.current = isAuthenticated;
  }, [auth.isAuthenticated, clearSessionScopedState]);
  
  useEffect(() => {
    const setTabFromPath = () => {
        const pathParts = window.location.pathname.split('/').filter(p => p);
        const searchParams = new URLSearchParams(window.location.search);
        const mainPath = pathParts[0] || 'feed';
        setActiveTab(mainPath);

        if (mainPath === 'profile' && pathParts[1]) {
            setViewingProfileId(pathParts[1]);
            setOpenedPostId(null);
            setOpenedPost(null);
            setOpenedPostComments(createInitialDiscussionPageState<Comment>());
            setOpenedPostRepliesByCommentId({});
            setFocusedCommentId(null);
            setHashtagPageTag(null);
        } else if (mainPath === 'post' && pathParts[1]) {
            setOpenedPostId(pathParts[1]);
            const matched = opportunities.find((item) => item.id === pathParts[1]) ?? null;
            setOpenedPost(matched);
            setOpenedPostComments(createInitialDiscussionPageState<Comment>());
            setOpenedPostRepliesByCommentId({});
            setViewingProfileId(null);
            setFocusedCommentId(searchParams.get('commentId')?.trim() || null);
            setHashtagPageTag(null);
        } else if (mainPath === 'hashtag' && pathParts[1]) {
            const decodedTag = decodeURIComponent(pathParts[1]).trim().replace(/^#+/, '');
            setHashtagPageTag(decodedTag || null);
            setViewingProfileId(null);
            setOpenedPostId(null);
            setOpenedPost(null);
            setOpenedPostComments(createInitialDiscussionPageState<Comment>());
            setOpenedPostRepliesByCommentId({});
            setFocusedCommentId(null);
        } else {
            setViewingProfileId(null);
            setOpenedPostId(null);
            setOpenedPost(null);
            setOpenedPostComments(createInitialDiscussionPageState<Comment>());
            setOpenedPostRepliesByCommentId({});
            setFocusedCommentId(null);
            setHashtagPageTag(null);
        }
    };

    setTabFromPath(); // Initial load

    const handlePopState = () => {
        setTabFromPath();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
        window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = (
    tab: string,
    profileId?: string,
    postId?: string,
    options?: { commentId?: string; hashtag?: string }
  ) => {
    let path = `/${tab}`;
    const state: { tab: string; profileId?: string; postId?: string; commentId?: string; hashtag?: string } = { tab };
    if (tab === 'profile' && profileId) {
        path += `/${profileId}`;
        state.profileId = profileId;
        setViewingProfileId(profileId);
        setOpenedPost(null);
        setOpenedPostId(null);
        setOpenedPostComments(createInitialDiscussionPageState<Comment>());
        setOpenedPostRepliesByCommentId({});
        setFocusedCommentId(null);
        setHashtagPageTag(null);
    } else if (tab === 'post' && postId) {
        path += `/${postId}`;
        if (options?.commentId) {
          path += `?commentId=${encodeURIComponent(options.commentId)}`;
          state.commentId = options.commentId;
        }
        state.postId = postId;
        setViewingProfileId(null);
        setOpenedPostId(postId);
        setOpenedPostComments(createInitialDiscussionPageState<Comment>());
        setOpenedPostRepliesByCommentId({});
        setFocusedCommentId(options?.commentId?.trim() || null);
        setHashtagPageTag(null);
    } else if (tab === 'hashtag' && options?.hashtag) {
        const normalized = options.hashtag.trim().replace(/^#+/, '');
        path += `/${encodeURIComponent(normalized)}`;
        state.hashtag = normalized;
        setHashtagPageTag(normalized || null);
        setViewingProfileId(null);
        setOpenedPostId(null);
        setOpenedPost(null);
        setOpenedPostComments(createInitialDiscussionPageState<Comment>());
        setOpenedPostRepliesByCommentId({});
        setFocusedCommentId(null);
    } else if (tab !== 'profile') {
        setViewingProfileId(null);
        if (tab !== 'post') {
          setOpenedPost(null);
          setOpenedPostId(null);
          setOpenedPostComments(createInitialDiscussionPageState<Comment>());
          setOpenedPostRepliesByCommentId({});
          setFocusedCommentId(null);
        }
        if (tab !== 'hashtag') {
          setHashtagPageTag(null);
        }
    }
    window.history.pushState(state, '', path);
    setActiveTab(tab); // Set active tab to trigger re-render
  };
  
  const currentUser = useMemo(() => {
    return auth.currentUser as Student;
  }, [auth.currentUser]);

  const currentUserId = currentUser?.id ?? '';
  const authToken = auth.session?.token;
  const apiBase = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

  useEffect(() => {
    openedPostCommentsRef.current = openedPostComments;
  }, [openedPostComments]);

  useEffect(() => {
    openedPostRepliesRef.current = openedPostRepliesByCommentId;
  }, [openedPostRepliesByCommentId]);

  // ============================================================
  // Fetch follow graph + notifications from backend on login
  // ============================================================

  const refreshFollowGraph = useCallback(async () => {
    if (!authToken) return;
    try {
      const data = await apiGetFollowGraph(authToken);
      const { graph, requestIdMap: rMap } = buildFollowGraph(data, currentUserId);
      setFollowGraph(graph);
      setRequestIdMap(rMap);

      // Merge network users into the students list so Network/Profile pages can look users up
      const allNetworkUsers: NetworkUser[] = [
        ...data.followers,
        ...data.following,
        ...data.incomingRequests,
        ...data.outgoingRequests,
      ];
      const uniqueUsersMap = new Map<string, NetworkUser>();
      allNetworkUsers.forEach(u => uniqueUsersMap.set(u.userId, u));
      const newStudents = networkUsersToStudents(Array.from(uniqueUsersMap.values()));
      setStudents((prev) => {
        const existingIds = new Set(prev.map((s) => s.id));
        const toAdd = newStudents.filter((s) => !existingIds.has(s.id));
        return [...prev, ...toAdd];
      });
    } catch (err) {
      console.error('Failed to fetch follow graph:', err);
    }
  }, [authToken, currentUserId]);

  const refreshNotifications = useCallback(async () => {
    if (!authToken) return;
    try {
      const data = await apiFetchNotifications(authToken);
      setNotifications(data.map(apiNotificationToLocal).filter((notification) => notification.type !== 'message'));
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }, [authToken]);

  const refreshFeedPosts = useCallback(async () => {
    if (!authToken || !currentUserId) return;

    try {
      const posts = await apiFetchFeedPosts(authToken, selectedHashtag ?? undefined);
      const mapped = posts.map((post) => userPostToOpportunity(post, currentUser));
      setOpportunities(mapped);
    } catch (err) {
      console.error('Failed to fetch feed posts:', err);
    }
  }, [authToken, currentUserId, currentUser, selectedHashtag]);

  const refreshHashtagPosts = useCallback(async () => {
    const tag = hashtagPageTag?.trim();
    if (!authToken || !currentUserId || !tag) return;

    setIsHashtagPostsLoading(true);
    try {
      const posts = await apiFetchHashtagPosts(tag, authToken, 100, 0);
      setHashtagOpportunities(posts.map((post) => userPostToOpportunity(post, currentUser)));
    } catch (err) {
      console.error('Failed to fetch hashtag posts:', err);
      setHashtagOpportunities([]);
    } finally {
      setIsHashtagPostsLoading(false);
    }
  }, [authToken, currentUserId, hashtagPageTag, currentUser]);

  const refreshConversations = useCallback(async () => {
    if (!authToken) return;
    try {
      const convos = await apiFetchConversations(authToken, 'active');
      setConversations(convos as any);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, [authToken]);

  useEffect(() => {
    if (auth.isAuthenticated && authToken) {
      refreshFollowGraph();
      refreshNotifications();
      refreshFeedPosts();
      refreshConversations();
    }
  }, [auth.isAuthenticated, authToken, refreshFollowGraph, refreshNotifications, refreshFeedPosts, refreshConversations]);

  useEffect(() => {
    if (!auth.isAuthenticated || !authToken) return;
    if (activeTab !== 'hashtag') return;
    if (!hashtagPageTag) return;
    void refreshHashtagPosts();
  }, [auth.isAuthenticated, authToken, activeTab, hashtagPageTag, refreshHashtagPosts]);

  useEffect(() => {
    if (!authToken || !auth.isAuthenticated) return;

    const wsBase = apiBase.replace(/^http/i, 'ws').replace(/\/+$/, '');
    const socket = new WebSocket(`${wsBase}/ws?token=${encodeURIComponent(authToken)}`);

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as {
          type?: string;
          payload?: any;
        };

        if (!parsed?.type || !parsed.payload) return;

        if (parsed.type.startsWith('notification:')) {
          if (parsed.payload?.type === 'message' || parsed.payload?.notificationType === 'message') return;
          const local = apiNotificationToLocal(parsed.payload);
          setNotifications((prev) => mergeRealtimeNotification(prev, local));
        } else if (parsed.type.startsWith('feed:')) {
          const postId = String(parsed.payload?.postId ?? '');
          if (!postId) return;

          if (parsed.type === 'feed:post_deleted') {
            setOpportunities((prev) => prev.filter((item) => item.id !== postId));
            setHashtagOpportunities((prev) => prev.filter((item) => item.id !== postId));
            setOpenedPost((prev) => (prev?.id === postId ? null : prev));
            return;
          }

          if (parsed.type === 'feed:post_created' || parsed.type === 'feed:post_updated') {
            void refreshFeedPosts();
            if (hashtagPageTag) void refreshHashtagPosts();
            return;
          }

          if (String(parsed.payload?.userId ?? '') === currentUserId) {
            return;
          }

          const likeDelta =
            parsed.type === 'feed:post_liked' ? 1 : parsed.type === 'feed:post_unliked' ? -1 : 0;
          const commentDelta =
            parsed.type === 'feed:comment_created' || parsed.type === 'feed:reply_created' ? 1 : 0;

          const applyFeedDelta = (items: Opportunity[]) =>
            items.map((item) =>
              item.id !== postId
                ? item
                : {
                    ...item,
                    likeCount: Math.max((item.likeCount ?? item.likes.length) + likeDelta, 0),
                    commentCount: Math.max((item.commentCount ?? item.comments.length) + commentDelta, 0),
                  },
            );

          setOpportunities(applyFeedDelta);
          setHashtagOpportunities(applyFeedDelta);
          setOpenedPost((prev) => (prev ? applyFeedDelta([prev])[0] : prev));
        } else if (parsed.type.startsWith('chat:')) {
          window.dispatchEvent(new CustomEvent('campuslynk:chat', { detail: parsed }));
          
          if (parsed.type === 'chat:message' || parsed.type === 'chat:status' || parsed.type === 'chat:read') {
            void refreshConversations();
          }
        }
      } catch (err) {
        console.error('Failed to parse realtime payload:', err);
      }
    };

    return () => {
      socket.close();
    };
  }, [authToken, auth.isAuthenticated, apiBase, currentUserId, hashtagPageTag, refreshFeedPosts, refreshHashtagPosts]);

  useEffect(() => {
    if (!authToken || !auth.isAuthenticated) return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    void (async () => {
      try {
        const publicKey = await apiFetchPushPublicKey(authToken);
        if (cancelled || !publicKey) return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(publicKey),
          });
        }

        await apiSavePushSubscription(subscription, authToken);
      } catch (err) {
        console.error('Push subscription setup skipped:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, auth.isAuthenticated]);

  // Also refresh notifications when switching to the notifications tab
  useEffect(() => {
    if (activeTab === 'notifications') {
      refreshNotifications();
      refreshFollowGraph();
    }
    if (activeTab === 'network') {
      refreshFollowGraph();
    }
  }, [activeTab, refreshNotifications, refreshFollowGraph]);

  const pendingIncomingRequestIds = useMemo(
    () => Object.values(requestIdMap).map((r) => r.requestId),
    [requestIdMap]
  );

  // Ensure the authenticated user is present in the in-memory students list.
  useEffect(() => {
    if (!auth.currentUser) return;

    setStudents((prev) => {
      const filtered = prev.filter((s) => s.id !== 'current' && s.id !== currentUserId);
      return [currentUser, ...filtered].filter(Boolean) as Student[];
    });
  }, [auth.currentUser, currentUser, currentUserId]);

  // Opportunity handlers
  const handleLike = (opportunityId: string) => {
    const target =
      opportunities.find((opp) => opp.id === opportunityId) ??
      hashtagOpportunities.find((opp) => opp.id === opportunityId);
    if (!target) return;
    const nextLiked = !(target.isLikedByMe ?? target.likes.includes(currentUserId));
    const previousLiked = Boolean(target.isLikedByMe ?? target.likes.includes(currentUserId));
    const previousLikeCount = Math.max(target.likeCount ?? target.likes.length, 0);

    setOpportunities((prev) =>
      prev.map((opp) =>
        opp.id !== opportunityId
          ? opp
          : {
              ...opp,
              isLikedByMe: nextLiked,
              likeCount: Math.max((opp.likeCount ?? opp.likes.length) + (nextLiked ? 1 : -1), 0),
            },
      ),
    );
    setHashtagOpportunities((prev) =>
      prev.map((opp) =>
        opp.id !== opportunityId
          ? opp
          : {
              ...opp,
              isLikedByMe: nextLiked,
              likeCount: Math.max((opp.likeCount ?? opp.likes.length) + (nextLiked ? 1 : -1), 0),
            },
      ),
    );

    void (async () => {
      try {
        if (nextLiked) {
          await apiLikePost(opportunityId, authToken);
        } else {
          await apiUnlikePost(opportunityId, authToken);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to update like');
        setOpportunities((prev) =>
          prev.map((opp) =>
            opp.id !== opportunityId
              ? opp
              : {
                  ...opp,
                  isLikedByMe: previousLiked,
                  likeCount: previousLikeCount,
                },
          ),
        );
        setHashtagOpportunities((prev) =>
          prev.map((opp) =>
            opp.id !== opportunityId
              ? opp
              : {
                  ...opp,
                  isLikedByMe: previousLiked,
                  likeCount: previousLikeCount,
                },
          ),
        );
      }
    })();
  };

  const handleSave = (opportunityId: string) => {
    const target =
      opportunities.find((opp) => opp.id === opportunityId) ??
      hashtagOpportunities.find((opp) => opp.id === opportunityId);
    if (!target) return;
    const nextSaved = !(target.isSavedByMe ?? target.saved.includes(currentUserId));

    setOpportunities((prev) =>
      prev.map((opp) =>
        opp.id !== opportunityId
          ? opp
          : {
              ...opp,
              isSavedByMe: nextSaved,
              saveCount: Math.max((opp.saveCount ?? opp.saved.length) + (nextSaved ? 1 : -1), 0),
            },
      ),
    );
    setHashtagOpportunities((prev) =>
      prev.map((opp) =>
        opp.id !== opportunityId
          ? opp
          : {
              ...opp,
              isSavedByMe: nextSaved,
              saveCount: Math.max((opp.saveCount ?? opp.saved.length) + (nextSaved ? 1 : -1), 0),
            },
      ),
    );

    void (async () => {
      try {
        if (nextSaved) {
          await apiSavePost(opportunityId, authToken);
        } else {
          await apiUnsavePost(opportunityId, authToken);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to update save');
        await refreshFeedPosts();
        if (hashtagPageTag) {
          await refreshHashtagPosts();
        }
      }
    })();
  };

  const loadInitialPostComments = useCallback(async (postId: string) => {
    if (!authToken) return;

    setOpenedPostComments((prev) =>
      prev.isLoading
        ? prev
        : {
            ...prev,
            isLoading: true,
          },
    );

    try {
      const page = await apiFetchPostComments(postId, authToken, POST_COMMENTS_PAGE_SIZE);
      const comments = page.comments.map((comment) => mapPostCommentToComment(comment));
      setOpenedPostComments({
        items: comments,
        nextCursor: page.nextCursor,
        isLoading: false,
        hasMore: Boolean(page.nextCursor),
        hasHydrated: true,
      });
      setOpenedPostRepliesByCommentId({});
    } catch (err) {
      setOpenedPostComments((prev) => ({
        ...prev,
        isLoading: false,
        hasHydrated: true,
      }));
      throw err;
    }
  }, [authToken]);

  const loadMorePostComments = useCallback(async () => {
    if (!authToken || !openedPostId) return;

    const currentState = openedPostCommentsRef.current;
    if (currentState.isLoading || !currentState.hasMore || !currentState.nextCursor) return;

    setOpenedPostComments((prev) => ({
      ...prev,
      isLoading: true,
    }));

    try {
      const page = await apiFetchPostComments(
        openedPostId,
        authToken,
        POST_COMMENTS_PAGE_SIZE,
        currentState.nextCursor,
      );
      const comments = page.comments.map((comment) => mapPostCommentToComment(comment));
      setOpenedPostComments((prev) => ({
        items: mergeUniqueComments(prev.items, comments),
        nextCursor: page.nextCursor,
        isLoading: false,
        hasMore: Boolean(page.nextCursor),
        hasHydrated: true,
      }));
    } catch (err) {
      setOpenedPostComments((prev) => ({
        ...prev,
        isLoading: false,
        hasHydrated: true,
      }));
      toast.error(err instanceof Error ? err.message : 'Unable to load more comments');
    }
  }, [authToken, openedPostId]);

  const loadInitialReplies = useCallback(async (commentId: string) => {
    if (!authToken) return;

    setOpenedPostRepliesByCommentId((prev) => {
      const existing = prev[commentId];
      if (existing?.isLoading) return prev;
      return {
        ...prev,
        [commentId]: {
          items: existing?.items ?? [],
          nextCursor: existing?.nextCursor ?? null,
          isLoading: true,
          hasMore: existing?.hasMore ?? true,
          hasHydrated: existing?.hasHydrated ?? false,
          isExpanded: true,
        },
      };
    });

    try {
      const page = await apiFetchCommentReplies(commentId, authToken, COMMENT_REPLIES_PAGE_SIZE);
      const replies = page.comments.map((comment) => mapPostCommentToComment(comment));
      setOpenedPostRepliesByCommentId((prev) => ({
        ...prev,
        [commentId]: {
          items: replies,
          nextCursor: page.nextCursor,
          isLoading: false,
          hasMore: Boolean(page.nextCursor),
          hasHydrated: true,
          isExpanded: true,
        },
      }));
    } catch (err) {
      setOpenedPostRepliesByCommentId((prev) => ({
        ...prev,
        [commentId]: {
          items: prev[commentId]?.items ?? [],
          nextCursor: prev[commentId]?.nextCursor ?? null,
          isLoading: false,
          hasMore: prev[commentId]?.hasMore ?? true,
          hasHydrated: true,
          isExpanded: true,
        },
      }));
      toast.error(err instanceof Error ? err.message : 'Unable to load replies');
      throw err;
    }
  }, [authToken]);

  const loadMoreReplies = useCallback(async (commentId: string) => {
    if (!authToken) return;

    const currentThread = openedPostRepliesRef.current[commentId];
    if (!currentThread || currentThread.isLoading || !currentThread.hasMore || !currentThread.nextCursor) return;

    setOpenedPostRepliesByCommentId((prev) => ({
      ...prev,
      [commentId]: {
        ...prev[commentId],
        isLoading: true,
      },
    }));

    try {
      const page = await apiFetchCommentReplies(
        commentId,
        authToken,
        COMMENT_REPLIES_PAGE_SIZE,
        currentThread.nextCursor,
      );
      const replies = page.comments.map((comment) => mapPostCommentToComment(comment));
      setOpenedPostRepliesByCommentId((prev) => ({
        ...prev,
        [commentId]: {
          ...prev[commentId],
          items: mergeUniqueComments(prev[commentId]?.items ?? [], replies),
          nextCursor: page.nextCursor,
          isLoading: false,
          hasMore: Boolean(page.nextCursor),
          hasHydrated: true,
          isExpanded: true,
        },
      }));
    } catch (err) {
      setOpenedPostRepliesByCommentId((prev) => ({
        ...prev,
        [commentId]: {
          ...prev[commentId],
          isLoading: false,
          hasHydrated: true,
          isExpanded: true,
        },
      }));
      toast.error(err instanceof Error ? err.message : 'Unable to load more replies');
    }
  }, [authToken]);

  const handleToggleReplies = useCallback(async (commentId: string) => {
    const existing = openedPostRepliesRef.current[commentId];
    if (existing?.isExpanded) {
      setOpenedPostRepliesByCommentId((prev) => ({
        ...prev,
        [commentId]: {
          ...prev[commentId],
          isExpanded: false,
        },
      }));
      return;
    }

    if (existing?.hasHydrated) {
      setOpenedPostRepliesByCommentId((prev) => ({
        ...prev,
        [commentId]: {
          ...prev[commentId],
          isExpanded: true,
        },
      }));
      return;
    }

    await loadInitialReplies(commentId);
  }, [loadInitialReplies]);

  const handleComment = (opportunityId: string, commentText: string) => {
    void (async () => {
      try {
        const createdAt = new Date().toISOString();
        const createdCommentId = await apiAddComment(opportunityId, commentText, authToken);

        if (openedPostId === opportunityId) {
          const optimisticComment: Comment = {
            id: createdCommentId || `temp-comment-${createdAt}`,
            postId: opportunityId,
            authorId: currentUserId,
            authorName: currentUser.name,
            authorAvatar: currentUser.avatar,
            content: commentText,
            timestamp: createdAt,
            parentCommentId: null,
            replies: [],
            likeCount: 0,
            replyCount: 0,
            isLikedByMe: false,
            canDelete: true,
          };

          setOpenedPostComments((prev) => ({
            ...prev,
            items: [...prev.items, optimisticComment],
            hasHydrated: true,
          }));
          setOpenedPost((prev) =>
            prev
              ? {
                  ...prev,
                  commentCount: Math.max((prev.commentCount ?? prev.comments.length) + 1, 0),
                }
              : prev,
          );
        }

        await refreshFeedPosts();
        if (hashtagPageTag) {
          await refreshHashtagPosts();
        }
        setPostsRefreshToken((prev) => prev + 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to add comment');
      }
    })();
  };

  const handleReply = (commentId: string, content: string) => {
    void (async () => {
      try {
        const createdAt = new Date().toISOString();
        const createdReplyId = await apiAddReply(commentId, content, authToken);

        if (openedPostId) {
          const optimisticReply: Comment = {
            id: createdReplyId || `temp-reply-${createdAt}`,
            postId: openedPostId,
            authorId: currentUserId,
            authorName: currentUser.name,
            authorAvatar: currentUser.avatar,
            content,
            timestamp: createdAt,
            parentCommentId: commentId,
            replies: [],
            likeCount: 0,
            replyCount: 0,
            isLikedByMe: false,
            canDelete: true,
          };

          setOpenedPostComments((prev) =>
            ({
              ...prev,
              items: updateCommentInTree(prev.items, commentId, (comment) => ({
                ...comment,
                replyCount: (comment.replyCount ?? 0) + 1,
              })),
            }),
          );
          setOpenedPostRepliesByCommentId((prev) => {
            const next = updateReplyThreads(prev, (thread) => ({
              ...thread,
              items: updateCommentInTree(thread.items, commentId, (comment) => ({
                ...comment,
                replyCount: (comment.replyCount ?? 0) + 1,
              })),
            }));
            const thread = next[commentId];
            if (!thread?.isExpanded) {
              return next;
            }
            return {
              ...next,
              [commentId]: {
                ...thread,
                items: mergeUniqueComments(thread.items, [optimisticReply]),
                hasHydrated: true,
              },
            };
          });
          setOpenedPost((prev) =>
            prev
              ? {
                  ...prev,
                  commentCount: Math.max((prev.commentCount ?? prev.comments.length) + 1, 0),
                }
              : prev,
          );
        }

        await refreshFeedPosts();
        if (hashtagPageTag) {
          await refreshHashtagPosts();
        }
        setPostsRefreshToken((prev) => prev + 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to add reply');
      }
    })();
  };

  const handleLikeComment = (commentId: string, alreadyLiked: boolean) => {
    const openedPostComment = findCommentInTree(
      mergeReplyThreadsIntoComments(openedPostCommentsRef.current.items, openedPostRepliesRef.current),
      commentId,
    );
    const existing =
      findCommentStateById(opportunities, commentId) ??
      findCommentStateById(hashtagOpportunities, commentId) ??
      (openedPostComment
        ? {
            isLiked: Boolean(openedPostComment.isLikedByMe),
            likeCount: Math.max(openedPostComment.likeCount ?? 0, 0),
          }
        : null);
    if (!existing) return;
    const nextLiked = !alreadyLiked;
    const previousLiked = existing.isLiked;
    const previousLikeCount = existing.likeCount;

    setOpportunities((prev) =>
      prev.map((opp) => ({
        ...opp,
        comments: updateCommentLikeState(opp.comments ?? [], commentId, nextLiked),
      })),
    );
    setHashtagOpportunities((prev) =>
      prev.map((opp) => ({
        ...opp,
        comments: updateCommentLikeState(opp.comments ?? [], commentId, nextLiked),
      })),
    );
    setOpenedPostComments((prev) => ({
      ...prev,
      items: updateCommentLikeState(prev.items, commentId, nextLiked),
    }));
    setOpenedPostRepliesByCommentId((prev) =>
      updateReplyThreads(prev, (thread) => ({
        ...thread,
        items: updateCommentLikeState(thread.items, commentId, nextLiked),
      })),
    );

    void (async () => {
      try {
        if (alreadyLiked) {
          await apiUnlikeComment(commentId, authToken);
        } else {
          await apiLikeComment(commentId, authToken);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to update comment like');
        setOpportunities((prev) =>
          prev.map((opp) => ({
            ...opp,
            comments: restoreCommentLikeState(
              opp.comments ?? [],
              commentId,
              previousLiked,
              previousLikeCount,
            ),
          })),
        );
        setHashtagOpportunities((prev) =>
          prev.map((opp) => ({
            ...opp,
            comments: restoreCommentLikeState(
              opp.comments ?? [],
              commentId,
              previousLiked,
              previousLikeCount,
            ),
          })),
        );
        setOpenedPostComments((prev) => ({
          ...prev,
          items: restoreCommentLikeState(prev.items, commentId, previousLiked, previousLikeCount),
        }));
        setOpenedPostRepliesByCommentId((prev) =>
          updateReplyThreads(prev, (thread) => ({
            ...thread,
            items: restoreCommentLikeState(thread.items, commentId, previousLiked, previousLikeCount),
          })),
        );
      }
    })();
  };

  const handleDeleteComment = (commentId: string) => {
    void (async () => {
      try {
        await apiDeleteComment(commentId, authToken);
        const removedTopLevel = removeCommentFromTree(openedPostCommentsRef.current.items, commentId);
        const removedReplies = removedTopLevel.removed
          ? { threads: openedPostRepliesRef.current, removed: removedTopLevel.removed }
          : removeCommentFromReplyThreads(openedPostRepliesRef.current, commentId);
        const removedComment = removedTopLevel.removed ?? removedReplies.removed;

        if (removedComment && openedPostId) {
          setOpenedPostComments((prev) => ({
            ...prev,
            items:
              removedComment.parentCommentId
                ? updateCommentInTree(removedTopLevel.comments, removedComment.parentCommentId, (comment) => ({
                    ...comment,
                    replyCount: Math.max((comment.replyCount ?? 0) - 1, 0),
                  }))
                : removedTopLevel.comments,
          }));
          setOpenedPostRepliesByCommentId((prev) => {
            let next = { ...(removedTopLevel.removed ? prev : removedReplies.threads) };
            delete next[commentId];
            next = updateReplyThreads(next, (thread) => ({
              ...thread,
              items:
                removedComment.parentCommentId
                  ? updateCommentInTree(thread.items, removedComment.parentCommentId, (comment) => ({
                      ...comment,
                      replyCount: Math.max((comment.replyCount ?? 0) - 1, 0),
                    }))
                  : thread.items,
            }));
            if (removedComment.parentCommentId && next[removedComment.parentCommentId]) {
              next[removedComment.parentCommentId] = {
                ...next[removedComment.parentCommentId],
                items: next[removedComment.parentCommentId].items.filter((item) => item.id !== commentId),
              };
            }
            return next;
          });
          setOpenedPost((prev) =>
            prev
              ? {
                  ...prev,
                  commentCount: Math.max((prev.commentCount ?? prev.comments.length) - 1, 0),
                }
              : prev,
          );
        }
        await refreshFeedPosts();
        if (hashtagPageTag) {
          await refreshHashtagPosts();
        }
        setPostsRefreshToken((prev) => prev + 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to delete comment');
      }
    })();
  };

  const handleEditPost = (postId: string, updates: Partial<Opportunity>) => {
    void (async () => {
      try {
        await apiUpdatePost(
          postId,
          {
            title: updates.title,
            contentText: updates.description,
            company: updates.company,
            deadline: updates.deadline,
            stipend: updates.stipend,
            duration: updates.duration,
            location: updates.location,
            externalUrl: updates.link,
            hashtags: updates.tags,
          },
          authToken,
        );
        toast.success('Post updated successfully');
        await refreshFeedPosts();
        if (hashtagPageTag) {
          await refreshHashtagPosts();
        }
        setPostsRefreshToken((prev) => prev + 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to edit post');
      }
    })();
  };

  const handleDeletePost = (postId: string) => {
    void (async () => {
      try {
        await apiDeletePost(postId, authToken);
        toast.success('Post deleted successfully');
        await refreshFeedPosts();
        if (hashtagPageTag) {
          await refreshHashtagPosts();
        }
        setPostsRefreshToken((prev) => prev + 1);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to delete post');
      }
    })();
  };

  const handleOpenPost = (post: Opportunity) => {
    setOpenedPost(post);
    setOpenedPostId(post.id);
    setOpenedPostComments(createInitialDiscussionPageState<Comment>());
    setOpenedPostRepliesByCommentId({});
    navigate('post', undefined, post.id, { commentId: undefined });
  };

  useEffect(() => {
    if (!openedPostId) return;
    const latest =
      opportunities.find((item) => item.id === openedPostId) ??
      hashtagOpportunities.find((item) => item.id === openedPostId);
    if (latest) {
      setOpenedPost((prev) =>
        prev
          ? {
              ...latest,
              comments: prev.comments,
            }
          : latest,
      );
    }
  }, [opportunities, hashtagOpportunities, openedPostId]);

  useEffect(() => {
    if (activeTab !== 'post' || !openedPostId || !authToken) return;

    let cancelled = false;

    void (async () => {
      try {
        const post = await apiFetchPostById(openedPostId, authToken);
        if (cancelled) return;
        const mapped = userPostToOpportunity({ ...post, comments: [] }, currentUser);
        setOpenedPost(mapped);
        await loadInitialPostComments(openedPostId);
        if (cancelled) return;
        setOpportunities((prev) =>
          prev.map((item) => (item.id === mapped.id ? mapped : item))
        );
        setHashtagOpportunities((prev) =>
          prev.map((item) => (item.id === mapped.id ? mapped : item))
        );
      } catch (err) {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : 'Unable to open post');
        navigate('feed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, openedPostId, authToken, currentUser, loadInitialPostComments]);

  const persistCreatedPost = async (draft: any) => {
    if (!authToken) {
      throw new Error('You must be logged in to create a post');
    }

    const payload = buildCreatePostPayloadFromDraft(draft);
    const mediaFiles = draft?.imageFile instanceof File ? [draft.imageFile] : [];
    await apiCreateUserPost(currentUserId, payload, authToken, mediaFiles);
    await refreshFeedPosts();
    setPostsRefreshToken((prev) => prev + 1);
  };

  // Create post handler
  const handleCreatePost = async (post: Opportunity) => {
    await persistCreatedPost(post);
  };

  // Create event handler
  const handleCreateEvent = async (event: Opportunity) => {
    await persistCreatedPost(event);
  };

  // ============================================================
  // Follow system handlers (API-backed with optimistic UI updates)
  // ============================================================
  const addUnique = (arr: string[], id: string) => (arr.includes(id) ? arr : [...arr, id]);
  const removeId = (arr: string[], id: string) => arr.filter((x) => x !== id);

  const getAccountType = (userId: string) => {
    return students.find((s) => s.id === userId)?.accountType ?? 'public';
  };

  const handleFollow = async (
    targetUserId: string,
    passedAccountType?: 'public' | 'private'
  ) => {
    const targetAccountType = passedAccountType || getAccountType(targetUserId);

    // Optimistic update
    setFollowGraph((prev) => {
      const followersByUserId = { ...prev.followersByUserId };
      const followingByUserId = { ...prev.followingByUserId };
      const incomingRequestsByUserId = { ...prev.incomingRequestsByUserId };
      const outgoingRequestsByUserId = { ...prev.outgoingRequestsByUserId };

      const alreadyFollowing = (followingByUserId[currentUserId] ?? []).includes(targetUserId);
      const alreadyRequested = (outgoingRequestsByUserId[currentUserId] ?? []).includes(targetUserId);
      if (alreadyFollowing || alreadyRequested) return prev;

      if (targetAccountType === 'private') {
        outgoingRequestsByUserId[currentUserId] = addUnique(outgoingRequestsByUserId[currentUserId] ?? [], targetUserId);
        incomingRequestsByUserId[targetUserId] = addUnique(incomingRequestsByUserId[targetUserId] ?? [], currentUserId);
      } else {
        followingByUserId[currentUserId] = addUnique(followingByUserId[currentUserId] ?? [], targetUserId);
        followersByUserId[targetUserId] = addUnique(followersByUserId[targetUserId] ?? [], currentUserId);
      }

      return { followersByUserId, followingByUserId, incomingRequestsByUserId, outgoingRequestsByUserId };
    });

    // Backend call
    try {
      await apiFollow(targetUserId, authToken);
    } catch (err: any) {
      toast.error(err?.message || 'Follow failed');
      refreshFollowGraph(); // Revert to server state
    }
  };

  const handleUnfollow = async (targetUserId: string) => {
    // Optimistic update
    setFollowGraph((prev) => ({
      ...prev,
      followingByUserId: {
        ...prev.followingByUserId,
        [currentUserId]: removeId(prev.followingByUserId[currentUserId] ?? [], targetUserId),
      },
      followersByUserId: {
        ...prev.followersByUserId,
        [targetUserId]: removeId(prev.followersByUserId[targetUserId] ?? [], currentUserId),
      },
    }));

    try {
      await apiUnfollow(targetUserId, authToken);
    } catch (err: any) {
      toast.error(err?.message || 'Unfollow failed');
      refreshFollowGraph();
    }
  };

  const handleCancelRequest = async (targetUserId: string) => {
    // Optimistic update
    setFollowGraph((prev) => ({
      ...prev,
      outgoingRequestsByUserId: {
        ...prev.outgoingRequestsByUserId,
        [currentUserId]: removeId(prev.outgoingRequestsByUserId[currentUserId] ?? [], targetUserId),
      },
      incomingRequestsByUserId: {
        ...prev.incomingRequestsByUserId,
        [targetUserId]: removeId(prev.incomingRequestsByUserId[targetUserId] ?? [], currentUserId),
      },
    }));

    try {
      await apiCancelFollowRequest(targetUserId, authToken);
    } catch (err: any) {
      toast.error(err?.message || 'Cancel request failed');
      refreshFollowGraph();
    }
  };

  const handleRemoveFollower = async (followerUserId: string) => {
    // Optimistic update
    setFollowGraph((prev) => ({
      ...prev,
      followersByUserId: {
        ...prev.followersByUserId,
        [currentUserId]: removeId(prev.followersByUserId[currentUserId] ?? [], followerUserId),
      },
      followingByUserId: {
        ...prev.followingByUserId,
        [followerUserId]: removeId(prev.followingByUserId[followerUserId] ?? [], currentUserId),
      },
    }));

    try {
      await apiRemoveFollower(followerUserId, authToken);
    } catch (err: any) {
      toast.error(err?.message || 'Remove follower failed');
      refreshFollowGraph();
    }
  };

  const handleAcceptFollowRequest = async (requesterUserId: string) => {
    const requestIdentifier = requestIdMap[requesterUserId]?.requestId ?? requesterUserId;

    // Optimistic update
    setFollowGraph((prev) => ({
      ...prev,
      incomingRequestsByUserId: {
        ...prev.incomingRequestsByUserId,
        [currentUserId]: removeId(prev.incomingRequestsByUserId[currentUserId] ?? [], requesterUserId),
      },
      outgoingRequestsByUserId: {
        ...prev.outgoingRequestsByUserId,
        [requesterUserId]: removeId(prev.outgoingRequestsByUserId[requesterUserId] ?? [], currentUserId),
      },
      followersByUserId: {
        ...prev.followersByUserId,
        [currentUserId]: addUnique(prev.followersByUserId[currentUserId] ?? [], requesterUserId),
      },
      followingByUserId: {
        ...prev.followingByUserId,
        [requesterUserId]: addUnique(prev.followingByUserId[requesterUserId] ?? [], currentUserId),
      },
    }));

    try {
      await apiAcceptFollowRequest(requestIdentifier, authToken);
    } catch (err: any) {
      toast.error(err?.message || 'Accept request failed');
      refreshFollowGraph();
    }
  };

  const handleRejectFollowRequest = async (requesterUserId: string) => {
    const requestIdentifier = requestIdMap[requesterUserId]?.requestId ?? requesterUserId;

    // Optimistic update
    setFollowGraph((prev) => ({
      ...prev,
      incomingRequestsByUserId: {
        ...prev.incomingRequestsByUserId,
        [currentUserId]: removeId(prev.incomingRequestsByUserId[currentUserId] ?? [], requesterUserId),
      },
      outgoingRequestsByUserId: {
        ...prev.outgoingRequestsByUserId,
        [requesterUserId]: removeId(prev.outgoingRequestsByUserId[requesterUserId] ?? [], currentUserId),
      },
    }));

    try {
      await apiRejectFollowRequest(requestIdentifier, authToken);
    } catch (err: any) {
      toast.error(err?.message || 'Reject request failed');
      refreshFollowGraph();
    }
  };

  const handleMessage = async (studentId: string) => {
    if (!authToken || !currentUserId) {
      navigate('chat');
      return;
    }
    try {
      // Start the conversation on the backend using the real student UUID
      await apiStartConversation(studentId, authToken);
      // Refresh conversations so it appears in the list
      await refreshConversations();
      // Navigate to chat
      navigate('chat');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start conversation');
    }
  };

  const handleChatClick = (conversationId: string) => {
    setConversations(prevConversations => {
      const conversationIndex = prevConversations.findIndex(
        (conv) => conv.id === conversationId
      );

      if (conversationIndex === -1) {
        return prevConversations;
      }

      const updatedConversations = [...prevConversations];
      const [clickedConversation] = updatedConversations.splice(conversationIndex, 1);
      updatedConversations.unshift(clickedConversation);
      return updatedConversations;
    });
  };

  const handleCreateChat = (conversation: ChatConversation) => {
    setConversations(prev => [conversation, ...prev]);
  };

  const handleChatRead = (conversationId: string) => {
    setConversations(prevConversations =>
      prevConversations.map((conversation) =>
        conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation
      )
    );
  };

  const handleViewProfile = (studentId: string) => {
    if (!studentId || typeof studentId !== 'string') {
      return;
    }
    navigate('profile', studentId);
  };

  useEffect(() => {
    if (!authToken) return;
    if (activeTab !== 'profile') return;
    if (!viewingProfileId || viewingProfileId === currentUserId) return;

    const alreadyLoaded = students.some((s) => s.id === viewingProfileId);
    if (alreadyLoaded) return;

    let cancelled = false;

    const loadViewedProfile = async () => {
      try {
        const profile = await apiFetchUserProfile(viewingProfileId, authToken);
        if (cancelled) return;

        const nextStudent = apiProfileToStudent(profile);
        setStudents((prev) => (prev.some((s) => s.id === nextStudent.id) ? prev : [...prev, nextStudent]));
      } catch (err) {
        console.error('Failed to fetch viewed profile:', err);
      }
    };

    loadViewedProfile();

    return () => {
      cancelled = true;
    };
  }, [activeTab, viewingProfileId, currentUserId, students, authToken]);

  // Club handlers
  const handleJoinClub = (clubId: string) => {
    setClubs(clubs.map(club => {
      if (club.id === clubId) {
        return {
          ...club,
          members: [...club.members, currentUserId]
        };
      }
      return club;
    }));
  };

  const handleLeaveClub = (clubId: string) => {
    setClubs(clubs.map(club => {
      if (club.id === clubId) {
        return {
          ...club,
          members: club.members.filter(id => id !== currentUserId)
        };
      }
      return club;
    }));
  };

  // Profile handlers
  const handleEditProfile = (updates: Partial<Student>) => {
    setStudents(students.map(student => {
      if (student.id === currentUserId) {
        return { ...student, ...updates };
      }
      return student;
    }));
  };

  // Notification handlers (API-backed)
  const handleMarkAsRead = async (notificationId: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );

    try {
      await apiMarkNotificationRead(notificationId, authToken);
    } catch (err: any) {
      console.error('Failed to mark notification as read:', err);
      refreshNotifications();
    }
  };

  const handleMarkAllAsRead = async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    try {
      await apiMarkAllNotificationsRead(authToken);
    } catch (err: any) {
      console.error('Failed to mark all notifications as read:', err);
      refreshNotifications();
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    void (async () => {
      const entityType = notification.entityType?.toLowerCase();
      const entityId = notification.entityId?.trim();

      if (entityType === 'post' && entityId) {
        setOpenedPost(null);
        navigate('post', undefined, entityId);
        return;
      }

      if (entityType === 'comment' && entityId) {
        try {
          const context = await apiFetchCommentContext(entityId, authToken);
          if (!context.postId) {
            throw new Error('Unable to locate post for this comment');
          }
          setOpenedPost(null);
          navigate('post', undefined, context.postId, { commentId: context.commentId });
          return;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Unable to open this notification target');
          return;
        }
      }

      switch (notification.type) {
        case 'follow':
        case 'follow_request':
        case 'follow_accept':
        case 'follow_reject':
          navigate('network');
          break;
        case 'message':
          navigate('chat');
          break;
        case 'opportunity':
          if (entityId) {
            setOpenedPost(null);
            navigate('post', undefined, entityId);
          } else {
            navigate('feed');
          }
          break;
        case 'club':
          navigate('clubs');
          break;
        default:
          navigate('notifications');
          break;
      }
    })();
  };


  // Create opportunity handler
  const handleCreateOpportunity = async (opportunity: Opportunity) => {
    await persistCreatedPost(opportunity);
  };

  // Create club handler
  const handleCreateClub = (club: Club) => {
    setClubs([club, ...clubs]);
  };

  // Settings handler
  const handleUpdateSettings = (settings: any) => {
    // Handle settings update
    console.log('Settings updated:', settings);
  };

  // Calculate unread messages and notifications
  const unreadCount = conversations.reduce((sum, conv) => sum + conv.unread, 0);
  const unreadNotifications = notifications.filter(n => !n.read).length;

  const currentFollowerCount = (followGraph.followersByUserId[currentUserId] ?? []).length;
  const currentFollowingCount = (followGraph.followingByUserId[currentUserId] ?? []).length;
  const openedPostRenderedComments = useMemo(
    () => mergeReplyThreadsIntoComments(openedPostComments.items, openedPostRepliesByCommentId),
    [openedPostComments.items, openedPostRepliesByCommentId],
  );
  const openedPostForDisplay = useMemo(
    () => (openedPost ? { ...openedPost, comments: openedPostRenderedComments } : null),
    [openedPost, openedPostRenderedComments],
  );

  if (auth.isLoading) {
    return <LoadingState type="page" />;
  }

  if (!auth.isAuthenticated) {
    return <AuthPage />;
  }
  const displayedStudent = viewingProfileId
    ? students.find((s) => s.id === viewingProfileId)
    : currentUser;

  // Reset viewing profile when switching tabs from Navbar
  const handleTabChange = (tab: string) => {
    setViewingProfileId(null);
    setOpenedPost(null);
    setFocusedCommentId(null);
    setHashtagPageTag(null);
    if (tab !== 'search') {
      setSearchQuery('');
    }
    if (tab !== 'feed') {
      setSelectedHashtag(null);
    }
    navigate(tab);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar 
        activeTab={activeTab} 
        onTabChange={handleTabChange}
        unreadCount={unreadCount}
        unreadNotifications={unreadNotifications}
        onSearch={setSearchQuery}
      />
      <div className="flex flex-1 min-w-0">
        <div className="w-full min-w-0">
          {activeTab === 'feed' ? (
          <div className="flex w-full xl:max-w-7xl">
            {/* Profile Section (Left) - Visible on XL screens and up */}
             <div className="hide-scrollbar w-[280px] min-w-[280px] px-1 pt-2 md:pt-3 overflow-y-auto h-[calc(100vh-4rem)] hidden xl:block flex-shrink-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <ProfileCard
                student={currentUser}
                followerCount={currentFollowerCount}
                followingCount={currentFollowingCount}
                onViewProfile={() => handleViewProfile(currentUserId)}
              />
            </div>
            {/* Feed Section (Center) - Expands to fill space */}
            <div className="px-1 pt-2 md:pt-3 overflow-y-auto h-[calc(100vh-4rem)] w-full lg:w-3/4 xl:w-1/2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <FeedPage
                opportunities={opportunities}
                currentUserId={currentUserId}
                selectedHashtag={selectedHashtag}
                onClearHashtagFilter={() => setSelectedHashtag(null)}
                currentUser={currentUser}
                students={students}
                onLike={handleLike}
                onSave={handleSave}
                onComment={handleComment}
                onReply={handleReply}
                onLikeComment={handleLikeComment}
                onDeleteComment={handleDeleteComment}
                onEditPost={handleEditPost}
                onDeletePost={handleDeletePost}
                onOpenPost={handleOpenPost}
                onCreateOpportunity={handleCreateOpportunity}
                onCreatePost={handleCreatePost}
                onCreateEvent={handleCreateEvent}
                onViewProfile={() => handleViewProfile(currentUserId)}
                onViewStudentProfile={handleViewProfile}
              />
            </div>
            {/* Suggestions Section (Right) - Visible on LG screens and up */}
            <div className="w-1/4 px-1 pt-2 md:pt-3 overflow-y-auto h-[calc(100vh-4rem)] hidden lg:block" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <SuggestionsCard
                students={students}
                currentUserId={currentUserId}
                followGraph={followGraph}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
                onCancelRequest={handleCancelRequest}
                onViewProfile={handleViewProfile}
              />
            </div>
          </div>
          ) : activeTab === 'search' ? (
          <SearchPage
            students={students}
            currentUserId={currentUserId}
            followGraph={followGraph}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onCancelRequest={handleCancelRequest}
            onViewProfile={handleViewProfile}
            onSelectHashtag={(hashtag) => {
              navigate('hashtag', undefined, undefined, { hashtag });
            }}
            initialSearchQuery={searchQuery}
          />
          ) : activeTab === 'hashtag' ? (
          <HashtagPostsPage
            hashtag={hashtagPageTag ?? ''}
            posts={hashtagOpportunities}
            isLoading={isHashtagPostsLoading}
            currentUserId={currentUserId}
            onBack={() => window.history.back()}
            onLike={handleLike}
            onSave={handleSave}
            onComment={handleComment}
            onReply={handleReply}
            onLikeComment={handleLikeComment}
            onDeleteComment={handleDeleteComment}
            onEditPost={handleEditPost}
            onDeletePost={handleDeletePost}
            onOpenPost={handleOpenPost}
            onViewProfile={handleViewProfile}
          />
          ) : activeTab === 'network' ? (
          <NetworkPage
            students={students}
            currentUserId={currentUserId}
            followGraph={followGraph}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            onCancelRequest={handleCancelRequest}
            onRemoveFollower={handleRemoveFollower}
            onAcceptRequest={handleAcceptFollowRequest}
            onRejectRequest={handleRejectFollowRequest}
            onViewProfile={handleViewProfile}
          />
          ) : activeTab === 'chat' ? (
          <ChatPage
            conversations={conversations}
            students={students}
            currentUserId={currentUserId}
            onViewProfile={handleViewProfile}
            onChatClick={handleChatClick}
            onCreateChat={handleCreateChat}
            onChatRead={handleChatRead}
          />
          ) : activeTab === 'clubs' ? (
          <ClubsPage
            clubs={clubs}
            students={students}
            currentUserId={currentUserId}
            onJoinClub={handleJoinClub}
            onLeaveClub={handleLeaveClub}
            onCreateClub={handleCreateClub}
            onViewProfile={handleViewProfile}
          />
          ) : activeTab === 'profile' ? (
          displayedStudent ? (
            <ProfilePage
              student={displayedStudent}
              currentUserId={currentUserId}
              isOwnProfile={displayedStudent.id === currentUserId}
              followGraph={followGraph}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              onCancelRequest={handleCancelRequest}
              onEdit={handleEditProfile}
              opportunities={opportunities}
              onLike={handleLike}
              onSave={handleSave}
              onComment={handleComment}
              onReply={handleReply}
              onLikeComment={handleLikeComment}
              onDeleteComment={handleDeleteComment}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              onOpenPost={handleOpenPost}
              postsRefreshToken={postsRefreshToken}
            />
          ) : (
            <LoadingState type="profile" />
          )
          ) : activeTab === 'post' ? (
          openedPostForDisplay ? (
            <PostPage
              post={openedPostForDisplay}
              currentUserId={currentUserId}
              focusCommentId={focusedCommentId}
              commentsState={openedPostComments}
              repliesByCommentId={openedPostRepliesByCommentId}
              onBack={() => window.history.back()}
              onLike={handleLike}
              onSave={handleSave}
              onComment={handleComment}
              onReply={handleReply}
              onLoadMoreComments={loadMorePostComments}
              onToggleReplies={handleToggleReplies}
              onLoadMoreReplies={loadMoreReplies}
              onLikeComment={handleLikeComment}
              onDeleteComment={handleDeleteComment}
              onViewProfile={handleViewProfile}
            />
          ) : (
            <LoadingState type="feed" />
          )
          ) : activeTab === 'notifications' ? (
          <NotificationsPage
            notifications={notifications}
            pendingIncomingRequestIds={pendingIncomingRequestIds}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
            onNotificationClick={handleNotificationClick}
            onAcceptFollowRequest={handleAcceptFollowRequest}
            onRejectFollowRequest={handleRejectFollowRequest}
          />
          ) : activeTab === 'settings' ? (
          <SettingsPage
            student={currentUser}
            onEdit={handleEditProfile}
            onUpdateSettings={handleUpdateSettings}
          />
          ) : null}
        </div>
      </div>

      {activeTab !== 'chat' && (
        <FloatingChat
          conversations={conversations}
          currentUserId={currentUserId}
          onOpenFullChat={() => handleTabChange('chat')}
          onChatClick={handleChatClick}
          onChatRead={handleChatRead}
        />
      )}
      <Toaster />
    </div>
  );
}

function apiProfileToStudent(profile: ApiUserProfile): Student {
  const seed = encodeURIComponent(profile.username || profile.email || profile.userId);

  return {
    id: profile.userId,
    name: profile.username,
    username: profile.username,
    email: profile.email,
    branch: profile.details?.branch ?? 'Unknown',
    year: profile.details?.year ?? profile.details?.passingYear ?? 0,
    avatar: profile.profilePictureUrl || undefined,
    bio: profile.bio ?? '',
    skills: [],
    interests: [],
    certifications: [],
    experience: [],
    societies: [],
    achievements: [],
    projects: [],
    accountType: profile.isPublic ? 'public' : 'private',
  };
}
