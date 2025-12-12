import { useState, useRef, useEffect } from 'react';
import { Send, Search, MoreVertical, Phone, Video, Info, Image, Smile, Heart, CircleDot, Plus, UserPlus, Flag, Ban, Eye } from 'lucide-react';
import { ChatConversation, Student } from '../types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { NewChatModal } from './NewChatModal';
import { GroupInfoPage } from './GroupInfoPage';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface ChatPageProps {
  conversations: ChatConversation[];
  students: Student[];
  currentUserId: string;
  onViewProfile?: (studentId: string) => void;
  onChatClick: (conversationId: string) => void;
}

export function ChatPage({ conversations, students, currentUserId, onViewProfile, onChatClick }: ChatPageProps) {
  const [selectedChat, setSelectedChat] = useState<string | null>(conversations[0]?.id || null);
  const [message, setMessage] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [viewingGroupInfo, setViewingGroupInfo] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ [key: string]: any[] }>(
  {
    chat1: [
      {
        id: '1',
        senderId: '1',
        content: 'Hey! Want to team up for the hackathon?',
        timestamp: '2025-11-01T09:00:00Z',
        isOwn: false
      },
      {
        id: '2',
        senderId: 'current',
        content: 'Yeah, that sounds great! What tech stack are you thinking?',
        timestamp: '2025-11-01T09:15:00Z',
        isOwn: true
      },
      {
        id: '3',
        senderId: '1',
        content: 'I was thinking React + Python for ML. I can handle the ML part.',
        timestamp: '2025-11-01T09:20:00Z',
        isOwn: false
      },
      {
        id: '4',
        senderId: 'current',
        content: 'Perfect! I\'ll work on the frontend then. When should we start?',
        timestamp: '2025-11-01T09:25:00Z',
        isOwn: true
      },
      {
        id: '5',
        senderId: '1',
        content: 'How about tomorrow? We can meet in the computer lab.',
        timestamp: '2025-11-01T09:30:00Z',
        isOwn: false
      }
    ],
    chat2: [
      {
        id: '1',
        senderId: '2',
        content: 'Thanks for the UI feedback on my project!',
        timestamp: '2025-10-31T16:00:00Z',
        isOwn: false
      },
      {
        id: '2',
        senderId: 'current',
        content: 'No problem! The design looks great. Love the color scheme.',
        timestamp: '2025-10-31T16:15:00Z',
        isOwn: true
      },
      {
        id: '3',
        senderId: '2',
        content: 'I used Figma for the mockups. Happy to share the file if you want!',
        timestamp: '2025-10-31T16:20:00Z',
        isOwn: false
      }
    ],
    chat3: [
      {
        id: '1',
        senderId: '3',
        content: 'Can you help me with that DP problem?',
        timestamp: '2025-10-30T14:00:00Z',
        isOwn: false
      },
      {
        id: '2',
        senderId: 'current',
        content: 'Sure! Which problem is it?',
        timestamp: '2025-10-30T14:10:00Z',
        isOwn: true
      },
      {
        id: '3',
        senderId: '3',
        content: 'The longest increasing subsequence one from yesterday\'s contest.',
        timestamp: '2025-10-30T14:15:00Z',
        isOwn: false
      }
    ],
    group1: [
      {
        id: '1',
        senderId: '1',
        content: 'Hey team! I think we should focus on the backend API first.',
        timestamp: '2025-11-02T10:00:00Z',
        isOwn: false
      },
      {
        id: '2',
        senderId: '2',
        content: 'Agreed! I can start working on the frontend mockups meanwhile.',
        timestamp: '2025-11-02T10:15:00Z',
        isOwn: false
      },
      {
        id: '3',
        senderId: 'current',
        content: 'Sounds good! I\'ll set up the database schema today.',
        timestamp: '2025-11-02T10:30:00Z',
        isOwn: true
      },
      {
        id: '4',
        senderId: '5',
        content: 'Perfect! I\'ll handle the deployment and CI/CD setup.',
        timestamp: '2025-11-02T11:00:00Z',
        isOwn: false
      },
      {
        id: '5',
        senderId: '1',
        content: 'Let\'s have a quick sync call tonight at 8 PM?',
        timestamp: '2025-11-02T14:30:00Z',
        isOwn: false
      },
      {
        id: '6',
        senderId: 'current',
        content: 'Works for me! 👍',
        timestamp: '2025-11-02T15:00:00Z',
        isOwn: true
      },
      {
        id: '7',
        senderId: '2',
        content: 'Let\'s finalize the presentation slides by tomorrow',
        timestamp: '2025-11-02T18:45:00Z',
        isOwn: false
      }
    ]
  });

  const selectedConversation = conversations.find(c => c.id === selectedChat);
  const chatMessages = selectedChat ? messages[selectedChat] || [] : [];

  const messagesViewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Scroll to the bottom (latest message) whenever a chat is selected or messages change
    if (messagesViewportRef.current) {
      try {
        messagesViewportRef.current.scrollTop = messagesViewportRef.current.scrollHeight;
      } catch (e) {
        // ignore
      }
    }
  }, [selectedChat, chatMessages.length]);

  const handleSendMessage = () => {
    if (!message.trim() || !selectedChat) return;

    const newMessage = {
      id: Date.now().toString(),
      senderId: currentUserId,
      content: message,
      timestamp: new Date().toISOString(),
      isOwn: true
    };

    setMessages({
      ...messages,
      [selectedChat]: [...(messages[selectedChat] || []), newMessage]
    });
    setMessage('');
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

  const handleStartChat = (studentId: string) => {
    // Check if conversation already exists
    const existingConvo = conversations.find(c => c.participantId === studentId);
    if (existingConvo) {
      setSelectedChat(existingConvo.id);
      onChatClick(existingConvo.id); // Reorder on existing chat selection
      setIsNewChatOpen(false);
      return;
    }

    // Create new conversation (this would ideally trigger an update in App.tsx)
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const newConversation: ChatConversation = {
      id: `chat${Date.now()}`,
      participantId: studentId,
      participantName: student.name,
      participantAvatar: student.avatar,
      lastMessage: 'Start a conversation...',
      timestamp: new Date().toISOString(),
      unread: 0,
      isGroup: false
    };

    // For now, we're not adding to `conversations` here, as `App.tsx` owns that state.
    // In a real app, `onStartChat` would likely be a prop from `App.tsx` that updates its state.
    // For now, simply select the chat and let the parent reorder if it chooses.
    setSelectedChat(newConversation.id);
    setMessages({ ...messages, [newConversation.id]: [] });
    setIsNewChatOpen(false);
  };

  const handleCreateGroup = (name: string, description: string, memberIds: string[]) => {
    // Create new group conversation (this would ideally trigger an update in App.tsx)
    const newGroupId = `group${Date.now()}`;
    const newGroup: ChatConversation = {
      id: newGroupId,
      participantId: newGroupId,
      participantName: name,
      participantAvatar: `https://api.dicebear.com/7.x/shapes/svg?seed=${name}`,
      lastMessage: 'Group created',
      timestamp: new Date().toISOString(),
      unread: 0,
      isGroup: true,
      groupMembers: [currentUserId, ...memberIds]
    };

    // For now, we're not adding to `conversations` here, as `App.tsx` owns that state.
    setSelectedChat(newGroup.id);
    setMessages({ ...messages, [newGroup.id]: [] });
    setIsNewChatOpen(false);
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
    <div className="h-[calc(100vh-4rem)] pb-20 md:pb-0 bg-white overflow-hidden">
      <div className="h-full w-full flex border-x border-gray-200 overflow-hidden">
        {/* Conversations List - Instagram Style */}
        <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-96 flex-shrink-0 overflow-hidden border-r border-gray-200 flex-col bg-white`}>
          {/* Header */}
          <div className="p-4 md:p-6 border-b border-gray-200">
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

          {/* Conversation List */}
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="p-2 w-full">
              {conversations.map(conversation => (
                <button
                  key={conversation.id}
                  onClick={() => {
                    setSelectedChat(conversation.id);
                    onChatClick(conversation.id);
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
          </ScrollArea>
        </div>

        {/* Chat Area - Instagram Style */}
        {selectedConversation ? (
          <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-white min-w-0`}>
            {/* Chat Header */}
            <div className="px-4 md:px-6 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedChat(null)}
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
                      {selectedConversation.isGroup ? (
                        <p className="text-xs text-gray-500">
                          {selectedConversation.groupMembers?.length || 0} members
                        </p>
                      ) : (
                        <>
                          <CircleDot className="w-2 h-2 text-green-500 fill-green-500" />
                          <p className="text-xs text-gray-500">Active now</p>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </div>
              <div className="flex items-center gap-1 md:gap-2">
                <Button variant="ghost" size="sm" className="hover:bg-gray-100 rounded-full w-8 h-8 md:w-9 md:h-9 p-0">
                  <Phone className="w-4 h-4 md:w-5 md:h-5 text-gray-700" />
                </Button>
                <Button variant="ghost" size="sm" className="hover:bg-gray-100 rounded-full w-8 h-8 md:w-9 md:h-9 p-0">
                  <Video className="w-4 h-4 md:w-5 md:h-5 text-gray-700" />
                </Button>
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

            {/* Messages */}
            <ScrollArea viewportRef={messagesViewportRef} className="flex-1 overflow-hidden min-w-0">
              <div className="p-4 md:p-6 space-y-3 max-w-3xl mx-auto">
                {chatMessages.map((msg, index) => {
                  const showDate = index === 0 || 
                    formatDate(msg.timestamp) !== formatDate(chatMessages[index - 1].timestamp);

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="flex justify-center my-4 md:my-6">
                          <span className="text-xs text-gray-500 px-3 md:px-4 py-1 bg-gray-100 rounded-full">
                            {formatDate(msg.timestamp)}
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
                        <div className={`max-w-[75%] md:max-w-md ${msg.isOwn ? 'order-2' : 'order-1'}`}>
                          <div className="group relative">
                            <div
                              className={`rounded-3xl px-3 py-2 md:px-4 md:py-2.5 ${
                                msg.isOwn
                                  ? 'bg-gradient-to-br from-primary to-secondary text-white'
                                  : 'bg-gray-100 text-gray-900'
                              }`}
                            >
                              <p className="text-sm break-words">{msg.content}</p>
                            </div>
                            {msg.isOwn && (
                              <button className="hidden md:block absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <MoreVertical className="w-4 h-4 text-gray-400" />
                              </button>
                            )}
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

            {/* Message Input - Instagram Style */}
            <div className="px-4 md:px-6 py-3 md:py-4 border-t border-gray-200">
              <div className="flex items-center gap-2 md:gap-3">
                <Button variant="ghost" size="sm" className="hover:bg-gray-100 rounded-full w-8 h-8 md:w-9 md:h-9 p-0 flex-shrink-0">
                  <Image className="w-4 h-4 md:w-5 md:h-5 text-gray-700" />
                </Button>
                <div className="flex-1 relative">
                  <Input
                    type="text"
                    placeholder="Message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="w-full pr-10 bg-gray-100 border-gray-100 rounded-full focus:bg-gray-50 transition-all duration-300 text-sm md:text-base"
                  />
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="absolute right-1 top-1/2 -translate-y-1/2 hover:bg-transparent rounded-full w-7 h-7 md:w-8 md:h-8 p-0"
                  >
                    <Smile className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
                  </Button>
                </div>
                {message.trim() ? (
                  <Button 
                    onClick={handleSendMessage}
                    className="bg-transparent hover:bg-transparent text-primary p-0 h-auto text-sm md:text-base transition-all duration-300 hover:scale-110"
                  >
                    Send
                  </Button>
                ) : (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="hover:bg-transparent rounded-full w-8 h-8 md:w-9 md:h-9 p-0 flex-shrink-0"
                  >
                    <Heart className="w-4 h-4 md:w-5 md:h-5 text-gray-700" />
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