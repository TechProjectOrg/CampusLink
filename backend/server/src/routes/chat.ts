import express, { Request, Response } from 'express';
import multer from 'multer';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { chatMessageRateLimiter } from '../middleware/rateLimiter';
import {
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
import { createNotification } from '../lib/notifications';
import { encryptMessage, decryptMessage } from '../lib/encryption';

const router = express.Router();
router.use(authenticateToken);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

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
          WHERE m.chat_id = c.chat_id 
            AND m.sender_user_id != ${userId}
            AND (m.message_id > cp_me.last_read_message_id OR cp_me.last_read_message_id IS NULL)
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

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const messages = await prisma.$queryRaw<any[]>`
      SELECT 
        m.message_id, m.sender_user_id, m.message_type, m.content, m.reactions, m.created_at,
        u.username as sender_username, u.profile_photo_url as sender_avatar,
        (
          SELECT json_agg(json_build_object('url', ma.file_url, 'type', ma.file_type))
          FROM message_attachments ma WHERE ma.message_id = m.message_id
        ) as attachments
      FROM messages m
      JOIN users u ON u.user_id = m.sender_user_id
      WHERE m.chat_id = ${chatId}
      ORDER BY m.created_at ASC
    `;

    const formattedMessages = messages.map(m => ({
      id: m.message_id,
      senderId: m.sender_user_id,
      senderName: m.sender_username,
      senderAvatar: m.sender_avatar,
      type: m.message_type,
      content: decryptMessage(m.content),
      reactions: m.reactions,
      timestamp: m.created_at,
      attachments: m.attachments || [],
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

  if (!content || !content.trim()) return res.status(400).json({ message: 'Message content required' });

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const encryptedContent = encryptMessage(content);
    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO messages (chat_id, sender_user_id, message_type, content)
      VALUES (${chatId}, ${userId}, 'text', ${encryptedContent})
      RETURNING message_id, created_at
    `;
    const messageId = rows[0].message_id;

    // Update chat updated_at
    await prisma.$queryRaw`UPDATE chats SET updated_at = NOW() WHERE chat_id = ${chatId}`;

    const participantIds = await getChatParticipantIds(chatId);
    
    // Emit websocket
    emitChatMessage(participantIds, {
      messageId, chatId, senderUserId: userId, senderUsername: username, senderProfilePhotoUrl: null,
      messageType: 'text', content, reactions: {}, replyToMessageId: null, attachments: [], createdAt: rows[0].created_at
    });

    // Notifications for others
    const otherParticipant = participantIds.find(id => id !== userId);
    if (otherParticipant) {
      await createNotification({
        recipientUserId: otherParticipant, actorUserId: userId, type: 'message',
        title: username, message: 'sent you a message', entityType: 'chat', entityId: chatId
      });
    }

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

  if (!file) return res.status(400).json({ message: 'Image file required' });

  try {
    const isParticipant = await isChatParticipant(userId, chatId);
    if (!isParticipant) return res.status(403).json({ message: 'Not a participant' });

    const fileUrl = await uploadChatMediaToStorage({ userId, fileBuffer: file.buffer, mimeType: file.mimetype });

    const rows = await prisma.$queryRaw<any[]>`
      INSERT INTO messages (chat_id, sender_user_id, message_type)
      VALUES (${chatId}, ${userId}, 'image')
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
      messageType: 'image', content: null, reactions: {}, replyToMessageId: null,
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

  if (!messageId) return res.status(400).json({ message: 'messageId is required' });

  try {
    await prisma.$queryRaw`
      UPDATE chat_participants 
      SET last_read_message_id = ${messageId}
      WHERE chat_id = ${chatId} AND user_id = ${userId}
    `;

    const participantIds = await getChatParticipantIds(chatId);
    emitChatRead(participantIds, chatId, userId, messageId);

    return res.status(200).json({ message: 'Read status updated' });
  } catch (err) {
    console.error('Error updating read status:', err);
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
