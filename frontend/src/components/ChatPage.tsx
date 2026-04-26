import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Search, MoreVertical, Info, Image, Smile, CircleDot, Plus, Flag, Ban, Eye, Reply, X, Trash2, Copy, ChevronDown } from 'lucide-react';
import { ChatConversation, Student } from '../types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { NewChatModal } from './NewChatModal';
import { GroupInfoPage } from './GroupInfoPage';
import { apiStartConversation, ChatMessageApi } from '../lib/chatApi';
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
import { useAuth } from '../context/AuthContext';
import { useBottomAnchoredChatScroll } from '../hooks/useBottomAnchoredChatScroll';

interface ChatPageProps {
  conversations: ChatConversation[];
  students: Student[];
  currentUserId: string;
  onViewProfile?: (studentId: string) => void;
  onChatClick?: (conversationId: string) => void;
  onCreateChat?: (conversation: ChatConversation) => void;
  onChatRead?: (conversationId: string) => void;
}

export function ChatPage({ conversations, students, currentUserId, onViewProfile, onChatClick, onCreateChat, onChatRead }: ChatPageProps) {
  const appData = useAppDataStore();
  const auth = useAuth();
  const selectedConversationId = useAppDataSelector((state) => state.chat.selectedConversationId);
  const selectedChat = selectedConversationId ?? conversations[0]?.id ?? null;
  const [message, setMessage] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [viewingGroupInfo, setViewingGroupInfo] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessageApi | null>(null);
  const [seenTick, setSeenTick] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const readMessageByChatRef = useRef<Record<string, string>>({});

  const selectedConversation = conversations.find(c => c.id === selectedChat);
  const selectedChatState = useAppDataSelector((state) =>
    selectedChat ? state.chat.messagesByConversationId[selectedChat] ?? null : null,
  );
  const typingUserIds = useAppDataSelector((state) =>
    selectedChat ? state.chat.typingByConversationId[selectedChat] ?? [] : [],
  );
  const usersById = useAppDataSelector((state) => state.usersById);
  const chatMessages = selectedChatState?.messages ?? [];
  const isLoadingMessages = Boolean(selectedChat && selectedChatState?.isLoadingInitial);
  const isLoadingOlder = Boolean(selectedChat && selectedChatState?.isLoadingOlder);
  const hasMoreMessages = Boolean(selectedChatState?.hasMore);
  const nextCursor = selectedChatState?.nextCursor ?? null;
  const typingUsers = typingUserIds
    .filter((userId) => userId !== currentUserId)
    .map((userId) => usersById[userId]?.name ?? (selectedConversation?.participantId === userId ? selectedConversation.participantName : 'Someone'));

  const typingStatusLabel =
    typingUsers.length === 0
      ? null
      : typingUsers.length === 1
        ? `${typingUsers[0]} is typing`
        : typingUsers.length === 2
          ? `${typingUsers[0]} and ${typingUsers[1]} are typing`
          : `${typingUsers.length} people are typing`;

  const handleLoadOlderMessages = useCallback(() => {
    if (!selectedChat) return Promise.resolve();
    return appData.loadOlderMessages(selectedChat);
  }, [appData, selectedChat]);

  const {
    dismissNewMessageBanner,
    isChatReady,
    messagesViewportRef,
    scrollToLatest,
    showNewMessageBanner,
    topSentinelRef,
  } = useBottomAnchoredChatScroll({
    conversationId: selectedChat,
    messages: chatMessages,
    isLoadingInitial: isLoadingMessages,
    isLoadingOlder,
    hasMore: hasMoreMessages,
    nextCursor,
    onLoadOlder: handleLoadOlderMessages,
    bottomAnchorKey: Boolean(typingStatusLabel),
  });

  useEffect(() => {
    if (!selectedConversationId && conversations[0]?.id) {
      appData.selectConversation(conversations[0].id);
    }
  }, [appData, selectedConversationId, conversations]);

  useEffect(() => {
    if (!selectedChat) return;
    void appData.ensureConversationMessages(selectedChat);
  }, [appData, selectedChat, selectedChatState?.isHydrated]);

  useEffect(() => {
    const interval = window.setInterval(() => setSeenTick(tick => tick + 1), 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => () => {
    appData.clearLocalTyping(selectedChat);
  }, [appData, selectedChat]);

  useEffect(() => {
    if (!selectedChat) return;
    const latestIncoming = [...chatMessages].reverse().find(msg => !msg.isOwn && !msg.id.startsWith('temp-'));
    if (!latestIncoming) return;
    if (readMessageByChatRef.current[selectedChat] === latestIncoming.id) return;

    readMessageByChatRef.current[selectedChat] = latestIncoming.id;
    appData.markConversationRead(selectedChat, latestIncoming.id)
      .then(() => onChatRead?.(selectedChat))
      .catch(err => {
        console.error('Failed to mark chat as read', err);
        delete readMessageByChatRef.current[selectedChat];
      });
  }, [appData, selectedChat, chatMessages, onChatRead]);

  const appendEmoji = (emoji: string) => {
    const input = inputRef.current;
    if (!input) {
      setMessage(prev => {
        const next = `${prev}${emoji}`;
        if (selectedChat && next.trim()) {
          appData.notifyTypingActivity(selectedChat);
        }
        return next;
      });
      return;
    }
    const start = input.selectionStart ?? message.length;
    const end = input.selectionEnd ?? message.length;
    const next = `${message.slice(0, start)}${emoji}${message.slice(end)}`;
    setMessage(next);
    if (selectedChat && next.trim()) {
      appData.notifyTypingActivity(selectedChat);
    }
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const latestSeenOwnMessage = [...chatMessages].reverse().find(msg => msg.isOwn && msg.readAt);
  const latestSeenLabel = latestSeenOwnMessage?.readAt ? formatSeenTime(latestSeenOwnMessage.readAt) : null;
  void seenTick;

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedChat) return;

    const content = message.trim();
    const replyTarget = replyingTo;
    setMessage('');
    setReplyingTo(null);

    try {
      await appData.sendMessage(selectedChat, { content, replyTo: replyTarget });
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const handleSendImage = async (file: File | undefined) => {
    if (!file || !selectedChat) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Please choose an image file.');
      return;
    }

    const replyTarget = replyingTo;
    setReplyingTo(null);

    try {
      await appData.sendImageMessage(selectedChat, { file, replyTo: replyTarget });
    } catch (err) {
      console.error('Failed to send image:', err);
      window.alert(err instanceof Error ? err.message : 'Failed to send image');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReactToMessage = async (messageId: string, emoji: string) => {
    if (!selectedChat || messageId.startsWith('temp-')) return;
    try {
      await appData.reactToMessage(selectedChat, messageId, emoji);
    } catch (err) {
      console.error('Failed to react to message:', err);
    }
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
    const target = document.getElementById(`chat-message-${messageId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    window.setTimeout(() => {
      setHighlightedMessageId(prev => (prev === messageId ? null : prev));
    }, 1500);
  };

  const handleStartChat = async (studentId: string) => {
    // Check if conversation already exists
    const existingConvo = conversations.find(c => c.participantId === studentId);
    if (existingConvo) {
      appData.selectConversation(existingConvo.id);
      setIsNewChatOpen(false);
      return;
    }

    try {
      const token = auth.session?.token;
      if (!token) return;
      const { chatId } = await apiStartConversation(studentId, token);

      const student = students.find(s => s.id === studentId);
      if (student) {
        const conversation: ChatConversation = {
          id: chatId,
          participantId: studentId,
          participantName: student.name,
          participantAvatar: student.avatar,
          lastMessage: 'Start a conversation...',
          timestamp: new Date().toISOString(),
          unread: 0,
          isOnline: true
        };
        appData.upsertConversation(conversation);
        onCreateChat?.(conversation);
      }
      appData.selectConversation(chatId);
      setIsNewChatOpen(false);
    } catch (err) {
      console.error('Failed to start conversation:', err);
    }
  };

  const handleCreateGroup = (name: string, description: string, memberIds: string[]) => {
    // Create new group conversation (this would ideally trigger an update in App.tsx)
    const newGroupId = `group${Date.now()}`;
    const newGroup: ChatConversation = {
      id: newGroupId,
      participantId: newGroupId,
      participantName: name,
      participantAvatar: undefined,
      lastMessage: 'Group created',
      timestamp: new Date().toISOString(),
      unread: 0,
      isGroup: true,
      groupMembers: [currentUserId, ...memberIds]
    };

    // For now, we're not adding to `conversations` here, as `App.tsx` owns that state.
    appData.upsertConversation(newGroup);
    appData.selectConversation(newGroup.id);
    setIsNewChatOpen(false);
  };

  const handleDeleteMessage = async (msg: ChatMessageApi) => {
    if (!selectedChat) return;
    try {
      await appData.deleteMessage(selectedChat, msg.id);
    } catch (err: any) {
      window.alert(err.message || 'Failed to delete message');
    }
  };

  // Mock group data for demonstration
  const mockGroup = viewingGroupInfo ? {
    id: viewingGroupInfo,
    name: selectedConversation?.participantName || 'Group',
    description: 'This is a study group for CS students working on projects together.',
    avatar: selectedConversation?.participantAvatar || '',
    members: selectedConversation?.groupMembers || [],
    admins: [currentUserId],
    createdAt: new Date().toISOString(),
    createdBy: currentUserId
  } : null;

  // If viewing group info, show GroupInfoPage
  if (viewingGroupInfo && mockGroup) {
    return (
      <GroupInfoPage
        group={mockGroup}
        students={students}
        currentUserId={currentUserId}
        onBack={() => setViewingGroupInfo(null)}
        onViewProfile={onViewProfile}
      />
    );
  }

  return (
    <div className="flex flex-col w-full max-w-7xl mx-auto bg-white overflow-hidden pb-16 md:pb-0" style={{ height: 'calc(100vh - 4rem)' }}>
      <div className="flex flex-1 min-h-0 border-x border-gray-200">
        {/* LEFT: Conversations List */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-96 flex-shrink-0 border-r border-gray-200 flex-col min-h-0 bg-white`}>
          {/* Fixed Header — never scrolls */}
          <div className="p-4 md:p-6 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-gray-900 mb-4">Messages</h2>
              <Button
                onClick={() => setIsNewChatOpen(true)}
                size="sm"
                className="gradient-primary rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search messages..."
                className="pl-10 bg-gray-50 border-gray-200 rounded-xl focus:bg-white transition-all duration-300"
              />
            </div>
          </div>

          {/* Scrollable Conversation List */}
          <div className="flex-1 relative">
            <div className="absolute inset-0 overflow-y-auto">
              <div className="p-2 w-full">
              {conversations.map(conversation => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    if (onChatClick) {
                      onChatClick(conversation.id);
                    }
                    appData.selectConversation(conversation.id);
                  }}
                  className={`w-full p-3 text-left rounded-xl transition-all duration-300 mb-1 ${
                    selectedChat === conversation.id 
                      ? 'bg-gray-100' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex gap-3 items-center w-full overflow-hidden">
                    <div className="relative flex-shrink-0">
                      <Avatar className="w-12 h-12 md:w-14 md:h-14 ring-2 ring-white shadow-sm">
                        <AvatarImage src={conversation.participantAvatar} />
                        <AvatarFallback>{conversation.participantName[0]}</AvatarFallback>
                      </Avatar>
                      {conversation.unread > 0 && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 md:w-4 md:h-4 bg-primary rounded-full border-2 border-white"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-sm truncate ${conversation.unread > 0 ? 'text-gray-900' : 'text-gray-900'}`}>
                          {conversation.participantName}
                        </p>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                          {formatDate(conversation.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className={`text-sm truncate ${conversation.unread > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
                          {conversation.lastMessage}
                        </p>
                        {conversation.unread > 0 && (
                          <Badge className="ml-2 bg-primary text-white text-xs min-w-5 h-5 flex items-center justify-center px-1.5">
                            {conversation.unread}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chat Area - Instagram Style */}
        {selectedConversation ? (
          <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0 min-h-0 bg-white`}>
            {/* Fixed Chat Header */}
            <div className="px-4 md:px-6 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => appData.selectConversation(null)}
                  className="md:hidden text-gray-600 hover:text-gray-900 mr-2"
                  aria-label="Back to conversations"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (selectedConversation.isGroup) {
                      setViewingGroupInfo(selectedConversation.id);
                    } else {
                      onViewProfile?.(selectedConversation.participantId);
                    }
                  }}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                    <Avatar className="w-10 h-10">
                    <AvatarImage src={selectedConversation.participantAvatar} />
                    <AvatarFallback>{selectedConversation.participantName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="text-left">
                    <p className="text-sm text-gray-900">{selectedConversation.participantName}</p>
                    <div className="flex items-center gap-1">
                      {typingStatusLabel ? (
                        <>
                          <div className="flex items-center gap-1 text-xs text-primary">
                            <span>{typingStatusLabel}</span>
                            <span className="inline-flex items-end gap-0.5" aria-hidden="true">
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                            </span>
                          </div>
                        </>
                      ) : selectedConversation.isGroup ? (
                        <p className="text-xs text-gray-500">
                          {selectedConversation.groupMembers?.length || 0} members
                        </p>
                      ) : (
                        <>
                          {selectedConversation.isOnline ? (
                            <>
                              <CircleDot className="w-2 h-2 text-green-500 fill-green-500" />
                              <p className="text-xs text-gray-500">Active now</p>
                            </>
                          ) : (
                            <p className="text-xs text-gray-500">
                              {selectedConversation.lastSeenAt ? formatSeenTime(selectedConversation.lastSeenAt).replace('Seen', 'Active') : 'Offline'}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </div>
              <div className="flex items-center gap-1 md:gap-2">

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="hover:bg-gray-100 rounded-full w-8 h-8 md:w-9 md:h-9 p-0">
                      <Info className="w-4 h-4 md:w-5 md:h-5 text-gray-700" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={() => {
                        if (selectedConversation.isGroup) {
                          setViewingGroupInfo(selectedConversation.id);
                        } else {
                          onViewProfile?.(selectedConversation.participantId);
                        }
                      }}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      {selectedConversation.isGroup ? 'View Group Info' : 'View Profile'}
                    </DropdownMenuItem>
                    {!selectedConversation.isGroup && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-orange-600 focus:text-orange-600">
                          <Ban className="w-4 h-4 mr-2" />
                          Block User
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive">
                          <Flag className="w-4 h-4 mr-2" />
                          Report User
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                      Delete Chat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Scrollable Messages Area */}
            <div className="flex-1 relative bg-white min-h-0">
              {showNewMessageBanner && (
                <button
                  onClick={() => {
                    dismissNewMessageBanner();
                    scrollToLatest('smooth');
                  }}
                  className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-primary text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 z-20 hover:scale-105 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span className="text-sm font-medium">New Messages</span>
                </button>
              )}
              {selectedChat && !isChatReady && isLoadingMessages && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}
              {isLoadingOlder && (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center py-3">
                  <div className="rounded-full bg-white/90 p-2 shadow-sm">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
                  </div>
                </div>
              )}
              <div
                ref={messagesViewportRef}
                style={{ overflowAnchor: 'none' }}
                className={`absolute inset-0 overflow-y-auto transition-opacity duration-300 ${
                  !selectedChat || isChatReady || !isLoadingMessages ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <div className="p-4 md:p-6 space-y-3">
                <div ref={topSentinelRef} className="h-px w-full" aria-hidden="true" />
                <div className="space-y-3">
                  {/* "Beginning of conversation" marker */}
                  {selectedChat && selectedChatState && !selectedChatState.hasMore && chatMessages.length > 0 && (
                    <div className="flex justify-center py-4">
                      <span className="text-xs text-gray-400 px-3 py-1 bg-gray-50 rounded-full">
                        Beginning of conversation
                      </span>
                    </div>
                  )}
                {chatMessages.map((msg, index) => {
                  const prevMsg = chatMessages[index - 1];
                  const nextMsg = chatMessages[index + 1];
                  const startsNewDate = index === 0 || !isSameCalendarDay(msg.timestamp, prevMsg.timestamp);
                  const startsSenderGroup = startsNewDate || msg.isOwn !== prevMsg.isOwn;
                  const groupHasMultipleMessages = Boolean(nextMsg && msg.isOwn === nextMsg.isOwn && isSameCalendarDay(msg.timestamp, nextMsg.timestamp));
                  const showDate = startsNewDate;
                  const showGroupStartTime = startsSenderGroup && groupHasMultipleMessages;

                  return (
                    <div key={msg.id} id={`chat-message-${msg.id}`}>
                      {showDate && (
                        <div className="flex justify-center my-4 md:my-6">
                          <span className="text-xs text-gray-500 px-3 md:px-4 py-1 bg-gray-100 rounded-full">
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
                      <div className={`flex items-end gap-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                        {!msg.isOwn && (
                          <Avatar className="w-6 h-6 md:w-7 md:h-7 flex-shrink-0 mb-1">
                            <AvatarImage src={selectedConversation.participantAvatar} />
                            <AvatarFallback>{selectedConversation.participantName[0]}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`group min-w-0 w-fit max-w-[78%] md:max-w-[70%] xl:max-w-[40rem] ${msg.isOwn ? 'order-2' : 'order-1'}`}>
                          <div className="flex items-center gap-2">
                            <div
                              className={`${msg.isOwn ? 'order-2' : 'order-1'} min-w-0 w-fit max-w-full rounded-3xl px-3 py-2 transition-shadow duration-200 md:px-4 md:py-2.5 ${
                                msg.isOwn
                                  ? 'bg-gradient-to-br from-primary to-secondary text-white'
                                  : 'bg-gray-100 text-gray-900'
                              } ${highlightedMessageId === msg.id ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-white' : ''}`}
                            >
                              {msg.replyTo && (
                                <button
                                  type="button"
                                  onClick={() => jumpToMessage(msg.replyTo.id)}
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
                                <img
                                  src={msg.attachments[0].fileUrl}
                                  alt="Chat attachment"
                                  className="max-h-72 rounded-2xl object-cover"
                                />
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
                                      <button
                                        key={item.emoji}
                                        type="button"
                                        title={item.name}
                                        className="flex h-10 w-10 items-center justify-center rounded-full text-2xl hover:bg-gray-100"
                                        onClick={() => handleReactToMessage(msg.id, item.emoji)}
                                      >
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
                                <DropdownMenuContent align={msg.isOwn ? 'end' : 'start'} className="w-auto min-w-0">
                                  <DropdownMenuItem disabled className="text-xs text-gray-500 opacity-100 focus:bg-transparent">
                                    {formatMenuTimestamp(msg.timestamp)}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setReplyingTo(msg)}>
                                    <Reply className="w-4 h-4 mr-2" />
                                    Reply
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(msg.content ?? '')} disabled={!msg.content}>
                                    <Copy className="w-4 h-4 mr-2" />
                                    Copy
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {msg.isOwn ? (
                                    <DropdownMenuItem 
                                      onClick={() => handleDeleteMessage(msg)} 
                                      className="text-destructive focus:text-destructive"
                                      disabled={Date.now() - new Date(msg.timestamp).getTime() > 24 * 60 * 60 * 1000}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => window.alert('Message reported. Our moderation team will review it soon.')} className="text-destructive focus:text-destructive">
                                      <Flag className="w-4 h-4 mr-2" />
                                      Report
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          {Object.entries(msg.reactions || {}).length > 0 && (
                            <div className={`mt-1 flex flex-wrap gap-1 px-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                              {Object.entries(msg.reactions).map(([emoji, userIds]) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => handleReactToMessage(msg.id, emoji)}
                                  className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs shadow-sm"
                                >
                                  {emoji} {userIds.length}
                                </button>
                              ))}
                            </div>
                          )}
                          {latestSeenOwnMessage?.id === msg.id && latestSeenLabel && (
                            <p className="text-xs text-gray-400 mt-1 px-2 text-right">
                              {latestSeenLabel}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {typingStatusLabel && (
                  <div className="flex items-end gap-2 justify-start">
                    <Avatar className="w-6 h-6 md:w-7 md:h-7 flex-shrink-0 mb-1">
                      <AvatarImage src={selectedConversation.participantAvatar} />
                      <AvatarFallback>{selectedConversation.participantName[0]}</AvatarFallback>
                    </Avatar>
                    <div className="rounded-3xl bg-gray-100 px-4 py-3 text-gray-500 shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500">{typingStatusLabel}</span>
                        <span className="inline-flex items-center gap-1" aria-label="Typing indicator">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                </div>
                </div>
              </div>
            </div>

            {/* Fixed Input Footer */}
            <div className="px-4 md:px-6 py-3 md:py-4 border-t border-gray-200 flex-shrink-0">
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
              <div className="flex items-center gap-2 md:gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleSendImage(event.target.files?.[0])}
                />
                <Button onClick={() => fileInputRef.current?.click()} variant="ghost" size="sm" className="hover:bg-gray-100 rounded-full w-8 h-8 md:w-9 md:h-9 p-0 flex-shrink-0">
                  <Image className="w-4 h-4 md:w-5 md:h-5 text-gray-700" />
                </Button>
                <div className="flex-1 relative">
                  <Input
                    type="text"
                    placeholder="Message..."
                    value={message}
                    ref={inputRef}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      setMessage(nextValue);
                      if (!selectedChat) return;
                      if (nextValue.trim()) {
                        appData.notifyTypingActivity(selectedChat);
                        return;
                      }
                      appData.clearLocalTyping(selectedChat);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="w-full pr-10 bg-gray-100 border-gray-100 rounded-full focus:bg-gray-50 transition-all duration-300 text-sm md:text-base"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent rounded-full w-7 h-7 md:w-8 md:h-8 p-0"
                      >
                        <Smile className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-auto p-3">
                      <EmojiPicker onSelect={appendEmoji} />
                    </PopoverContent>
                  </Popover>
                </div>
                {message.trim() && (
                  <Button 
                    onClick={handleSendMessage}
                    className="bg-transparent hover:bg-transparent text-primary p-0 h-auto text-sm md:text-base transition-all duration-300 hover:scale-110"
                  >
                    Send
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 hidden md:flex items-center justify-center bg-white min-w-0">
            <div className="text-center">
              <div className="w-24 h-24 rounded-full border-4 border-gray-900 mx-auto mb-4 flex items-center justify-center">
                <Send className="w-12 h-12 text-gray-900" />
              </div>
              <h3 className="text-gray-900 mb-2">Your Messages</h3>
              <p className="text-gray-500 text-sm">Send messages to connect with students</p>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
        students={students}
        currentUserId={currentUserId}
        onStartChat={handleStartChat}
        onCreateGroup={handleCreateGroup}
      />
    </div>
  );
}
