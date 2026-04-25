import { API_BASE as API_BASE_URL } from './authApi';
import { ChatConversation } from '../types';

// Types for chat API
export type ChatReactions = Record<string, string[]>;

export interface ChatReplyPreviewApi {
  id: string;
  senderId: string;
  senderName: string;
  type: 'text' | 'image' | 'file' | 'system';
  content: string | null;
  attachmentUrl: string | null;
}

export interface ChatMessageApi {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  type: 'text' | 'image' | 'file' | 'system';
  content: string | null;
  reactions: ChatReactions;
  timestamp: string;
  attachments: Array<{ fileUrl: string; fileType: string }>;
  replyToMessageId?: string | null;
  replyTo?: ChatReplyPreviewApi | null;
  readAt?: string | null;
  isOwn: boolean;
}

export interface ConversationApiResponse {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar: string | null;
  lastMessage: string;
  timestamp: string;
  unread: number;
  isOnline: boolean;
  lastSeenAt: string | null;
  isRequest: boolean;
}

export async function apiFetchConversations(token: string, type: 'active' | 'requests' = 'active'): Promise<ConversationApiResponse[]> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations?type=${type}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch conversations');
  }
  return response.json();
}

export async function apiStartConversation(targetUserId: string, token: string): Promise<{ chatId: string; isRequest: boolean; isNew: boolean }> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ targetUserId })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to start conversation');
  }
  return response.json();
}

export interface FetchMessagesResponse {
  messages: ChatMessageApi[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function apiFetchMessages(
  chatId: string,
  token: string,
  options?: { limit?: number; before?: string }
): Promise<FetchMessagesResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.before) params.set('before', options.before);
  const qs = params.toString();

  const response = await fetch(`${API_BASE_URL}/chat/conversations/${chatId}/messages${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch messages');
  }
  return response.json();
}

export async function apiSendMessage(chatId: string, content: string, token: string, replyToMessageId?: string | null): Promise<{ messageId: string }> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ content, replyToMessageId: replyToMessageId ?? undefined })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to send message');
  }
  return response.json();
}

export async function apiSendImageMessage(chatId: string, file: File, token: string, replyToMessageId?: string | null): Promise<{ messageId: string; fileUrl: string }> {
  const formData = new FormData();
  formData.append('image', file);
  if (replyToMessageId) {
    formData.append('replyToMessageId', replyToMessageId);
  }

  const response = await fetch(`${API_BASE_URL}/chat/conversations/${chatId}/messages/image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
      // Note: Do NOT set Content-Type here, let fetch set it with boundary
    },
    body: formData
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to send image message');
  }
  return response.json();
}

export async function apiMarkChatRead(chatId: string, messageId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${chatId}/read`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ messageId })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to mark chat as read');
  }
}

export async function apiReactToMessage(chatId: string, messageId: string, emoji: string, token: string): Promise<{ reactions: ChatReactions }> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${chatId}/messages/${messageId}/reaction`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ emoji })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to update reaction');
  }
  return response.json();
}

export async function apiAcceptChatRequest(chatId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/requests/${chatId}/accept`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to accept chat request');
  }
}

export async function apiDeleteMessage(chatId: string, messageId: string, token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to delete message');
  }
}
