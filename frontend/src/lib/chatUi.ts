import { ChatMessageApi } from './chatApi';
import { ChatConversation } from '../types';

export const REACTION_EMOJIS = [
  { emoji: '\u{2764}\u{FE0F}', name: 'heart' },
  { emoji: '\u{1F602}', name: 'face with tears of joy' },
  { emoji: '\u{1F62E}', name: 'surprised face' },
  { emoji: '\u{1F622}', name: 'crying face' },
  { emoji: '\u{1F621}', name: 'angry face' },
  { emoji: '\u{1F44D}', name: 'thumbs up' },
];

export function mapRealtimeChatMessage(payload: any, currentUserId: string): ChatMessageApi {
  return {
    id: payload.messageId,
    senderId: payload.senderUserId,
    senderName: payload.senderUsername,
    senderAvatar: payload.senderProfilePhotoUrl,
    type: payload.messageType,
    content: payload.content,
    reactions: payload.reactions || {},
    timestamp: payload.createdAt,
    attachments: payload.attachments || [],
    replyToMessageId: payload.replyToMessageId ?? null,
    replyTo: payload.replyTo ?? null,
    seenBy: payload.seenBy ?? [],
    isOwn: payload.senderUserId === currentUserId
  };
}

export function mergeChatMessageList(list: ChatMessageApi[], incoming: ChatMessageApi): ChatMessageApi[] {
  if (list.some((message) => message.id === incoming.id)) {
    return list.map((message) => (message.id === incoming.id ? { ...message, ...incoming } : message));
  }

  if (incoming.isOwn) {
    const incomingTime = new Date(incoming.timestamp).getTime();
    const tempIndex = list.findIndex((message) => {
      if (!message.id.startsWith('temp-') || !message.isOwn || message.type !== incoming.type) return false;
      const sameContent = (message.content ?? '') === (incoming.content ?? '');
      const sameReply = (message.replyToMessageId ?? null) === (incoming.replyToMessageId ?? null);
      const messageTime = new Date(message.timestamp).getTime();
      return sameContent && sameReply && Math.abs(incomingTime - messageTime) < 30000;
    });

    if (tempIndex !== -1) {
      return list.map((message, index) => (index === tempIndex ? incoming : message));
    }
  }

  return [...list, incoming];
}

export function sortConversationsByTimestamp(
  conversations: ChatConversation[],
): ChatConversation[] {
  return [...conversations].sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime();
    const rightTime = new Date(right.timestamp).getTime();
    return rightTime - leftTime;
  });
}

export function mergeConversationPreviewOnMessage(
  conversations: ChatConversation[],
  payload: any,
  currentUserId: string,
): ChatConversation[] {
  if (!payload?.chatId) return conversations;

  const preview =
    payload.messageType === 'image'
      ? 'Photo'
      : payload.messageType === 'file'
        ? 'File'
        : (payload.content?.trim() || 'No messages yet');

  const updated = conversations.map((conversation) => {
    if (conversation.id !== payload.chatId) return conversation;
    return {
      ...conversation,
      lastMessage: preview,
      timestamp: payload.createdAt,
      unread:
        payload.senderUserId === currentUserId
          ? conversation.unread
          : conversation.unread + 1,
    };
  });

  return sortConversationsByTimestamp(updated);
}

export function mergeConversationPresenceUpdate(
  conversations: ChatConversation[],
  payload: any,
): ChatConversation[] {
  if (!payload?.userId) return conversations;
  return conversations.map((conversation) =>
    conversation.participantId === payload.userId
      ? {
          ...conversation,
          isOnline: Boolean(payload.isOnline),
          lastSeenAt: payload.lastSeenAt ?? null,
        }
      : conversation,
  );
}

export function mergeConversationReadUpdate(
  conversations: ChatConversation[],
  chatId: string,
): ChatConversation[] {
  return conversations.map((conversation) =>
    conversation.id === chatId ? { ...conversation, unread: 0 } : conversation,
  );
}

export function summarizeReply(message: ChatMessageApi): string {
  if (message.type === 'image') return 'Photo';
  return message.content?.trim() || 'Message';
}

export function formatSeenTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'Seen just now';
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute));
    return `Seen ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.floor(diffMs / hour));
    return `Seen ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.max(1, Math.floor(diffMs / day));
  return `Seen ${days} day${days === 1 ? '' : 's'} ago`;
}
