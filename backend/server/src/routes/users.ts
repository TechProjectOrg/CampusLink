import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import prisma from '../prisma';
import { getUserProfileById } from '../services/userProfile';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import { verifyPassword } from '../lib/auth';

const router = express.Router();

interface GetUserParams {
  userId: string;
}

const requireOwnUser: RequestHandler = (req, res, next: NextFunction) => {
  const authedRequest = req as unknown as AuthedRequest;
  const { userId } = req.params as unknown as GetUserParams;

  if (!authedRequest.auth || authedRequest.auth.userId !== userId) {
    return res.status(403).json({ message: 'You can only access your own account data' });
  }

  return next();
};

router.use('/:userId', authenticateToken, requireOwnUser);

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

    const passwordMatches = await verifyPassword(password, row.password_hash);
    if (!passwordMatches) {
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

// ==============================
// Profile: Skills
// ==============================
router.get('/:userId/skills', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      { skill_id: string; name: string; created_at: Date }[]
    >`
      SELECT skill_id, name, created_at
      FROM skills
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return res
      .status(200)
      .json(
        rows.map((r: { skill_id: string; name: string; created_at: Date }) => ({
          id: r.skill_id,
          name: r.name,
          createdAt: r.created_at.toISOString(),
        }))
      );
  } catch (err) {
    console.error('Error fetching skills:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/skills',
  async (req: Request<{ userId: string }, unknown, { name?: string }>, res: Response) => {
    const { userId } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Skill name is required' });
    }

    try {
      const rows = await prisma.$queryRaw<
        { skill_id: string; name: string; created_at: Date }[]
      >`
        INSERT INTO skills (user_id, name)
        VALUES (${userId}, ${name.trim()})
        RETURNING skill_id, name, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.skill_id,
        name: created.name,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err: any) {
      // Unique violation (duplicate skill)
      if (err?.code === '23505') {
        return res.status(409).json({ message: 'Skill already exists' });
      }

      console.error('Error creating skill:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.delete(
  '/:userId/skills/:skillId',
  async (req: Request<{ userId: string; skillId: string }>, res: Response) => {
    const { userId, skillId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM skills
          WHERE user_id = ${userId} AND skill_id = ${skillId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Skill not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting skill:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ==============================
// Profile: Certifications
// ==============================
router.get('/:userId/certifications', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      {
        certification_id: string;
        name: string;
        issuer: string | null;
        credential_url: string | null;
        issued_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT certification_id, name, issuer, credential_url, issued_at, created_at
      FROM certifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return res.status(200).json(
      rows.map((r: {
        certification_id: string;
        name: string;
        issuer: string | null;
        credential_url: string | null;
        issued_at: Date | null;
        created_at: Date;
      }) => ({
        id: r.certification_id,
        name: r.name,
        issuer: r.issuer,
        credentialUrl: r.credential_url,
        issuedAt: r.issued_at ? r.issued_at.toISOString().slice(0, 10) : null,
        createdAt: r.created_at.toISOString(),
      }))
    );
  } catch (err) {
    console.error('Error fetching certifications:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/certifications',
  async (
    req: Request<
      { userId: string },
      unknown,
      {
        name?: string;
        issuer?: string;
        credentialUrl?: string;
        issuedAt?: string;
        description?: string;
        imageUrl?: string;
      }
    >,
    res: Response
  ) => {
    const { userId } = req.params;
    const { name, issuer, credentialUrl, issuedAt, description, imageUrl } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Certification name is required' });
    }

    // Accept the UI's {description, imageUrl} but store them in existing DB columns.
    const issuerValue = (issuer ?? description ?? '').trim() || null;
    const credentialUrlValue = (credentialUrl ?? imageUrl ?? '').trim() || null;

    const issuedAtDate = issuedAt ? new Date(issuedAt) : null;
    if (issuedAt && Number.isNaN(issuedAtDate?.getTime())) {
      return res.status(400).json({ message: 'issuedAt must be a valid date (YYYY-MM-DD)' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          certification_id: string;
          name: string;
          issuer: string | null;
          credential_url: string | null;
          issued_at: Date | null;
          created_at: Date;
        }[]
      >`
        INSERT INTO certifications (user_id, name, issuer, credential_url, issued_at)
        VALUES (${userId}, ${name.trim()}, ${issuerValue}, ${credentialUrlValue}, ${issuedAtDate})
        RETURNING certification_id, name, issuer, credential_url, issued_at, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.certification_id,
        name: created.name,
        issuer: created.issuer,
        credentialUrl: created.credential_url,
        issuedAt: created.issued_at ? created.issued_at.toISOString().slice(0, 10) : null,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error creating certification:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.delete(
  '/:userId/certifications/:certificationId',
  async (req: Request<{ userId: string; certificationId: string }>, res: Response) => {
    const { userId, certificationId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM certifications
          WHERE user_id = ${userId} AND certification_id = ${certificationId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Certification not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting certification:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;
