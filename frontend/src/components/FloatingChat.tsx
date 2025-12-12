import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Minus, Send, Search, MoreVertical, Smile, Image as ImageIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { ChatConversation } from '../types';

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  isOwn: boolean;
}

interface FloatingChatProps {
  conversations: ChatConversation[];
  currentUserId: string;
  onOpenFullChat: () => void;
}

export function FloatingChat({ conversations, currentUserId, onOpenFullChat }: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Mock messages for each conversation
  const [messages, setMessages] = useState<{ [key: string]: Message[] }>({
    chat1: [
      {
        id: '1',
        senderId: '1',
        content: 'Hey! Want to team up for the hackathon?',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        isOwn: false
      },
      {
        id: '2',
        senderId: 'current',
        content: 'Yeah, that sounds great! What tech stack are you thinking?',
        timestamp: new Date(Date.now() - 3000000).toISOString(),
        isOwn: true
      },
      {
        id: '3',
        senderId: '1',
        content: 'I was thinking React + Python for ML. I can handle the ML part.',
        timestamp: new Date(Date.now() - 2400000).toISOString(),
        isOwn: false
      },
      {
        id: '4',
        senderId: 'current',
        content: 'Perfect! I\'ll work on the frontend then.',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        isOwn: true
      }
    ],
    chat2: [
      {
        id: '1',
        senderId: '2',
        content: 'Thanks for the UI feedback on my project!',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        isOwn: false
      },
      {
        id: '2',
        senderId: 'current',
        content: 'No problem! The design looks great.',
        timestamp: new Date(Date.now() - 6600000).toISOString(),
        isOwn: true
      }
    ],
    chat3: [
      {
        id: '1',
        senderId: '3',
        content: 'Can you help me with that DP problem?',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        isOwn: false
      },
      {
        id: '2',
        senderId: 'current',
        content: 'Sure! Which problem is it?',
        timestamp: new Date(Date.now() - 84600000).toISOString(),
        isOwn: true
      }
    ]
  });

  const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread, 0);

  const filteredConversations = conversations.filter(conv =>
    conv.participantName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (messageInput.trim() && selectedConversation) {
      const newMessage: Message = {
        id: Date.now().toString(),
        senderId: currentUserId,
        content: messageInput,
        timestamp: new Date().toISOString(),
        isOwn: true
      };

      setMessages({
        ...messages,
        [selectedConversation]: [...(messages[selectedConversation] || []), newMessage]
      });
      setMessageInput('');
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const selectedChat = selectedConversation
    ? conversations.find(c => c.id === selectedConversation)
    : null;

  const chatMessages = selectedConversation ? messages[selectedConversation] || [] : [];

  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const conversationsViewportRef = useRef<HTMLDivElement | null>(null);

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
    if (messagesViewportRef.current) {
      try {
        messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
      } catch (e) {
        // ignore
      }
    }
  }, [selectedConversation, chatMessages.length]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
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
                onClick={() => setSelectedConversation(null)}
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
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  <p className="text-xs text-gray-500">Active now</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea viewportRef={messagesViewportRef} className="flex-1 overflow-hidden px-4 py-3">
              <div className="space-y-3">
                {chatMessages.map((msg, index) => {
                  const showDate = index === 0 || 
                    formatDate(msg.timestamp) !== formatDate(chatMessages[index - 1].timestamp);

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-4">
                          <span className="text-xs text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
                            {formatDate(msg.timestamp)}
                          </span>
                        </div>
                      )}
                      <div className={`flex items-end gap-2 ${msg.isOwn ? 'justify-end' : 'justify-start'}`}>
                        {!msg.isOwn && (
                          <Avatar className="w-6 h-6 flex-shrink-0 mb-1">
                            <AvatarImage src={selectedChat.participantAvatar} />
                            <AvatarFallback className="text-xs">{selectedChat.participantName[0]}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`max-w-[75%] ${msg.isOwn ? 'order-2' : 'order-1'}`}>
                          <div className="group relative">
                            <div
                              className={`rounded-3xl px-4 py-2 ${
                                msg.isOwn
                                  ? 'bg-gradient-to-br from-primary to-secondary text-white'
                                  : 'bg-gray-100 text-gray-900'
                              }`}
                            >
                              <p className="text-sm break-words">{msg.content}</p>
                            </div>
                          </div>
                          <p className={`text-xs text-gray-500 mt-1 px-2 ${msg.isOwn ? 'text-right' : 'text-left'}`}>
                            {formatTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="px-4 py-3 border-t">
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="hover:bg-gray-100 rounded-full w-8 h-8 p-0 flex-shrink-0"
                >
                  <ImageIcon className="w-4 h-4 text-gray-600" />
                </Button>
                <div className="flex-1 relative">
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Message..."
                    className="w-full pr-10 bg-gray-100 border-gray-100 rounded-full focus:bg-gray-50 text-sm"
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent rounded-full w-7 h-7 p-0"
                  >
                    <Smile className="w-4 h-4 text-gray-500" />
                  </Button>
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
                            setSelectedConversation(conv.id);
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