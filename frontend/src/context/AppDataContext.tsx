import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import type { ApiUserProfile, ChatConversation, Opportunity, Student } from '../types';
import {
  apiDeleteMessage,
  apiFetchConversations,
  apiFetchMessages,
  apiMarkChatRead,
  apiReactToMessage,
  apiSendImageMessage,
  apiSendMessage,
  type ChatMessageApi,
  type ConversationApiResponse,
} from '../lib/chatApi';
import {
  apiFetchFeedPosts,
  apiFetchHashtagPosts,
  apiFetchPostById,
  type UserPost,
} from '../lib/postsApi';
import { apiFetchUserProfile } from '../lib/authApi';
import {
  mapRealtimeChatMessage,
  mergeChatMessageList,
  mergeConversationPresenceUpdate,
  mergeConversationPreviewOnMessage,
  mergeConversationReadUpdate,
  sortConversationsByTimestamp,
} from '../lib/chatUi';

const FEED_TIMELINE_KEY = 'feed:home';
const FEED_FRESHNESS_MS = 20_000;
const CHAT_LIST_FRESHNESS_MS = 10_000;
const CHAT_MESSAGES_FRESHNESS_MS = 10_000;
const USER_FRESHNESS_MS = 30_000;
const DEFAULT_MESSAGES_PAGE_SIZE = 12;
const CHAT_TYPING_IDLE_MS = 2_500;
const CHAT_TYPING_HEARTBEAT_MS = 4_000;
const CHAT_TYPING_REMOTE_TTL_MS = 7_000;

type TimelineKey = string;

interface TimelineState {
  postIds: string[];
  lastFetchedAt: number | null;
  isHydrated: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  nextOffset: number;
  error: string | null;
}

interface ConversationMessagesState {
  messages: ChatMessageApi[];
  hasMore: boolean;
  nextCursor: string | null;
  lastFetchedAt: number | null;
  isHydrated: boolean;
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  error: string | null;
  requestVersion: number;
}

interface ChatState {
  conversationsById: Record<string, ChatConversation>;
  conversationOrder: string[];
  listLastFetchedAt: number | null;
  isListHydrated: boolean;
  isListRefreshing: boolean;
  listError: string | null;
  selectedConversationId: string | null;
  messagesByConversationId: Record<string, ConversationMessagesState>;
  typingByConversationId: Record<string, string[]>;
  presenceByUserId: Record<string, { isOnline: boolean; lastSeenAt: string | null }>;
  lastReadMessageIdByConversationId: Record<string, string>;
}

export interface AppDataState {
  usersById: Record<string, Student>;
  userLastFetchedAt: Record<string, number>;
  postsById: Record<string, UserPost>;
  timelines: Record<TimelineKey, TimelineState>;
  chat: ChatState;
}

interface SendMessageInput {
  content: string;
  replyTo?: ChatMessageApi | null;
}

interface SendImageInput {
  file: File;
  replyTo?: ChatMessageApi | null;
}

interface AppDataStore {
  getSnapshot: () => AppDataState;
  subscribe: (listener: () => void) => () => void;
  setSession: (token: string | undefined, currentUser: Student | null) => void;
  resetForSession: (currentUser: Student | null) => void;
  setRealtimeSender: (
    sender:
      | ((event: { type: 'chat:typing'; chatId: string; isTyping: boolean }) => void)
      | null,
  ) => void;
  mergeUsers: (users: Student[]) => void;
  upsertUserProfile: (profile: ApiUserProfile) => Student;
  updateUser: (userId: string, updater: (current: Student) => Student) => void;
  ensureUser: (userId: string, force?: boolean) => Promise<Student | null>;
  ensureFeed: (options?: { force?: boolean; limit?: number; offset?: number; append?: boolean }) => Promise<void>;
  ensureHashtagFeed: (hashtag: string, options?: { force?: boolean }) => Promise<void>;
  refreshPost: (postId: string, options?: { insertToTop?: boolean }) => Promise<void>;
  updatePost: (postId: string, updater: (post: UserPost) => UserPost) => void;
  removePost: (postId: string) => void;
  prependPostToFeed: (post: UserPost) => void;
  ensureConversations: (options?: { force?: boolean }) => Promise<void>;
  selectConversation: (chatId: string | null) => void;
  ensureConversationMessages: (chatId: string, options?: { force?: boolean }) => Promise<void>;
  loadOlderMessages: (chatId: string) => Promise<void>;
  notifyTypingActivity: (chatId: string) => void;
  clearLocalTyping: (chatId?: string | null) => void;
  sendMessage: (chatId: string, input: SendMessageInput) => Promise<void>;
  sendImageMessage: (chatId: string, input: SendImageInput) => Promise<void>;
  markConversationRead: (chatId: string, messageId: string) => Promise<void>;
  reactToMessage: (chatId: string, messageId: string, emoji: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  upsertConversation: (conversation: ChatConversation) => void;
  applyRealtimeEvent: (event: { type?: string; payload?: any }, currentUserId: string) => void;
}

const AppDataContext = createContext<AppDataStore | null>(null);

function createEmptyMessagesState(): ConversationMessagesState {
  return {
    messages: [],
    hasMore: true,
    nextCursor: null,
    lastFetchedAt: null,
    isHydrated: false,
    isLoadingInitial: false,
    isLoadingOlder: false,
    error: null,
    requestVersion: 0,
  };
}

function createInitialState(currentUser: Student | null): AppDataState {
  return {
    usersById: currentUser ? { [currentUser.id]: currentUser } : {},
    userLastFetchedAt: currentUser ? { [currentUser.id]: Date.now() } : {},
    postsById: {},
    timelines: {
      [FEED_TIMELINE_KEY]: {
        postIds: [],
        lastFetchedAt: null,
        isHydrated: false,
        isRefreshing: false,
        hasMore: true,
        nextOffset: 0,
        error: null,
      },
    },
    chat: {
      conversationsById: {},
      conversationOrder: [],
      listLastFetchedAt: null,
      isListHydrated: false,
      isListRefreshing: false,
      listError: null,
      selectedConversationId: null,
      messagesByConversationId: {},
      typingByConversationId: {},
      presenceByUserId: {},
      lastReadMessageIdByConversationId: {},
    },
  };
}

function isFresh(timestamp: number | null, freshnessMs: number): boolean {
  return timestamp !== null && Date.now() - timestamp < freshnessMs;
}

function hashtagTimelineKey(hashtag: string): string {
  return `hashtag:${hashtag.trim().toLowerCase()}`;
}

export function apiProfileToStudent(profile: ApiUserProfile): Student {
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

function userSummaryFromPost(post: UserPost): Student | null {
  if (!post.authorUserId) return null;
  return {
    id: post.authorUserId,
    name: post.authorUsername ?? 'Unknown User',
    username: post.authorUsername ?? 'Unknown User',
    email: '',
    branch: 'Unknown',
    year: 0,
    avatar: post.authorProfilePictureUrl || undefined,
    bio: '',
    skills: [],
    interests: [],
    certifications: [],
    experience: [],
    societies: [],
    achievements: [],
    projects: [],
    accountType: 'public',
  };
}

function mergeStudents(current: Student | undefined, incoming: Student): Student {
  const incomingSkills = incoming.skills ?? [];
  const incomingInterests = incoming.interests ?? [];
  const incomingCertifications = incoming.certifications ?? [];
  const incomingExperience = incoming.experience ?? [];
  const incomingSocieties = incoming.societies ?? [];
  const incomingAchievements = incoming.achievements ?? [];
  const incomingProjects = incoming.projects ?? [];

  return {
    ...current,
    ...incoming,
    avatar: incoming.avatar ?? current?.avatar,
    bio: incoming.bio ?? current?.bio ?? '',
    skills: incomingSkills.length > 0 ? incomingSkills : current?.skills ?? [],
    interests: incomingInterests.length > 0 ? incomingInterests : current?.interests ?? [],
    certifications:
      incomingCertifications.length > 0 ? incomingCertifications : current?.certifications ?? [],
    experience: incomingExperience.length > 0 ? incomingExperience : current?.experience ?? [],
    societies: incomingSocieties.length > 0 ? incomingSocieties : current?.societies ?? [],
    achievements:
      incomingAchievements.length > 0 ? incomingAchievements : current?.achievements ?? [],
    projects: incomingProjects.length > 0 ? incomingProjects : current?.projects ?? [],
  };
}

function upsertUniquePostIds(currentIds: string[], incomingIds: string[], insertToTop = false): string[] {
  const next = insertToTop ? [...incomingIds, ...currentIds] : [...currentIds, ...incomingIds];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of next) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return deduped;
}

function upsertTimelinePost(state: AppDataState, post: UserPost, key: string, insertToTop = false): AppDataState {
  const existingTimeline = state.timelines[key] ?? {
    postIds: [],
    lastFetchedAt: null,
    isHydrated: false,
    isRefreshing: false,
    hasMore: true,
    nextOffset: 0,
    error: null,
  };

  return {
    ...state,
    timelines: {
      ...state.timelines,
      [key]: {
        ...existingTimeline,
        postIds: upsertUniquePostIds(existingTimeline.postIds, [post.id], insertToTop),
      },
    },
  };
}

function mapPostCommentToComment(comment: UserPost['comments'][number]): Opportunity['comments'][number] {
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

export function userPostToOpportunity(
  post: UserPost,
  usersById: Record<string, Student>,
  currentUser: Student | null,
): Opportunity {
  let type: Opportunity['type'] = 'general';
  if (post.postType === 'event') {
    type = 'event';
  } else if (post.postType === 'club_activity') {
    type = 'club';
  } else if (post.postType === 'opportunity') {
    type = (post.opportunityType ?? 'event') as Opportunity['type'];
  }

  const author = usersById[post.authorUserId];
  const authorName = author?.name ?? post.authorUsername ?? currentUser?.name ?? 'Unknown User';
  const authorAvatar =
    author?.avatar ??
    post.authorProfilePictureUrl ??
    (post.authorUserId === currentUser?.id ? currentUser?.avatar : undefined);

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

function createStore(): AppDataStore {
  let state = createInitialState(null);
  const listeners = new Set<() => void>();
  let authToken: string | undefined;
  let authUser: Student | null = null;
  let realtimeSender:
    | ((event: { type: 'chat:typing'; chatId: string; isTyping: boolean }) => void)
    | null = null;

  const pendingUsers = new Map<string, Promise<Student | null>>();
  const pendingTimelines = new Map<string, Promise<void>>();
  const pendingPosts = new Map<string, Promise<void>>();
  const pendingMessages = new Map<string, Promise<void>>();
  const pendingOlderMessages = new Map<string, Promise<void>>();
  const localTypingStateByConversationId = new Map<
    string,
    {
      isTyping: boolean;
      stopTimerId: number | null;
      lastSignalAt: number;
    }
  >();
  const remoteTypingTimerIds = new Map<string, Map<string, number>>();

  const emit = () => {
    listeners.forEach((listener) => listener());
  };

  const setState = (updater: AppDataState | ((current: AppDataState) => AppDataState)) => {
    state = typeof updater === 'function' ? updater(state) : updater;
    emit();
  };

  const updateTypingUsersForConversation = (
    chatId: string,
    updater: (current: string[]) => string[],
  ) => {
    setState((current) => {
      const existing = current.chat.typingByConversationId[chatId] ?? [];
      const nextTyping = updater(existing);
      if (
        existing.length === nextTyping.length &&
        existing.every((userId, index) => userId === nextTyping[index])
      ) {
        return current;
      }

      return {
        ...current,
        chat: {
          ...current.chat,
          typingByConversationId: {
            ...current.chat.typingByConversationId,
            [chatId]: nextTyping,
          },
        },
      };
    });
  };

  const clearRemoteTypingTimer = (chatId: string, userId: string) => {
    const conversationTimers = remoteTypingTimerIds.get(chatId);
    const timerId = conversationTimers?.get(userId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      conversationTimers?.delete(userId);
      if (conversationTimers && conversationTimers.size === 0) {
        remoteTypingTimerIds.delete(chatId);
      }
    }
  };

  const removeRemoteTypingUser = (chatId: string, userId: string) => {
    clearRemoteTypingTimer(chatId, userId);
    updateTypingUsersForConversation(chatId, (existing) =>
      existing.filter((existingUserId) => existingUserId !== userId),
    );
  };

  const scheduleRemoteTypingExpiry = (chatId: string, userId: string) => {
    clearRemoteTypingTimer(chatId, userId);
    const timerId = window.setTimeout(() => {
      removeRemoteTypingUser(chatId, userId);
    }, CHAT_TYPING_REMOTE_TTL_MS);
    const conversationTimers = remoteTypingTimerIds.get(chatId) ?? new Map<string, number>();
    conversationTimers.set(userId, timerId);
    remoteTypingTimerIds.set(chatId, conversationTimers);
  };

  const clearAllRemoteTyping = () => {
    for (const [chatId, conversationTimers] of remoteTypingTimerIds.entries()) {
      for (const timerId of conversationTimers.values()) {
        window.clearTimeout(timerId);
      }
      remoteTypingTimerIds.delete(chatId);
    }
  };

  const emitTypingSignal = (chatId: string, isTyping: boolean) => {
    if (!chatId || !realtimeSender) return;
    realtimeSender({ type: 'chat:typing', chatId, isTyping });
  };

  const clearLocalTyping = (chatId?: string | null) => {
    if (!chatId) return;
    const typingState = localTypingStateByConversationId.get(chatId);
    if (!typingState) return;

    if (typingState.stopTimerId !== null) {
      window.clearTimeout(typingState.stopTimerId);
    }

    localTypingStateByConversationId.delete(chatId);
    if (typingState.isTyping) {
      emitTypingSignal(chatId, false);
    }
  };

  const scheduleLocalTypingStop = (chatId: string) => {
    const typingState = localTypingStateByConversationId.get(chatId);
    if (!typingState) return;

    if (typingState.stopTimerId !== null) {
      window.clearTimeout(typingState.stopTimerId);
    }

    typingState.stopTimerId = window.setTimeout(() => {
      const latestState = localTypingStateByConversationId.get(chatId);
      if (!latestState) return;
      latestState.stopTimerId = null;
      if (!latestState.isTyping) return;
      latestState.isTyping = false;
      emitTypingSignal(chatId, false);
      localTypingStateByConversationId.delete(chatId);
    }, CHAT_TYPING_IDLE_MS);
  };

  const notifyTypingActivity = (chatId: string) => {
    if (!chatId) return;

    const now = Date.now();
    const typingState = localTypingStateByConversationId.get(chatId) ?? {
      isTyping: false,
      stopTimerId: null,
      lastSignalAt: 0,
    };

    const shouldSendKeepalive =
      typingState.isTyping && now - typingState.lastSignalAt >= CHAT_TYPING_HEARTBEAT_MS;

    if (!typingState.isTyping || shouldSendKeepalive) {
      emitTypingSignal(chatId, true);
      typingState.lastSignalAt = now;
    }

    typingState.isTyping = true;
    localTypingStateByConversationId.set(chatId, typingState);
    scheduleLocalTypingStop(chatId);
  };

  const mergeUsers = (users: Student[]) => {
    if (users.length === 0) return;
    setState((current) => {
      const nextUsersById = { ...current.usersById };
      const nextUserFetched = { ...current.userLastFetchedAt };
      const now = Date.now();
      for (const user of users) {
        const existing = nextUsersById[user.id];
        nextUsersById[user.id] = mergeStudents(existing, user);
        nextUserFetched[user.id] = now;
      }
      return {
        ...current,
        usersById: nextUsersById,
        userLastFetchedAt: nextUserFetched,
      };
    });
  };

  const upsertUserProfile = (profile: ApiUserProfile): Student => {
    const student = apiProfileToStudent(profile);
    mergeUsers([student]);
    return student;
  };

  const mergePosts = (posts: UserPost[]) => {
    if (posts.length === 0) return;
    setState((current) => {
      const nextPostsById = { ...current.postsById };
      for (const post of posts) {
        nextPostsById[post.id] = post;
      }
      return {
        ...current,
        postsById: nextPostsById,
      };
    });

    const users = posts
      .map((post) => userSummaryFromPost(post))
      .filter((user): user is Student => Boolean(user));
    mergeUsers(users);
  };

  const ensureTimeline = async (
    key: string,
    fetcher: (params: { limit: number; offset: number }) => Promise<UserPost[]>,
    freshnessMs: number,
    options?: { force?: boolean; limit?: number; offset?: number; append?: boolean },
  ) => {
    const force = options?.force ?? false;
    const append = options?.append ?? false;
    const limit = Math.max(options?.limit ?? 20, 1);
    const timeline = state.timelines[key];
    const offset = Math.max(
      options?.offset ?? (append ? timeline?.nextOffset ?? timeline?.postIds.length ?? 0 : 0),
      0,
    );

    if (!append && !force && timeline?.isHydrated && isFresh(timeline.lastFetchedAt, freshnessMs)) {
      return;
    }
    const existing = pendingTimelines.get(key);
    if (existing) return existing;

    setState((current) => ({
      ...current,
      timelines: {
        ...current.timelines,
        [key]: {
          postIds: current.timelines[key]?.postIds ?? [],
          lastFetchedAt: current.timelines[key]?.lastFetchedAt ?? null,
          isHydrated: current.timelines[key]?.isHydrated ?? false,
          isRefreshing: true,
          hasMore: current.timelines[key]?.hasMore ?? true,
          nextOffset: current.timelines[key]?.nextOffset ?? 0,
          error: null,
        },
      },
    }));

    const request = (async () => {
      try {
        const posts = await fetcher({ limit, offset });
        mergePosts(posts);
        setState((current) => ({
          ...current,
          timelines: {
            ...current.timelines,
            [key]: {
              postIds: append
                ? upsertUniquePostIds(current.timelines[key]?.postIds ?? [], posts.map((post) => post.id))
                : posts.map((post) => post.id),
              lastFetchedAt: Date.now(),
              isHydrated: true,
              isRefreshing: false,
              // Advance by the requested window because the backend paginates by raw offset
              // before hydration, so the returned post count can be smaller than the page size.
              hasMore: posts.length > 0,
              nextOffset: offset + limit,
              error: null,
            },
          },
        }));
      } catch (error) {
        setState((current) => ({
          ...current,
          timelines: {
            ...current.timelines,
            [key]: {
              postIds: current.timelines[key]?.postIds ?? [],
              lastFetchedAt: current.timelines[key]?.lastFetchedAt ?? null,
              isHydrated: current.timelines[key]?.isHydrated ?? false,
              isRefreshing: false,
              hasMore: current.timelines[key]?.hasMore ?? true,
              nextOffset: current.timelines[key]?.nextOffset ?? 0,
              error: error instanceof Error ? error.message : 'Unable to load feed',
            },
          },
        }));
        throw error;
      } finally {
        pendingTimelines.delete(key);
      }
    })();

    pendingTimelines.set(key, request);
    return request;
  };

  const ensureMessagesState = (chatId: string) => {
    if (state.chat.messagesByConversationId[chatId]) {
      return state.chat.messagesByConversationId[chatId];
    }
    const messagesState = createEmptyMessagesState();
    setState((current) => ({
      ...current,
      chat: {
        ...current.chat,
        messagesByConversationId: {
          ...current.chat.messagesByConversationId,
          [chatId]: messagesState,
        },
      },
    }));
    return messagesState;
  };

  const setMessagesState = (
    chatId: string,
    updater: ConversationMessagesState | ((current: ConversationMessagesState) => ConversationMessagesState),
  ) => {
    setState((current) => {
      const existing = current.chat.messagesByConversationId[chatId] ?? createEmptyMessagesState();
      const nextValue = typeof updater === 'function' ? updater(existing) : updater;
      return {
        ...current,
        chat: {
          ...current.chat,
          messagesByConversationId: {
            ...current.chat.messagesByConversationId,
            [chatId]: nextValue,
          },
        },
      };
    });
  };

  const setConversations = (conversations: ChatConversation[]) => {
    setState((current) => {
      const conversationsById = { ...current.chat.conversationsById };
      const presenceByUserId = { ...current.chat.presenceByUserId };

      for (const conversation of conversations) {
        conversationsById[conversation.id] = conversation;
        presenceByUserId[conversation.participantId] = {
          isOnline: Boolean(conversation.isOnline),
          lastSeenAt: conversation.lastSeenAt ?? null,
        };
      }

      return {
        ...current,
        chat: {
          ...current.chat,
          conversationsById,
          presenceByUserId,
          conversationOrder: sortConversationsByTimestamp(conversations).map((conversation) => conversation.id),
          listLastFetchedAt: Date.now(),
          isListHydrated: true,
          isListRefreshing: false,
          listError: null,
        },
      };
    });
  };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setRealtimeSender: (sender) => {
      realtimeSender = sender;
      if (!sender) return;

      const now = Date.now();
      for (const [chatId, typingState] of localTypingStateByConversationId.entries()) {
        if (!typingState.isTyping) continue;
        sender({ type: 'chat:typing', chatId, isTyping: true });
        typingState.lastSignalAt = now;
      }
    },
    setSession: (token, currentUser) => {
      authToken = token;
      authUser = currentUser;
      if (!token) {
        for (const chatId of Array.from(localTypingStateByConversationId.keys())) {
          clearLocalTyping(chatId);
        }
      }
      if (currentUser) {
        mergeUsers([currentUser]);
      }
    },
    resetForSession: (currentUser) => {
      authUser = currentUser;
      realtimeSender = null;
      for (const chatId of Array.from(localTypingStateByConversationId.keys())) {
        clearLocalTyping(chatId);
      }
      clearAllRemoteTyping();
      pendingUsers.clear();
      pendingTimelines.clear();
      pendingPosts.clear();
      pendingMessages.clear();
      pendingOlderMessages.clear();
      state = createInitialState(currentUser);
      emit();
    },
    mergeUsers,
    upsertUserProfile,
    updateUser: (userId, updater) => {
      const current = state.usersById[userId];
      if (!current) return;
      mergeUsers([updater(current)]);
    },
    ensureUser: async (userId, force = false) => {
      if (!authToken) return state.usersById[userId] ?? null;
      if (!force && state.usersById[userId] && isFresh(state.userLastFetchedAt[userId] ?? null, USER_FRESHNESS_MS)) {
        return state.usersById[userId];
      }
      const existing = pendingUsers.get(userId);
      if (existing) return existing;

      const request = (async () => {
        try {
          const profile = await apiFetchUserProfile(userId, authToken);
          return upsertUserProfile(profile);
        } finally {
          pendingUsers.delete(userId);
        }
      })();

      pendingUsers.set(userId, request);
      return request;
    },
    ensureFeed: async (options) => {
      if (!authToken) return;
      await ensureTimeline(
        FEED_TIMELINE_KEY,
        ({ limit, offset }) => apiFetchFeedPosts(authToken, undefined, limit, offset),
        FEED_FRESHNESS_MS,
        options,
      );
    },
    ensureHashtagFeed: async (hashtag, options) => {
      if (!authToken) return;
      const normalized = hashtag.trim().replace(/^#+/, '');
      if (!normalized) return;
      await ensureTimeline(
        hashtagTimelineKey(normalized),
        () => apiFetchHashtagPosts(normalized, authToken, 100, 0),
        FEED_FRESHNESS_MS,
        { force: options?.force ?? false },
      );
    },
    refreshPost: async (postId, options) => {
      if (!authToken || !postId) return;
      const existing = pendingPosts.get(postId);
      if (existing) return existing;
      const request = (async () => {
        try {
          const post = await apiFetchPostById(postId, authToken);
          mergePosts([post]);
          setState((current) => {
            let nextState = upsertTimelinePost(current, post, FEED_TIMELINE_KEY, options?.insertToTop ?? false);
            for (const tag of post.hashtags) {
              const key = hashtagTimelineKey(tag);
              if (current.timelines[key]?.isHydrated) {
                nextState = upsertTimelinePost(nextState, post, key, options?.insertToTop ?? false);
              }
            }
            return nextState;
          });
        } catch (error) {
          if (options?.insertToTop) {
            throw error;
          }
        } finally {
          pendingPosts.delete(postId);
        }
      })();
      pendingPosts.set(postId, request);
      return request;
    },
    updatePost: (postId, updater) => {
      const currentPost = state.postsById[postId];
      if (!currentPost) return;
      mergePosts([updater(currentPost)]);
    },
    removePost: (postId) => {
      setState((current) => {
        const nextPostsById = { ...current.postsById };
        delete nextPostsById[postId];

        const nextTimelines = Object.fromEntries(
          Object.entries(current.timelines).map(([key, timeline]) => [
            key,
            {
              ...timeline,
              postIds: timeline.postIds.filter((id) => id !== postId),
            },
          ]),
        );

        return {
          ...current,
          postsById: nextPostsById,
          timelines: nextTimelines,
        };
      });
    },
    prependPostToFeed: (post) => {
      mergePosts([post]);
      setState((current) => upsertTimelinePost(current, post, FEED_TIMELINE_KEY, true));
    },
    ensureConversations: async (options) => {
      if (!authToken) return;
      if (
        !options?.force &&
        state.chat.isListHydrated &&
        isFresh(state.chat.listLastFetchedAt, CHAT_LIST_FRESHNESS_MS)
      ) {
        return;
      }

      const key = 'chat:list';
      const existing = pendingTimelines.get(key);
      if (existing) return existing;

      setState((current) => ({
        ...current,
        chat: {
          ...current.chat,
          isListRefreshing: true,
          listError: null,
        },
      }));

      const request = (async () => {
        try {
          const conversations = (await apiFetchConversations(authToken, 'active')) as ConversationApiResponse[];
          const mapped = sortConversationsByTimestamp(conversations as ChatConversation[]);
          const users = mapped
            .filter((conversation) => !conversation.isGroup)
            .map((conversation) => ({
              id: conversation.participantId,
              name: conversation.participantName,
              username: conversation.participantName,
              email: '',
              branch: 'Unknown',
              year: 0,
              avatar: conversation.participantAvatar || undefined,
              bio: '',
              skills: [],
              interests: [],
              certifications: [],
              experience: [],
              societies: [],
              achievements: [],
              projects: [],
              accountType: 'public' as const,
            }));
          mergeUsers(users);
          setConversations(mapped);
        } catch (error) {
          setState((current) => ({
            ...current,
            chat: {
              ...current.chat,
              isListRefreshing: false,
              listError: error instanceof Error ? error.message : 'Unable to load conversations',
            },
          }));
          throw error;
        } finally {
          pendingTimelines.delete(key);
        }
      })();

      pendingTimelines.set(key, request);
      return request;
    },
    selectConversation: (chatId) => {
      if (state.chat.selectedConversationId && state.chat.selectedConversationId !== chatId) {
        clearLocalTyping(state.chat.selectedConversationId);
      }
      setState((current) => ({
        ...current,
        chat: {
          ...current.chat,
          selectedConversationId: chatId,
          conversationsById:
            chatId && current.chat.conversationsById[chatId]
              ? Object.fromEntries(
                  Object.entries(current.chat.conversationsById).map(([id, conversation]) => [
                    id,
                    id === chatId ? { ...conversation, unread: 0 } : conversation,
                  ]),
                )
              : current.chat.conversationsById,
        },
      }));
    },
    ensureConversationMessages: async (chatId, options) => {
      if (!authToken || !chatId) return;
      const currentMessages = state.chat.messagesByConversationId[chatId];
      if (
        !options?.force &&
        currentMessages?.isHydrated &&
        isFresh(currentMessages.lastFetchedAt, CHAT_MESSAGES_FRESHNESS_MS)
      ) {
        return;
      }

      const key = `chat:${chatId}:recent`;
      const existing = pendingMessages.get(key);
      if (existing) return existing;

      const nextVersion = (currentMessages?.requestVersion ?? 0) + 1;
      setMessagesState(chatId, (current) => ({
        ...current,
        isLoadingInitial: current.messages.length === 0,
        error: null,
        requestVersion: nextVersion,
      }));

      const request = (async () => {
        try {
          const response = await apiFetchMessages(chatId, authToken, { limit: DEFAULT_MESSAGES_PAGE_SIZE });
          setMessagesState(chatId, (current) => {
            if (current.requestVersion !== nextVersion) return current;
            return {
              ...current,
              messages: response.messages.reduce(mergeChatMessageList, current.messages),
              hasMore: response.hasMore,
              nextCursor: response.nextCursor,
              lastFetchedAt: Date.now(),
              isHydrated: true,
              isLoadingInitial: false,
              error: null,
            };
          });
        } catch (error) {
          setMessagesState(chatId, (current) => ({
            ...current,
            isLoadingInitial: false,
            error: error instanceof Error ? error.message : 'Unable to load messages',
          }));
          throw error;
        } finally {
          pendingMessages.delete(key);
        }
      })();

      pendingMessages.set(key, request);
      return request;
    },
    loadOlderMessages: async (chatId) => {
      if (!authToken || !chatId) return;
      ensureMessagesState(chatId);
      const currentMessages = state.chat.messagesByConversationId[chatId] ?? createEmptyMessagesState();
      if (currentMessages.isLoadingOlder || !currentMessages.hasMore || !currentMessages.nextCursor) {
        return;
      }

      const key = `chat:${chatId}:older:${currentMessages.nextCursor}`;
      const existing = pendingOlderMessages.get(key);
      if (existing) return existing;

      setMessagesState(chatId, (current) => ({
        ...current,
        isLoadingOlder: true,
        error: null,
      }));

      const request = (async () => {
        try {
          const response = await apiFetchMessages(chatId, authToken, {
            limit: DEFAULT_MESSAGES_PAGE_SIZE,
            before: currentMessages.nextCursor ?? undefined,
          });

          setMessagesState(chatId, (current) => {
            const existingIds = new Set(current.messages.map((message) => message.id));
            const mergedOlder = response.messages.filter((message) => !existingIds.has(message.id));
            return {
              ...current,
              messages: [...mergedOlder, ...current.messages],
              hasMore: response.hasMore,
              nextCursor: response.nextCursor,
              isLoadingOlder: false,
              isHydrated: true,
              lastFetchedAt: current.lastFetchedAt ?? Date.now(),
              error: null,
            };
          });
        } catch (error) {
          setMessagesState(chatId, (current) => ({
            ...current,
            isLoadingOlder: false,
            error: error instanceof Error ? error.message : 'Unable to load older messages',
          }));
          throw error;
        } finally {
          pendingOlderMessages.delete(key);
        }
      })();

      pendingOlderMessages.set(key, request);
      return request;
    },
    notifyTypingActivity,
    clearLocalTyping,
    sendMessage: async (chatId, input) => {
      if (!authToken || !authUser || !chatId || !input.content.trim()) return;
      clearLocalTyping(chatId);
      const optimisticMessage: ChatMessageApi = {
        id: `temp-${Date.now()}`,
        senderId: authUser.id,
        senderName: authUser.name,
        senderAvatar: authUser.avatar || null,
        type: 'text',
        content: input.content.trim(),
        reactions: {},
        timestamp: new Date().toISOString(),
        attachments: [],
        replyToMessageId: input.replyTo?.id ?? null,
        replyTo: input.replyTo
          ? {
              id: input.replyTo.id,
              senderId: input.replyTo.senderId,
              senderName: input.replyTo.isOwn ? 'You' : input.replyTo.senderName,
              type: input.replyTo.type,
              content: input.replyTo.content,
              attachmentUrl: input.replyTo.attachments[0]?.fileUrl ?? null,
            }
          : null,
        seenBy: [],
        isOwn: true,
      };

      setMessagesState(chatId, (current) => ({
        ...current,
        messages: [...current.messages, optimisticMessage],
        isHydrated: true,
      }));

      try {
        await apiSendMessage(chatId, input.content.trim(), authToken, input.replyTo?.id);
      } catch (error) {
        setMessagesState(chatId, (current) => ({
          ...current,
          messages: current.messages.filter((message) => message.id !== optimisticMessage.id),
        }));
        throw error;
      }
    },
    sendImageMessage: async (chatId, input) => {
      if (!authToken || !authUser || !chatId) return;
      clearLocalTyping(chatId);
      const previewUrl = URL.createObjectURL(input.file);
      const optimisticMessage: ChatMessageApi = {
        id: `temp-${Date.now()}`,
        senderId: authUser.id,
        senderName: authUser.name,
        senderAvatar: authUser.avatar || null,
        type: 'image',
        content: null,
        reactions: {},
        timestamp: new Date().toISOString(),
        attachments: [{ fileUrl: previewUrl, fileType: input.file.type }],
        replyToMessageId: input.replyTo?.id ?? null,
        replyTo: input.replyTo
          ? {
              id: input.replyTo.id,
              senderId: input.replyTo.senderId,
              senderName: input.replyTo.isOwn ? 'You' : input.replyTo.senderName,
              type: input.replyTo.type,
              content: input.replyTo.content,
              attachmentUrl: input.replyTo.attachments[0]?.fileUrl ?? null,
            }
          : null,
        seenBy: [],
        isOwn: true,
      };

      setMessagesState(chatId, (current) => ({
        ...current,
        messages: [...current.messages, optimisticMessage],
        isHydrated: true,
      }));

      try {
        await apiSendImageMessage(chatId, input.file, authToken, input.replyTo?.id);
      } catch (error) {
        setMessagesState(chatId, (current) => ({
          ...current,
          messages: current.messages.filter((message) => message.id !== optimisticMessage.id),
        }));
        throw error;
      } finally {
        URL.revokeObjectURL(previewUrl);
      }
    },
    markConversationRead: async (chatId, messageId) => {
      if (!authToken || !chatId || !messageId) return;
      setState((current) => ({
        ...current,
        chat: {
          ...current.chat,
          lastReadMessageIdByConversationId: {
            ...current.chat.lastReadMessageIdByConversationId,
            [chatId]: messageId,
          },
          conversationsById: Object.fromEntries(
            Object.entries(current.chat.conversationsById).map(([id, conversation]) => [
              id,
              id === chatId ? { ...conversation, unread: 0 } : conversation,
            ]),
          ),
        },
      }));

      await apiMarkChatRead(chatId, messageId, authToken);
    },
    reactToMessage: async (chatId, messageId, emoji) => {
      if (!authToken || !chatId || !messageId || messageId.startsWith('temp-')) return;
      const result = await apiReactToMessage(chatId, messageId, emoji, authToken);
      setMessagesState(chatId, (current) => ({
        ...current,
        messages: current.messages.map((message) =>
          message.id === messageId ? { ...message, reactions: result.reactions } : message,
        ),
      }));
    },
    deleteMessage: async (chatId, messageId) => {
      if (!authToken || !chatId || !messageId || messageId.startsWith('temp-')) return;
      await apiDeleteMessage(chatId, messageId, authToken);
      setMessagesState(chatId, (current) => ({
        ...current,
        messages: current.messages.filter((message) => message.id !== messageId),
      }));
    },
    upsertConversation: (conversation) => {
      setConversations(
        sortConversationsByTimestamp([
          conversation,
          ...state.chat.conversationOrder
            .map((id) => state.chat.conversationsById[id])
            .filter((item): item is ChatConversation => Boolean(item) && item.id !== conversation.id),
        ]),
      );
    },
    applyRealtimeEvent: (event, currentUserId) => {
      if (!event?.type || !event.payload) return;

      if (event.type === 'chat:message') {
        const payload = event.payload;
        const mappedMessage = mapRealtimeChatMessage(payload, currentUserId);
        removeRemoteTypingUser(payload.chatId, payload.senderUserId);

        setMessagesState(payload.chatId, (current) => ({
          ...current,
          messages: mergeChatMessageList(current.messages, mappedMessage),
          isHydrated: true,
          lastFetchedAt: Date.now(),
        }));

        const existingConversations = state.chat.conversationOrder
          .map((id) => state.chat.conversationsById[id])
          .filter((conversation): conversation is ChatConversation => Boolean(conversation));

        const mergedConversations = mergeConversationPreviewOnMessage(
          existingConversations,
          payload,
          currentUserId,
        );
        setConversations(mergedConversations);
        return;
      }

      if (event.type === 'chat:status') {
        const existingConversations = state.chat.conversationOrder
          .map((id) => state.chat.conversationsById[id])
          .filter((conversation): conversation is ChatConversation => Boolean(conversation));
        setConversations(mergeConversationPresenceUpdate(existingConversations, event.payload));
        return;
      }

      if (event.type === 'chat:read') {
        const payload = event.payload;
        if (!payload || payload.userId === currentUserId) return;
        setMessagesState(payload.chatId, (current) => {
          if (!current.messages.some((message) => message.id === payload.lastReadMessageId)) {
            return current;
          }
          return {
            ...current,
            messages: current.messages.map((message) => ({
              ...message,
              seenBy:
                message.id === payload.lastReadMessageId
                  ? [
                      ...message.seenBy.filter((user) => user.userId !== payload.userId),
                      {
                        userId: payload.userId,
                        username: state.usersById[payload.userId]?.name ?? 'Someone',
                        avatarUrl: state.usersById[payload.userId]?.avatar ?? null,
                      },
                    ]
                  : message.seenBy.filter((user) => user.userId !== payload.userId),
            })),
          };
        });
        return;
      }

      if (event.type === 'chat:reaction') {
        const payload = event.payload;
        setMessagesState(payload.chatId, (current) => ({
          ...current,
          messages: current.messages.map((message) =>
            message.id === payload.messageId ? { ...message, reactions: payload.reactions || {} } : message,
          ),
        }));
        return;
      }

      if (event.type === 'chat:delete') {
        const payload = event.payload;
        setMessagesState(payload.chatId, (current) => ({
          ...current,
          messages: current.messages.filter((message) => message.id !== payload.messageId),
        }));
        return;
      }

      if (event.type === 'chat:typing') {
        const payload = event.payload;
        if (!payload?.chatId || !payload?.userId || payload.userId === currentUserId) return;

        if (payload.isTyping) {
          scheduleRemoteTypingExpiry(payload.chatId, payload.userId);
          updateTypingUsersForConversation(payload.chatId, (existing) =>
            existing.includes(payload.userId) ? existing : [...existing, payload.userId],
          );
          return;
        }

        removeRemoteTypingUser(payload.chatId, payload.userId);
      }
    },
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const storeRef = useRef<AppDataStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createStore();
  }

  const store = storeRef.current;
  const seededUser = auth.currentUser ?? null;
  const sessionKey = auth.session?.userId ?? 'anonymous';

  useEffect(() => {
    store.resetForSession(seededUser);
  }, [store, sessionKey]);

  useEffect(() => {
    store.setSession(auth.session?.token, seededUser);
  }, [store, auth.session?.token, seededUser]);

  return <AppDataContext.Provider value={store}>{children}</AppDataContext.Provider>;
}

export function useAppDataStore(): AppDataStore {
  const store = useContext(AppDataContext);
  if (!store) {
    throw new Error('useAppDataStore must be used within an AppDataProvider');
  }
  return store;
}

export function useAppDataSelector<T>(selector: (state: AppDataState) => T): T {
  const store = useAppDataStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return selector(state);
}

export function useTimelineOpportunities(key: string, currentUser: Student | null): Opportunity[] {
  return useAppDataSelector((state) => {
    const timeline = state.timelines[key];
    if (!timeline) return [];
    return timeline.postIds
      .map((postId) => state.postsById[postId])
      .filter((post): post is UserPost => Boolean(post))
      .map((post) => userPostToOpportunity(post, state.usersById, currentUser));
  });
}

export function getFeedTimelineKey(): string {
  return FEED_TIMELINE_KEY;
}

export function getHashtagTimelineKey(hashtag: string): string {
  return hashtagTimelineKey(hashtag);
}
