import express, { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../prisma';
import { getUserProfileById } from '../services/userProfile';

const router = express.Router();

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

interface GetUserParams {
  userId: string;
}

router.get('/:userId', async (req: Request<GetUserParams>, res: Response) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  try {
    const profile = await getUserProfileById(userId);
    if (!profile) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(profile);
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

interface DeleteUserBody {
  password: string;
}

// Deletes the user and all dependent records via DB cascades.
// For now, this uses password confirmation (no JWT/session validation implemented yet).
router.delete('/:userId', async (req: Request<GetUserParams, unknown, Partial<DeleteUserBody>>, res: Response) => {
  const { userId } = req.params;
  const { password } = req.body;

  if (!userId) {
    return res.status(400).json({ message: 'Missing userId' });
  }

  if (!password) {
    return res.status(400).json({ message: 'Password is required to delete account' });
  }

  try {
    const rows = await prisma.$queryRaw<{ password_hash: string }[]>`
      SELECT password_hash
      FROM users
      WHERE user_id = ${userId}
    `;

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ message: 'User not found' });
    }

    const incomingHash = hashPassword(password);
    if (incomingHash !== row.password_hash) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    await prisma.$queryRaw`
      DELETE FROM users
      WHERE user_id = ${userId}
    `;

    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting user account:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
