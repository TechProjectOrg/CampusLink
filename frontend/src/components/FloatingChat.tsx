import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, X, Minus, Search, MoreVertical, Smile, Image as ImageIcon, Reply, Flag, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { ChatConversation } from '../types';
import { ChatMessageApi } from '../lib/chatApi';
import { REACTION_EMOJIS, formatSeenTime, summarizeReply } from '../lib/chatUi';
import { EmojiPicker } from './chat/EmojiPicker';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useAppDataSelector, useAppDataStore } from '../context/AppDataContext';
import { useBottomAnchoredChatScroll } from '../hooks/useBottomAnchoredChatScroll';
import { LoadingIndicator } from './ui/LoadingIndicator';

interface FloatingChatProps {
  conversations: ChatConversation[];
  currentUserId: string;
  onOpenFullChat: () => void;
  onChatClick?: (conversationId: string) => void;
  onChatRead?: (conversationId: string) => void;
}

export function FloatingChat({ conversations, currentUserId, onOpenFullChat, onChatClick, onChatRead }: FloatingChatProps) {
  const appData = useAppDataStore();
  const selectedConversation = useAppDataSelector((state) => state.chat.selectedConversationId);
  
  const selectedChat = useAppDataSelector((state) =>
    selectedConversation ? state.chat.conversationsById[selectedConversation] : null
  );
  
  const selectedChatState = useAppDataSelector((state) =>
    selectedConversation ? state.chat.messagesByConversationId[selectedConversation] : null
  );

  const chatMessages = selectedChatState?.messages ?? [];
  const isLoadingMessages = selectedChatState?.isLoadingInitial ?? false;
  const isLoadingOlder = selectedChatState?.isLoadingOlder ?? false;
  const hasMoreMessages = selectedChatState?.hasMore ?? false;
  const nextCursor = selectedChatState?.nextCursor ?? null;

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessageApi | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readMessageByChatRef = useRef<Record<string, string>>({});
  const conversationsViewportRef = useRef<HTMLDivElement | null>(null);
  const handleLoadOlderMessages = useCallback(() => {
    if (!selectedConversation) return Promise.resolve();
    return appData.loadOlderMessages(selectedConversation);
  }, [appData, selectedConversation]);

  const {
    dismissNewMessageBanner,
    isChatReady,
    messagesViewportRef,
    scrollToLatest,
    showNewMessageBanner,
    topSentinelRef,
  } = useBottomAnchoredChatScroll({
    conversationId: isOpen && !isMinimized ? selectedConversation : null,
    messages: chatMessages,
    isLoadingInitial: isLoadingMessages,
    isLoadingOlder,
    hasMore: hasMoreMessages,
    nextCursor,
    onLoadOlder: handleLoadOlderMessages,
  });

  useEffect(() => {
    if (!selectedConversation) return;
    void appData.ensureConversationMessages(selectedConversation);
  }, [appData, selectedConversation, selectedChatState?.isHydrated]);

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread, 0);

  const filteredConversations = conversations.filter(conv =>
    conv.participantName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (messageInput.trim() && selectedConversation) {
      const content = messageInput.trim();
      const replyTarget = replyingTo;
      setMessageInput('');
      setReplyingTo(null);

      try {
        await appData.sendMessage(selectedConversation, { content, replyTo: replyTarget });
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    }
  };

  const handleSendImage = async (file: File | undefined) => {
    if (!file || !selectedConversation) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Please choose an image file.');
      return;
    }

    const replyTarget = replyingTo;
    setReplyingTo(null);

    try {
      await appData.sendImageMessage(selectedConversation, { file, replyTo: replyTarget });
    } catch (err) {
      console.error('Failed to send image:', err);
      window.alert(err instanceof Error ? err.message : 'Failed to send image');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    if (!selectedConversation || messageId.startsWith('temp-')) return;
    try {
      await appData.reactToMessage(selectedConversation, messageId, emoji);
    } catch (err) {
      console.error('Failed to react to message:', err);
    }
  };

  const appendEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (!input) {
      setMessageInput(prev => `${prev}${emoji}`);
      return;
    }
    const start = input.selectionStart ?? messageInput.length;
    const end = input.selectionEnd ?? messageInput.length;
    const next = `${messageInput.slice(0, start)}${emoji}${messageInput.slice(end)}`;
    setMessageInput(next);
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfMessageDay.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isSameCalendarDay = (left: string, right: string) => {
    const leftDate = new Date(left);
    const rightDate = new Date(right);
    return leftDate.toDateString() === rightDate.toDateString();
  };

  const formatMenuTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const dayLabel = formatDate(timestamp);
    const timeLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dayLabel} ${timeLabel}`;
  };

  const jumpToMessage = (messageId: string) => {
    const target = document.getElementById(`floating-chat-message-${messageId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId(prev => (prev === messageId ? null : prev));
    }, 1500);
  };

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const target = e.currentTarget as HTMLElement;
      if (target) {
        const { scrollTop, scrollHeight, clientHeight } = target;

        const isScrollingDown = e.deltaY > 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight;
        const isScrollingUp = e.deltaY < 0;
        const isAtTop = scrollTop === 0;

        if ((isScrollingDown && isAtBottom) || (isScrollingUp && isAtTop)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    const messagesEl = messagesViewportRef.current;
    const conversationsEl = conversationsViewportRef.current;

    messagesEl?.addEventListener('wheel', handleWheel, { passive: false });
    conversationsEl?.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      messagesEl?.removeEventListener('wheel', handleWheel);
      conversationsEl?.removeEventListener('wheel', handleWheel);
    };
  }, [isOpen, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation || !isOpen || isMinimized) return;
    const latestIncoming = [...chatMessages].reverse().find(msg => !msg.isOwn && !msg.id.startsWith('temp-'));
    if (!latestIncoming) return;
    if (readMessageByChatRef.current[selectedConversation] === latestIncoming.id) return;

    readMessageByChatRef.current[selectedConversation] = latestIncoming.id;
    appData.markConversationRead(selectedConversation, latestIncoming.id)
      .then(() => onChatRead?.(selectedConversation))
      .catch(err => {
        console.error('Failed to mark chat as read', err);
        delete readMessageByChatRef.current[selectedConversation];
      });
  }, [appData, selectedConversation, chatMessages, isOpen, isMinimized, onChatRead]);

  const renderSeenBy = (msg: ChatMessageApi) => {
    if (msg.seenBy.length === 0) return null;
    return (
      <div className={`mt-1 flex items-center gap-1 px-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
        {msg.seenBy.map((reader) => (
          <Avatar key={`${msg.id}-${reader.userId}`} className="h-5 w-5 ring-2 ring-white shadow-sm" title={`${reader.username} has seen this`}>
            <AvatarImage src={reader.avatarUrl ?? undefined} />
            <AvatarFallback className="text-[9px]">{reader.username[0]}</AvatarFallback>
          </Avatar>
        ))}
      </div>
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => {
          appData.selectConversation(null);
          setIsOpen(true);
        }}
        className="fixed bottom-24 md:bottom-6 right-6 z-40 w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all duration-300 animate-float"
        aria-label="Open chat"
      >
        <MessageCircle className="w-6 h-6 text-white" />
        {totalUnread > 0 && (
          <Badge className="absolute -top-1 -right-1 bg-destructive text-white px-2 py-0 min-w-6 h-6 flex items-center justify-center animate-pulse">
            {totalUnread}
          </Badge>
        )}
      </button>
    );
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-24 md:bottom-6 right-6 z-40 animate-slide-in-up">
        <button
          onClick={() => setIsMinimized(false)}
          className="w-64 h-14 bg-gradient-to-r from-primary to-secondary rounded-t-2xl shadow-2xl flex items-center justify-between px-4 hover:shadow-3xl transition-all duration-300"
        >
          <div className="flex items-center gap-2 text-white">
            <MessageCircle className="w-5 h-5" />
            <span>Messaging</span>
            {totalUnread > 0 && (
              <Badge className="bg-white/20 text-white px-2 py-0">
                {totalUnread}
              </Badge>
            )}
          </div>
          <X onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="w-5 h-5 text-white/80 hover:text-white" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 animate-slide-in-up">
      <div className="w-[calc(100vw-2rem)] md:w-96 h-[600px] max-h-[calc(100vh-12rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 min-h-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-secondary p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <MessageCircle className="w-5 h-5" />
            <h3 className="font-semibold">Messaging</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenFullChat}
              className="text-white/80 hover:text-white transition-colors p-1"
              title="Open full chat"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <button
              onClick={() => setIsMinimized(true)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <Minus className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conversation View */}
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <button
                onClick={() => appData.selectConversation(null)}
                className="text-gray-600 hover:text-gray-900 text-lg"
              >
                ←
              </button>
              <Avatar className="w-10 h-10">
                <AvatarImage src={selectedChat.participantAvatar} />
                <AvatarFallback>{selectedChat.participantName[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">{selectedChat.participantName}</p>
                <div className="flex items-center gap-1">
                  {selectedChat.isOnline ? (
                    <>
                      <div className="w-2 h-2 bg-success rounded-full"></div>
                      <p className="text-xs text-gray-500">Active now</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-500">
                      {selectedChat.lastSeenAt ? formatSeenTime(selectedChat.lastSeenAt).replace('Seen', 'Active') : 'Offline'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 relative min-h-0 overflow-hidden px-4 py-3">
              {showNewMessageBanner && (
                <button
                  onClick={() => {
                    dismissNewMessageBanner();
                    scrollToLatest('smooth');
                  }}
                  className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 z-20 hover:scale-105 transition-all duration-300"
                >
                  <ChevronDown className="w-3 h-3" />
                  <span className="text-xs font-medium">New Messages</span>
                </button>
              )}
              {isLoadingOlder && (
                <div className="pointer-events-none absolute left-0 right-0 top-2 z-10 flex w-full justify-center">
                  <div className="rounded-full bg-white/90 px-2.5 py-1.5 shadow-sm">
                    <LoadingIndicator label="Loading..." size={16} />
                  </div>
                </div>
              )}
              <div
                ref={messagesViewportRef}
                style={{ overflowAnchor: 'auto' }}
                className="h-full overflow-y-auto"
              >
                {!isChatReady && isLoadingMessages && chatMessages.length === 0 ? (
                  <LoadingIndicator label="Loading messages..." className="h-full" />
                ) : (
                <div className="space-y-3">
                  <div ref={topSentinelRef} className="h-px w-full" aria-hidden="true" />
                  {chatMessages.map((msg, index) => {
                  const prevMsg = chatMessages[index - 1];
                  const nextMsg = chatMessages[index + 1];
                  const startsNewDate = index === 0 || !isSameCalendarDay(msg.timestamp, prevMsg.timestamp);
                  const startsSenderGroup = startsNewDate || msg.isOwn !== prevMsg.isOwn;
                  const groupHasMultipleMessages = Boolean(nextMsg && msg.isOwn === nextMsg.isOwn && isSameCalendarDay(msg.timestamp, nextMsg.timestamp));
                  const showDate = startsNewDate;
                  const showGroupStartTime = startsSenderGroup && groupHasMultipleMessages;
                  const isSystemMessage = msg.type === 'system';

                  return (
                    <div key={msg.id} id={`floating-chat-message-${msg.id}`} data-chat-scroll-message={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-4">
                          <span className="text-xs text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
                            {formatDate(msg.timestamp)}
                          </span>
                        </div>
                      )}
                      {showGroupStartTime && (
                        <div className="flex justify-center mb-2">
                          <span className="text-xs text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
                            {formatTime(msg.timestamp)}
                          </span>
                        </div>
                      )}
                      {isSystemMessage ? (
                        <div className="flex justify-center py-1.5">
                          <span
                            className="text-xs text-gray-400 px-3 py-1 bg-gray-50 rounded-full"
                            title={new Date(msg.timestamp).toLocaleString('en-US')}
                          >
                            {msg.content}
                          </span>
                        </div>
                      ) : (
                      <div className={`flex items-end gap-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                        {!msg.isOwn && (
                          <Avatar className="w-6 h-6 flex-shrink-0 mb-1">
                            <AvatarImage src={msg.senderAvatar ?? undefined} />
                            <AvatarFallback className="text-xs">{msg.senderName[0]}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`group min-w-0 w-fit max-w-[82%] sm:max-w-[78%] ${msg.isOwn ? 'order-2' : 'order-1'}`}>
                          {selectedChat.isGroup && !msg.isOwn && startsSenderGroup && (
                            <p className="mb-1 px-2 text-xs font-medium text-gray-500">
                              {msg.senderName}
                            </p>
                          )}
                          <div className="flex items-start gap-2">
                            <div
                              className={`${msg.isOwn ? 'order-2' : 'order-1'} min-w-0 w-fit max-w-full rounded-3xl px-4 py-2 transition-shadow duration-200 ${
                                msg.isOwn
                                  ? 'bg-gradient-to-br from-primary to-secondary text-white'
                                  : 'bg-gray-100 text-gray-900'
                              } ${highlightedMessageId === msg.id ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-white' : ''}`}
                            >
                              {msg.replyTo && (
                                <button
                                  type="button"
                                  onClick={() => msg.replyTo && jumpToMessage(msg.replyTo.id)}
                                  className={`mb-2 block w-full max-w-full overflow-hidden rounded-2xl border border-l-4 px-3 py-2 text-left text-xs ${msg.isOwn ? 'border-white/40 bg-black/20 text-blue-50' : 'border-gray-300 bg-gray-50 text-gray-700'}`}
                                  title="Go to referenced message"
                                >
                                  <div className="flex min-w-0 items-center gap-1">
                                    <span className="shrink-0 font-medium">{msg.replyTo.senderName}:</span>
                                    <span className="block min-w-0 flex-1 truncate">
                                      {msg.replyTo.type === 'image'
                                        ? 'Photo'
                                        : (msg.replyTo.content?.trim() || 'Message')}
                                    </span>
                                  </div>
                                </button>
                              )}
                              {msg.type === 'image' && msg.attachments[0]?.fileUrl ? (
                                <img src={msg.attachments[0].fileUrl} alt="Chat attachment" className="max-h-52 rounded-2xl object-cover" />
                              ) : (
                                <p className="text-sm break-words">{msg.content}</p>
                              )}
                            </div>
                            <div className={`mt-1 flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 ${msg.isOwn ? 'order-1 flex-row-reverse' : 'order-2 flex-row'}`}>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50" aria-label="React to message">
                                    <Smile className="h-4 w-4" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="center" side="top" className="w-auto rounded-full border-gray-200 p-2 shadow-lg">
                                  <div className="flex items-center gap-1">
                                    {REACTION_EMOJIS.map(item => (
                                      <button key={item.emoji} type="button" title={item.name} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl hover:bg-gray-100" onClick={() => handleReactToMessage(msg.id, item.emoji)}>
                                        {item.emoji}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                              <button type="button" onClick={() => setReplyingTo(msg)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50" aria-label="Reply">
                                <Reply className="h-4 w-4" />
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50" aria-label="More message actions">
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align={msg.isOwn ? 'end' : 'start'} className="w-44">
                                  <DropdownMenuItem disabled className="text-xs text-gray-500 opacity-100 focus:bg-transparent">
                                    {formatMenuTimestamp(msg.timestamp)}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setReplyingTo(msg)}>
                                    <Reply className="w-4 h-4 mr-2" />
                                    Reply
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(msg.content ?? '')} disabled={!msg.content}>
                                    Copy
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => window.alert('Message reported. Our moderation team will review it soon.')} className="text-destructive focus:text-destructive">
                                    <Flag className="w-4 h-4 mr-2" />
                                    Report
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {Object.entries(msg.reactions || {}).length > 0 && (
                            <div className={`mt-1 flex flex-wrap gap-1 px-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                              {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                                <button key={emoji} type="button" onClick={() => handleReactToMessage(msg.id, emoji)} className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs shadow-sm">
                                  {emoji} {userIds.length}
                                </button>
                              ))}
                            </div>
                          )}
                          {renderSeenBy(msg)}
                        </div>
                      </div>
                      )}
                    </div>
                  );
                  })}
                </div>
                )}
              </div>
          </div>

          {/* Message Input */}
            <div className="px-4 py-3 border-t">
              {replyingTo && (
                <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700">Replying to {replyingTo.isOwn ? 'yourself' : replyingTo.senderName}</p>
                    <p className="truncate text-xs text-gray-500">{summarizeReply(replyingTo)}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)} className="h-8 w-8 rounded-full p-0">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleSendImage(event.target.files?.[0])}
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  variant="ghost" 
                  size="sm" 
                  className="hover:bg-gray-100 rounded-full w-8 h-8 p-0 flex-shrink-0"
                >
                  <ImageIcon className="w-4 h-4 text-gray-600" />
                </Button>
                <div className="flex-1 relative">
                  <Input
                    value={messageInput}
                    ref={inputRef}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Message..."
                    className="w-full pr-10 bg-gray-100 border-gray-100 rounded-full focus:bg-gray-50 text-sm"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent rounded-full w-7 h-7 p-0"
                      >
                        <Smile className="w-4 h-4 text-gray-500" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-auto p-3">
                      <EmojiPicker onSelect={appendEmoji} compact />
                    </PopoverContent>
                  </Popover>
                </div>
                {messageInput.trim() ? (
                  <Button 
                    onClick={() => handleSendMessage()}
                    className="bg-transparent hover:bg-transparent text-primary p-0 h-auto text-sm hover:scale-110 transition-all duration-300"
                  >
                    Send
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search messages..."
                  className="pl-10 bg-gray-50 border-gray-200 rounded-xl focus:bg-white text-sm"
                />
              </div>
            </div>

            {/* Conversations List */}
            <ScrollArea viewportRef={conversationsViewportRef} className="flex-1 overflow-hidden">
              <div className="p-2">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">No conversations yet</p>
                    <button
                      onClick={onOpenFullChat}
                      className="text-primary hover:underline mt-2 text-sm"
                    >
                      Start a conversation
                    </button>
                  </div>
                ) : (
                  filteredConversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => {
                        if (onChatClick) {
                          onChatClick(conv.id);
                        }
                        appData.selectConversation(conv.id);
                      }}
                      className="w-full p-3 hover:bg-gray-50 transition-colors flex items-center gap-3 rounded-xl mb-1"
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar className="w-12 h-12">
                          <AvatarImage src={conv.participantAvatar} />
                          <AvatarFallback>{conv.participantName[0]}</AvatarFallback>
                        </Avatar>
                        {conv.unread > 0 && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-white"></div>
                        )}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-gray-900 truncate text-sm">{conv.participantName}</p>
                          <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatDate(conv.timestamp)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={`text-sm truncate flex-1 ${conv.unread > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                            {conv.lastMessage}
                          </p>
                          {conv.unread > 0 && (
                            <Badge className="ml-2 bg-primary text-white px-2 py-0 min-w-5 h-5 flex items-center justify-center text-xs">
                              {conv.unread}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  );
}
