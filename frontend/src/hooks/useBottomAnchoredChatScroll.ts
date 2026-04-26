import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type MessageLike = {
  id: string;
  isOwn: boolean;
};

type ConversationScrollState = {
  hasAnchoredInitial: boolean;
  needsInitialAnchor: boolean;
  pendingPrependRestore: boolean;
  prependRequestInFlight: boolean;
  preScrollTop: number;
  preScrollHeight: number;
  preMessageCount: number;
  lastRenderedMessageId: string | null;
  firstRenderedMessageId: string | null;
  renderedMessageCount: number;
  wasNearBottom: boolean;
  lastBottomAnchorKey: string | number | boolean | null;
};

type ScrollBehaviorMode = Extract<ScrollBehavior, 'auto' | 'smooth'>;

interface UseBottomAnchoredChatScrollOptions<TMessage extends MessageLike> {
  conversationId: string | null;
  messages: TMessage[];
  isLoadingInitial: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  onLoadOlder: () => Promise<void> | void;
  bottomAnchorKey?: string | number | boolean | null;
  topThreshold?: number;
  bottomThreshold?: number;
}

const createConversationScrollState = (): ConversationScrollState => ({
  hasAnchoredInitial: false,
  needsInitialAnchor: false,
  pendingPrependRestore: false,
  prependRequestInFlight: false,
  preScrollTop: 0,
  preScrollHeight: 0,
  preMessageCount: 0,
  lastRenderedMessageId: null,
  firstRenderedMessageId: null,
  renderedMessageCount: 0,
  wasNearBottom: true,
  lastBottomAnchorKey: null,
});

export function useBottomAnchoredChatScroll<TMessage extends MessageLike>({
  conversationId,
  messages,
  isLoadingInitial,
  isLoadingOlder,
  hasMore,
  nextCursor,
  onLoadOlder,
  bottomAnchorKey = null,
  topThreshold = 200,
  bottomThreshold = 150,
}: UseBottomAnchoredChatScrollOptions<TMessage>) {
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const conversationStateRef = useRef<Record<string, ConversationScrollState>>({});
  const activeConversationIdRef = useRef<string | null>(null);
  const [readyByConversation, setReadyByConversation] = useState<Record<string, boolean>>({});
  const [showNewMessageBanner, setShowNewMessageBanner] = useState(false);

  const latestMessage = messages[messages.length - 1] ?? null;
  const latestMessageId = latestMessage?.id ?? null;
  const firstMessageId = messages[0]?.id ?? null;

  const ensureConversationState = useCallback((chatId: string) => {
    const existing = conversationStateRef.current[chatId];
    if (existing) return existing;

    const created = createConversationScrollState();
    conversationStateRef.current[chatId] = created;
    return created;
  }, []);

  const markConversationReady = useCallback((chatId: string) => {
    setReadyByConversation((current) =>
      current[chatId] ? current : { ...current, [chatId]: true },
    );
  }, []);

  const markConversationPending = useCallback((chatId: string) => {
    setReadyByConversation((current) =>
      current[chatId] === false ? current : { ...current, [chatId]: false },
    );
  }, []);

  const scrollToLatest = useCallback(
    (behavior: ScrollBehaviorMode = 'auto') => {
      const viewport = messagesViewportRef.current;
      if (!viewport) return;

      if (behavior === 'smooth') {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }

      if (conversationId) {
        const scrollState = ensureConversationState(conversationId);
        scrollState.wasNearBottom = true;
        scrollState.lastRenderedMessageId = latestMessageId;
        scrollState.firstRenderedMessageId = firstMessageId;
        scrollState.renderedMessageCount = messages.length;
        scrollState.lastBottomAnchorKey = bottomAnchorKey;
      }
      setShowNewMessageBanner(false);
    },
    [bottomAnchorKey, conversationId, ensureConversationState, firstMessageId, latestMessageId, messages.length],
  );

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !hasMore || !nextCursor || isLoadingOlder) return;

    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    const scrollState = ensureConversationState(conversationId);
    if (
      scrollState.needsInitialAnchor ||
      scrollState.pendingPrependRestore ||
      scrollState.prependRequestInFlight
    ) {
      return;
    }

    scrollState.prependRequestInFlight = true;
    scrollState.pendingPrependRestore = true;
    scrollState.preScrollTop = viewport.scrollTop;
    scrollState.preScrollHeight = viewport.scrollHeight;
    scrollState.preMessageCount = messages.length;

    try {
      await onLoadOlder();
    } catch (error) {
      scrollState.pendingPrependRestore = false;
      throw error;
    } finally {
      scrollState.prependRequestInFlight = false;
    }
  }, [
    conversationId,
    ensureConversationState,
    hasMore,
    isLoadingOlder,
    messages.length,
    nextCursor,
    onLoadOlder,
  ]);

  useEffect(() => {
    setShowNewMessageBanner(false);

    if (!conversationId) {
      activeConversationIdRef.current = null;
      return;
    }

    const scrollState = ensureConversationState(conversationId);
    if (activeConversationIdRef.current !== conversationId) {
      scrollState.needsInitialAnchor = true;
      scrollState.wasNearBottom = true;
      activeConversationIdRef.current = conversationId;
    }

    if (isLoadingInitial && messages.length === 0) {
      markConversationPending(conversationId);
    }
  }, [
    conversationId,
    ensureConversationState,
    isLoadingInitial,
    markConversationPending,
    messages.length,
  ]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    viewport.style.overflowAnchor = 'none';
  }, [conversationId]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !conversationId) return;

    const handleScroll = () => {
      const scrollState = ensureConversationState(conversationId);
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const isNearBottom = distanceFromBottom < bottomThreshold;

      scrollState.wasNearBottom = isNearBottom;
      if (isNearBottom) {
        setShowNewMessageBanner(false);
      }

      if (
        viewport.scrollTop <= topThreshold &&
        scrollState.hasAnchoredInitial &&
        !scrollState.needsInitialAnchor
      ) {
        void loadOlderMessages().catch((error) => {
          console.error('Failed to load older messages', error);
        });
      }
    };

    handleScroll();
    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [
    bottomThreshold,
    conversationId,
    ensureConversationState,
    loadOlderMessages,
    topThreshold,
  ]);

  useEffect(() => {
    const viewport = messagesViewportRef.current;
    const sentinel = topSentinelRef.current;
    if (!viewport || !sentinel || !conversationId) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const scrollState = ensureConversationState(conversationId);
        const visible = entries.some((entry) => entry.isIntersecting);
        if (!visible) return;
        if (!scrollState.hasAnchoredInitial || scrollState.needsInitialAnchor) return;

        void loadOlderMessages().catch((error) => {
          console.error('Failed to load older messages', error);
        });
      },
      {
        root: viewport,
        threshold: 0,
        rootMargin: '200px 0px 0px 0px',
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [conversationId, ensureConversationState, loadOlderMessages]);

  useLayoutEffect(() => {
    if (!conversationId) return;

    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    const scrollState = ensureConversationState(conversationId);

    if (scrollState.pendingPrependRestore && !isLoadingOlder) {
      if (messages.length > scrollState.preMessageCount) {
        const heightDelta = viewport.scrollHeight - scrollState.preScrollHeight;
        viewport.scrollTop = scrollState.preScrollTop + heightDelta;
      }

      scrollState.pendingPrependRestore = false;
      scrollState.lastRenderedMessageId = latestMessageId;
      scrollState.firstRenderedMessageId = firstMessageId;
      scrollState.renderedMessageCount = messages.length;
      markConversationReady(conversationId);
      return;
    }

    if (scrollState.needsInitialAnchor && !isLoadingInitial) {
      viewport.scrollTop = viewport.scrollHeight;
      scrollState.needsInitialAnchor = false;
      scrollState.hasAnchoredInitial = true;
      scrollState.wasNearBottom = true;
      scrollState.lastRenderedMessageId = latestMessageId;
      scrollState.firstRenderedMessageId = firstMessageId;
      scrollState.renderedMessageCount = messages.length;
      scrollState.lastBottomAnchorKey = bottomAnchorKey;
      markConversationReady(conversationId);
    }
  }, [
    bottomAnchorKey,
    conversationId,
    ensureConversationState,
    firstMessageId,
    isLoadingInitial,
    isLoadingOlder,
    latestMessageId,
    markConversationReady,
    messages.length,
  ]);

  useEffect(() => {
    if (!conversationId) return;

    const scrollState = ensureConversationState(conversationId);
    const previousBottomAnchorKey = scrollState.lastBottomAnchorKey;
    scrollState.lastBottomAnchorKey = bottomAnchorKey;

    if (
      previousBottomAnchorKey === bottomAnchorKey ||
      scrollState.needsInitialAnchor ||
      !scrollState.hasAnchoredInitial ||
      scrollState.pendingPrependRestore ||
      !scrollState.wasNearBottom
    ) {
      return;
    }

    requestAnimationFrame(() => {
      scrollToLatest('auto');
    });
  }, [bottomAnchorKey, conversationId, ensureConversationState, scrollToLatest]);

  useEffect(() => {
    if (!conversationId) return;

    const scrollState = ensureConversationState(conversationId);
    if (
      scrollState.needsInitialAnchor ||
      !scrollState.hasAnchoredInitial ||
      scrollState.pendingPrependRestore
    ) {
      return;
    }

    const previousFirstMessageId = scrollState.firstRenderedMessageId;
    const previousLastMessageId = scrollState.lastRenderedMessageId;
    const previousCount = scrollState.renderedMessageCount;
    const currentCount = messages.length;
    const isPrepend =
      currentCount > previousCount &&
      firstMessageId !== previousFirstMessageId &&
      latestMessageId === previousLastMessageId;
    const isAppend =
      latestMessageId !== previousLastMessageId &&
      currentCount >= previousCount &&
      firstMessageId === previousFirstMessageId;
    const isPureRefresh =
      firstMessageId === previousFirstMessageId &&
      latestMessageId === previousLastMessageId &&
      currentCount === previousCount;

    scrollState.firstRenderedMessageId = firstMessageId;
    scrollState.lastRenderedMessageId = latestMessageId;
    scrollState.renderedMessageCount = currentCount;

    if (isPrepend || isPureRefresh) {
      return;
    }

    if (!isAppend) {
      setShowNewMessageBanner(false);
      return;
    }

    if (!latestMessage) {
      setShowNewMessageBanner(false);
      return;
    }

    if (latestMessage.isOwn || scrollState.wasNearBottom) {
      requestAnimationFrame(() => {
        scrollToLatest('auto');
      });
      return;
    }

    setShowNewMessageBanner(true);
  }, [
    conversationId,
    ensureConversationState,
    firstMessageId,
    latestMessage,
    latestMessageId,
    messages.length,
    scrollToLatest,
  ]);

  const isChatReady =
    !conversationId || !isLoadingInitial || Boolean(readyByConversation[conversationId]);

  return {
    dismissNewMessageBanner: () => setShowNewMessageBanner(false),
    isChatReady,
    messagesViewportRef,
    scrollToLatest,
    showNewMessageBanner,
    topSentinelRef,
  };
}
