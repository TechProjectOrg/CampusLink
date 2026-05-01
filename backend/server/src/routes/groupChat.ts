/**
 * Group Chat API Routes
 *
 * Endpoints for managing independent group chats and club chats
 */

import express, { type Request, Response } from 'express';
import multer from 'multer';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import {
  createGroupChat,
  addUserToChat,
  removeUserFromChat,
  changeUserRole,
  updateGroupChat,
  deleteGroupChat,
  getGroupChatDetails,
  getChatMembers,
  leaveGroupChat,
} from '../lib/groupChat';
import { validateChatAccess, validateActiveChatAccess } from '../lib/chatMembership';
import { deleteManagedChatMediaByUrl, uploadChatMediaToStorage } from '../lib/objectStorage';

const router = express.Router();
router.use(authenticateToken);
const groupAvatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/**
 * POST /api/group-chat/create
 * Create a new independent group chat
 */
router.post('/create', async (req: AuthedRequest, res: Response) => {
  try {
    const { name, description, memberIds } = req.body;
    const userId = req.auth!.userId;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    if (memberIds && !Array.isArray(memberIds)) {
      return res.status(400).json({ error: 'memberIds must be an array' });
    }

    const chatId = await createGroupChat(
      userId,
      name.trim(),
      description?.trim() || undefined,
      memberIds || [],
    );

    res.status(201).json({ chatId });
  } catch (err) {
    console.error('Error creating group chat:', err);
    res.status(500).json({ error: 'Failed to create group chat' });
  }
});

router.get('/:chatId', async (req: AuthedRequest, res: Response) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.auth!.userId;

    await validateChatAccess(userId, chatId);

    const details = await getGroupChatDetails(chatId, userId);
    res.json(details);
  } catch (err: any) {
    console.error('Error fetching group chat details:', err);
    res.status(500).json({ error: 'Failed to fetch group details' });
  }
});

/**
 * POST /api/group-chat/:chatId/add-member
 * Add a user to a group chat
 */
router.post('/:chatId/add-member', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId: targetUserId, role } = req.body;
    const chatId = String(req.params.chatId);
    const actorId = req.auth!.userId;

    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    if (role && !['MEMBER', 'ADMIN'].includes(role.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Validate actor's access
    await validateActiveChatAccess(actorId, chatId);

    // Add user
    await addUserToChat(actorId, targetUserId, chatId, role?.toUpperCase() || 'MEMBER');

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error adding member to chat:', err);
    if (err.message.includes('permission')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to add member' });
  }
});

/**
 * POST /api/group-chat/:chatId/remove-member
 * Remove a user from a group chat
 */
router.post('/:chatId/remove-member', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId: targetUserId, reason } = req.body;
    const chatId = String(req.params.chatId);
    const actorId = req.auth!.userId;

    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    // Validate actor's access
    await validateActiveChatAccess(actorId, chatId);

    // Remove user
    await removeUserFromChat(actorId, targetUserId, chatId, reason);

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error removing member from chat:', err);
    if (err.message.includes('permission')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/**
 * POST /api/group-chat/:chatId/leave
 * User leaves a group chat
 */
router.post('/:chatId/leave', async (req: AuthedRequest, res: Response) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.auth!.userId;

    // Validate user is a member
    await validateActiveChatAccess(userId, chatId);

    // Leave
    await leaveGroupChat(userId, chatId);

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error leaving group chat:', err);
    res.status(500).json({ error: 'Failed to leave group chat' });
  }
});

/**
 * POST /api/group-chat/:chatId/change-role
 * Change a member's role in a group chat
 */
router.post('/:chatId/change-role', async (req: AuthedRequest, res: Response) => {
  try {
    const { userId: targetUserId, newRole } = req.body;
    const chatId = String(req.params.chatId);
    const actorId = req.auth!.userId;

    if (!targetUserId || typeof targetUserId !== 'string') {
      return res.status(400).json({ error: 'targetUserId is required' });
    }

    if (!newRole || !['OWNER', 'ADMIN', 'MEMBER'].includes(newRole.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid newRole' });
    }

    // Validate actor's access
    await validateActiveChatAccess(actorId, chatId);

    // Change role
    await changeUserRole(actorId, targetUserId, chatId, newRole.toUpperCase());

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error changing member role:', err);
    if (err.message.includes('permission')) {
      return res.status(403).json({ error: err.message });
    }
    if (err.message.includes('last owner')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to change member role' });
  }
});

/**
 * PUT /api/group-chat/:chatId
 * Update group chat settings (name, description, avatar)
 */
router.put('/:chatId', async (req: AuthedRequest, res: Response) => {
  try {
    const { name, description, avatarUrl } = req.body;
    const chatId = String(req.params.chatId);
    const userId = req.auth!.userId;

    // Validate user's access
    await validateActiveChatAccess(userId, chatId);

    // Update
    await updateGroupChat(userId, chatId, {
      name,
      description,
      avatarUrl,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error updating group chat:', err);
    if (err.message.includes('permission')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to update group chat' });
  }
});

/**
 * PATCH /api/group-chat/:chatId/avatar
 * Upload and update group avatar (admin/owner only)
 */
router.patch(
  '/:chatId/avatar',
  groupAvatarUpload.single('image'),
  async (req: AuthedRequest & { file?: Express.Multer.File }, res: Response) => {
    try {
      const chatId = String(req.params.chatId);
      const userId = req.auth!.userId;
      const uploadedFile = req.file;

      if (!uploadedFile) {
        return res.status(400).json({ error: 'image file is required' });
      }
      if (!uploadedFile.mimetype.startsWith('image/')) {
        return res.status(400).json({ error: 'Only image uploads are allowed' });
      }

      await validateActiveChatAccess(userId, chatId);
      const current = await getGroupChatDetails(chatId, userId);

      const nextAvatarUrl = await uploadChatMediaToStorage({
        userId,
        fileBuffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
      });

      await updateGroupChat(userId, chatId, { avatarUrl: nextAvatarUrl });

      if (current.avatarUrl && current.avatarUrl !== nextAvatarUrl) {
        try {
          await deleteManagedChatMediaByUrl(current.avatarUrl);
        } catch (storageErr) {
          console.warn('Unable to delete previous group avatar from object storage:', storageErr);
        }
      }

      return res.json({ avatarUrl: nextAvatarUrl });
    } catch (err: any) {
      console.error('Error updating group avatar:', err);
      if (err?.message?.includes('permission')) {
        return res.status(403).json({ error: err.message });
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Group avatar must be 5MB or smaller' });
      }
      if (err instanceof Error && err.message.startsWith('Missing required environment variable')) {
        return res.status(500).json({ error: 'Image storage is not configured on the server' });
      }
      return res.status(500).json({ error: 'Failed to update group avatar' });
    }
  },
);

/**
 * DELETE /api/group-chat/:chatId
 * Delete a group chat (only owner can do this)
 */
router.delete('/:chatId', async (req: AuthedRequest, res: Response) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.auth!.userId;

    // Validate user's access
    await validateActiveChatAccess(userId, chatId);

    // Delete
    await deleteGroupChat(userId, chatId);

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting group chat:', err);
    if (err.message.includes('permission')) {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to delete group chat' });
  }
});

/**
 * GET /api/group-chat/:chatId/members
 * Get list of members in a group chat
 */
router.get('/:chatId/members', async (req: AuthedRequest, res: Response) => {
  try {
    const chatId = String(req.params.chatId);
    const userId = req.auth!.userId;

    // Validate user can access this chat
    await validateChatAccess(userId, chatId);

    // Get members
    const members = await getChatMembers(chatId, false);

    res.json({ members });
  } catch (err: any) {
    console.error('Error fetching group chat members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

export default router;
