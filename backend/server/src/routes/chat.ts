import express, { Request, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { chatMessageRateLimiter } from '../middleware/rateLimiter';
import {
  ChatReplyPreview,
  getOrCreateDirectChat,
  isChatParticipant,
  getChatParticipantIds,
  markChatAccepted,
  emitChatMessage,
  emitChatRead,
  emitChatReaction,
  emitChatRequestAccepted,
} from '../lib/chat';
import { uploadChatMediaToStorage } from '../lib/objectStorage';
import { encryptMessage, decryptMessage } from '../lib/encryption';

const router = express.Router();
router.use(authenticateToken);

function isValidUUID(uuid: string | undefined | null) {
  if (!uuid) return false;
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

function normalizeReactions(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const reactions: Record<string, string[]> = {};
  for (const [emoji, userIds] of Object.entries(value as Record<string, unknown>)) {
    if (typeof emoji !== 'string' || !Array.isArray(userIds)) continue;
    const safeIds = userIds.filter((id): id is string => typeof id === 'string');
    if (safeIds.length > 0) reactions[emoji] = Array.from(new Set(safeIds));
  }

  return reactions;
}

async function loadReplyPreview(chatId: string, messageId: string | null | undefined): Promise<ChatReplyPreview | null> {
  if (!messageId) return null;

  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      m.message_id,
      m.sender_user_id,
      m.message_type,
      m.content,
      u.username AS sender_username,
      (
        SELECT ma.file_url
        FROM message_attachments ma
        WHERE ma.message_id = m.message_id
        ORDER BY ma.created_at ASC
        LIMIT 1
      ) AS attachment_url
    FROM messages m
    JOIN users u ON u.user_id = m.sender_user_id
    WHERE m.chat_id = ${chatId}
      AND m.message_id = ${messageId}
      AND m.deleted_at IS NULL
    LIMIT 1
  `;

  const reply = rows[0];
  if (!reply) return null;

  return {
    id: reply.message_id,
    senderId: reply.sender_user_id,
    senderName: reply.sender_username,
    type: reply.message_type,
    content: reply.content ? decryptMessage(reply.content) : null,
    attachmentUrl: reply.attachment_url ?? null,
  };
}

// ============================================================
// CONVERSATIONS
// ============================================================

router.get('/conversations', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const type = req.query.type as string; // 'active' or 'requests'
  const isRequest = type === 'requests';

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT 
        c.chat_id, c.is_request, c.updated_at,
        cp_other.user_id as other_user_id,
        u.username as other_username,
        u.profile_photo_url as other_avatar,
        u.is_online as other_is_online,
        u.last_seen_at as other_last_seen,
        (
          SELECT m.content 
          FROM messages m 
          WHERE m.chat_id = c.chat_id 
          ORDER BY m.created_at DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT COUNT(*) 
          FROM messages m 
          LEFT JOIN messages last_read ON last_read.message_id = cp_me.last_read_message_id
          WHERE m.chat_id = c.chat_id 
            AND m.sender_user_id != ${userId}
            AND (cp_me.last_read_message_id IS NULL OR last_read.created_at IS NULL OR m.created_at > last_read.created_at)
        )::int as unread_count
      FROM chats c
      JOIN chat_participants cp_me ON cp_me.chat_id = c.chat_id AND cp_me.user_id = ${userId}
      JOIN chat_participants cp_other ON cp_other.chat_id = c.chat_id AND cp_other.user_id != ${userId}
      JOIN users u ON u.user_id = cp_other.user_id
      WHERE c.is_request = ${isRequest} AND cp_me.left_at IS NULL AND cp_other.left_at IS NULL
      ORDER BY c.updated_at DESC
    `;

    const conversations = rows.map(r => ({
      id: r.chat_id,
      participantId: r.other_user_id,
      participantName: r.other_username,
      participantAvatar: r.other_avatar,
      lastMessage: r.last_message ? decryptMessage(r.last_message) : 'No messages yet',
      timestamp: r.updated_at,
      unread: r.unread_count,
      isOnline: r.other_is_online,
      lastSeenAt: r.other_last_seen,
      isRequest: r.is_request
    }));

    return res.status(200).json(conversations);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/conversations', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const currentUserId = authed.auth!.userId;
  const { targetUserId } = req.body;

  if (!targetUserId) return res.status(400).json({ message: 'targetUserId is required' });
  if (!isValidUUID(targetUserId)) return res.status(400).json({ message: 'Invalid target user ID format' });
  if (targetUserId === currentUserId) return res.status(400).json({ message: 'Cannot chat with yourself' });

  try {
    const result = await getOrCreateDirectChat(currentUserId, targetUserId);
    if (!result) return res.status(403).json({ message: 'You cannot message this user' });

    return res.status(200).json({ chatId: result.chatId, isRequest: result.isRequest, isNew: result.isNew });
  } catch (err) {
    console.error('Error creating/getting conversation:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// MESSAGES
// ============================================================

router.get('/conversations/:chatId/messages', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const chatId = req.params.chatId as string;

  if (!isValidUUID(chatId)) {
    return res.status(400).json({ message: 'Invalid chat ID format' });
  }

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const messages = await prisma.$queryRaw<any[]>`
      SELECT 
        m.message_id, m.sender_user_id, m.message_type, m.content, m.reactions, m.created_at,
        m.reply_to_message_id,
        u.username as sender_username, u.profile_photo_url as sender_avatar,
        reply.sender_user_id as reply_sender_user_id,
        reply.message_type as reply_message_type,
        reply.content as reply_content,
        reply_user.username as reply_sender_username,
        (
          SELECT ma.file_url
          FROM message_attachments ma
          WHERE ma.message_id = reply.message_id
          ORDER BY ma.created_at ASC
          LIMIT 1
        ) as reply_attachment_url,
        (
          SELECT json_agg(json_build_object('fileUrl', ma.file_url, 'fileType', ma.file_type))
          FROM message_attachments ma WHERE ma.message_id = m.message_id
        ) as attachments
      FROM messages m
      JOIN users u ON u.user_id = m.sender_user_id
      LEFT JOIN messages reply ON reply.message_id = m.reply_to_message_id
      LEFT JOIN users reply_user ON reply_user.user_id = reply.sender_user_id
      WHERE m.chat_id = ${chatId}
        AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC
    `;

    const formattedMessages = messages.map(m => ({
      id: m.message_id,
      senderId: m.sender_user_id,
      senderName: m.sender_username,
      senderAvatar: m.sender_avatar,
      type: m.message_type,
      content: decryptMessage(m.content),
      reactions: normalizeReactions(m.reactions),
      timestamp: m.created_at,
      attachments: m.attachments || [],
      replyToMessageId: m.reply_to_message_id,
      replyTo: m.reply_to_message_id ? {
        id: m.reply_to_message_id,
        senderId: m.reply_sender_user_id,
        senderName: m.reply_sender_username,
        type: m.reply_message_type,
        content: m.reply_content ? decryptMessage(m.reply_content) : null,
        attachmentUrl: m.reply_attachment_url ?? null
      } : null,
      isOwn: m.sender_user_id === userId
    }));

    return res.status(200).json(formattedMessages);
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/conversations/:chatId/messages', chatMessageRateLimiter, async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const username = authed.auth!.username;
  const chatId = req.params.chatId as string;
  const content = req.body.content as string;
  const replyToMessageId = req.body.replyToMessageId as string | undefined;

  if (!isValidUUID(chatId)) {
    return res.status(400).json({ message: 'Invalid chat ID format' });
  }
  if (!content || !content.trim()) return res.status(400).json({ message: 'Message content required' });
  if (replyToMessageId && !isValidUUID(replyToMessageId)) {
    return res.status(400).json({ message: 'Invalid reply message ID format' });
  }

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const replyTo = await loadReplyPreview(chatId, replyToMessageId);
    if (replyToMessageId && !replyTo) {
      return res.status(400).json({ message: 'Reply message must belong to this chat' });
    }

    const encryptedContent = encryptMessage(content);
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO messages (chat_id, sender_user_id, message_type, content, reply_to_message_id)
      VALUES (${chatId}, ${userId}, 'text', ${encryptedContent}, ${replyToMessageId ?? null})
      RETURNING message_id, created_at
    `;
    const messageId = rows[0].message_id;

    // Update chat updated_at
    await prisma.$queryRaw`UPDATE chats SET updated_at = NOW() WHERE chat_id = ${chatId}`;

    const participantIds = await getChatParticipantIds(chatId);
    
    // Emit websocket
    emitChatMessage(participantIds, {
      messageId, chatId, senderUserId: userId, senderUsername: username, senderProfilePhotoUrl: null,
      messageType: 'text', content, reactions: {}, replyToMessageId: replyToMessageId ?? null, replyTo, attachments: [], createdAt: rows[0].created_at
    });

    return res.status(201).json({ messageId });
  } catch (err) {
    console.error('Error sending message:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/conversations/:chatId/messages/image', chatMessageRateLimiter, upload.single('image'), async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const username = authed.auth!.username;
  const chatId = req.params.chatId as string;
  const file = req.file;
  const replyToMessageId = req.body.replyToMessageId as string | undefined;

  if (!isValidUUID(chatId)) {
    return res.status(400).json({ message: 'Invalid chat ID format' });
  }
  if (!file) return res.status(400).json({ message: 'Image file required' });
  if (!file.mimetype.toLowerCase().startsWith('image/')) {
    return res.status(400).json({ message: 'Only image uploads are allowed' });
  }
  if (replyToMessageId && !isValidUUID(replyToMessageId)) {
    return res.status(400).json({ message: 'Invalid reply message ID format' });
  }

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const replyTo = await loadReplyPreview(chatId, replyToMessageId);
    if (replyToMessageId && !replyTo) {
      return res.status(400).json({ message: 'Reply message must belong to this chat' });
    }

    const fileUrl = await uploadChatMediaToStorage({ userId, fileBuffer: file.buffer, mimeType: file.mimetype });

    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO messages (chat_id, sender_user_id, message_type, reply_to_message_id)
      VALUES (${chatId}, ${userId}, 'image', ${replyToMessageId ?? null})
      RETURNING message_id, created_at
    `;
    const messageId = rows[0].message_id;

    await prisma.$queryRaw`
      INSERT INTO message_attachments (message_id, file_url, file_type)
      VALUES (${messageId}, ${fileUrl}, ${file.mimetype})
    `;

    await prisma.$queryRaw`UPDATE chats SET updated_at = NOW() WHERE chat_id = ${chatId}`;

    const participantIds = await getChatParticipantIds(chatId);
    emitChatMessage(participantIds, {
      messageId, chatId, senderUserId: userId, senderUsername: username, senderProfilePhotoUrl: null,
      messageType: 'image', content: null, reactions: {}, replyToMessageId: replyToMessageId ?? null, replyTo,
      attachments: [{ fileUrl, fileType: file.mimetype }], createdAt: rows[0].created_at
    });

    return res.status(201).json({ messageId, fileUrl });
  } catch (err) {
    console.error('Error sending image:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// INTERACTIONS
// ============================================================

router.patch('/conversations/:chatId/read', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const chatId = req.params.chatId as string;
  const messageId = req.body.messageId as string;

  if (!isValidUUID(chatId) || !isValidUUID(messageId)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const messageRows = await prisma.$queryRaw<{ message_id: string }[]>`
      SELECT message_id FROM messages
      WHERE chat_id = ${chatId}
        AND message_id = ${messageId}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!messageRows[0]) {
      return res.status(400).json({ message: 'Message must belong to this chat' });
    }

    await prisma.$queryRaw`
      UPDATE chat_participants 
      SET last_read_message_id = ${messageId}
      WHERE chat_id = ${chatId} AND user_id = ${userId}
    `;

    const participantIds = await getChatParticipantIds(chatId);
    emitChatRead(participantIds, chatId, userId, messageId, new Date().toISOString());

    return res.status(200).json({ message: 'Read status updated' });
  } catch (err) {
    console.error('Error updating read status:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/conversations/:chatId/messages/:messageId/reaction', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const chatId = req.params.chatId as string;
  const messageId = req.params.messageId as string;
  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim() : '';

  if (!isValidUUID(chatId) || !isValidUUID(messageId)) {
    return res.status(400).json({ message: 'Invalid ID format' });
  }
  if (!emoji || emoji.length > 16) {
    return res.status(400).json({ message: 'emoji is required' });
  }

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const rows = await prisma.$queryRaw<{ reactions: unknown }[]>`
      SELECT reactions
      FROM messages
      WHERE chat_id = ${chatId}
        AND message_id = ${messageId}
        AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!rows[0]) return res.status(404).json({ message: 'Message not found' });

    const reactions = normalizeReactions(rows[0].reactions);
    const currentUsers = new Set(reactions[emoji] ?? []);
    if (currentUsers.has(userId)) {
      currentUsers.delete(userId);
    } else {
      currentUsers.add(userId);
    }

    if (currentUsers.size === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = Array.from(currentUsers);
    }

    await prisma.$queryRaw`
      UPDATE messages
      SET reactions = ${JSON.stringify(reactions)}::jsonb
      WHERE message_id = ${messageId}
    `;

    const participantIds = await getChatParticipantIds(chatId);
    emitChatReaction(participantIds, chatId, messageId, reactions);

    return res.status(200).json({ reactions });
  } catch (err) {
    console.error('Error updating reaction:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// ============================================================
// REQUEST FLOW
// ============================================================

router.post('/requests/:chatId/accept', async (req: Request, res: Response) => {
  const authed = req as unknown as AuthedRequest;
  const userId = authed.auth!.userId;
  const chatId = req.params.chatId as string;

  if (!isValidUUID(chatId)) {
    return res.status(400).json({ message: 'Invalid chat ID format' });
  }

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    await markChatAccepted(chatId);

    const participantIds = await getChatParticipantIds(chatId);
    const otherParticipant = participantIds.find(id => id !== userId);
    if (otherParticipant) {
      emitChatRequestAccepted(otherParticipant, chatId);
    }

    return res.status(200).json({ message: 'Request accepted' });
  } catch (err) {
    console.error('Error accepting request:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
