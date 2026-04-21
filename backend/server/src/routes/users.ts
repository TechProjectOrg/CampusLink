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

interface UpdateUserBody {
  username: string;
  branch: string;
  year: string | number;
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

router.patch(
  '/:userId',
  async (req: Request<GetUserParams, unknown, Partial<UpdateUserBody>>, res: Response) => {
    const { userId } = req.params;
    const { username, branch, year } = req.body;

    const trimmedUsername = username?.trim();
    const trimmedBranch = branch?.trim();
    const numericYear = typeof year === 'string' ? Number.parseInt(year, 10) : year;

    if (!trimmedUsername || !trimmedBranch || year === undefined || year === null) {
      return res.status(400).json({ message: 'Username, branch, and year are required' });
    }

    if (Number.isNaN(numericYear)) {
      return res.status(400).json({ message: 'Year must be a valid number' });
    }

    try {
      const profileRows = await prisma.$queryRaw<{ user_type: 'student' | 'alumni' }[]>`
        SELECT user_type
        FROM users
        WHERE user_id = ${userId}
      `;

      const profileRow = profileRows[0];
      if (!profileRow) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (
        profileRow.user_type === 'student' &&
        (!Number.isInteger(numericYear) || numericYear < 1 || numericYear > 4)
      ) {
        return res.status(400).json({ message: 'Student year must be between 1 and 4' });
      }

      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          UPDATE users
          SET username = ${trimmedUsername}
          WHERE user_id = ${userId}
        `;

        if (profileRow.user_type === 'student') {
          await tx.$queryRaw`
            UPDATE student_profiles
            SET branch = ${trimmedBranch}, year = ${numericYear}
            WHERE user_id = ${userId}
          `;
          return;
        }

        await tx.$queryRaw`
          UPDATE alumni_profiles
          SET branch = ${trimmedBranch}, passing_year = ${numericYear}
          WHERE user_id = ${userId}
        `;
      });

      const updatedProfile = await getUserProfileById(userId);
      if (!updatedProfile) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json(updatedProfile);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ message: 'Username already exists' });
      }

      console.error('Error updating user profile:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

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
      FROM user_skills
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
      { user_skill_id: string; name: string; created_at: Date }[]
      >`
        INSERT INTO user_skills (user_id, name)
        VALUES (${userId}, ${name.trim()})
        RETURNING user_skill_id, name, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.user_skill_id,
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
          DELETE FROM user_skills
          WHERE user_id = ${userId} AND user_skill_id = ${skillId}
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
        description: string | null;
        credential_url: string | null;
        image_url: string | null;
        issued_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT certification_id, name, issuer, description, credential_url, image_url, issued_at, created_at
      FROM user_certifications
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;

    return res.status(200).json(
      rows.map((r: {
        certification_id: string;
        name: string;
        issuer: string | null;
        description: string | null;
        credential_url: string | null;
        image_url: string | null;
        issued_at: Date | null;
        created_at: Date;
      }) => ({
        id: r.certification_id,
        name: r.name,
        issuer: r.issuer,
        description: r.description,
        credentialUrl: r.credential_url,
        imageUrl: r.image_url,
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

    const issuerValue = issuer?.trim() || null;
    const descriptionValue = description?.trim() || null;
    const credentialUrlValue = credentialUrl?.trim() || null;
    const imageUrlValue = imageUrl?.trim() || null;

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
          description: string | null;
          credential_url: string | null;
          image_url: string | null;
          issued_at: Date | null;
          created_at: Date;
        }[]
      >`
        INSERT INTO user_certifications (user_id, name, issuer, description, credential_url, image_url, issued_at)
        VALUES (${userId}, ${name.trim()}, ${issuerValue}, ${descriptionValue}, ${credentialUrlValue}, ${imageUrlValue}, ${issuedAtDate})
        RETURNING certification_id, name, issuer, description, credential_url, image_url, issued_at, created_at
      `;

      const created = rows[0];
      return res.status(201).json({
        id: created.certification_id,
        name: created.name,
        issuer: created.issuer,
        description: created.description,
        credentialUrl: created.credential_url,
        imageUrl: created.image_url,
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
          DELETE FROM user_certifications
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

// ==============================
// Profile: Projects
// ==============================
router.get('/:userId/projects', async (req: Request<{ userId: string }>, res: Response) => {
  const { userId } = req.params;

  try {
    const rows = await prisma.$queryRaw<
      {
        project_id: string;
        title: string;
        description: string;
        source_url: string | null;
        demo_url: string | null;
        image_url: string | null;
        created_at: Date;
        tags: string[] | null;
      }[]
    >`
      SELECT
        p.project_id,
        p.title,
        p.description,
        p.source_url,
        p.demo_url,
        p.image_url,
        p.created_at,
        COALESCE(
          ARRAY_AGG(pt.tag_name ORDER BY pt.tag_name) FILTER (WHERE pt.tag_name IS NOT NULL),
          ARRAY[]::text[]
        ) AS tags
      FROM user_projects p
      LEFT JOIN project_tags pt ON pt.project_id = p.project_id
      WHERE p.user_id = ${userId}
      GROUP BY p.project_id, p.title, p.description, p.source_url, p.demo_url, p.image_url, p.created_at
      ORDER BY p.created_at DESC
    `;

    return res.status(200).json(
      rows.map((r) => ({
        id: r.project_id,
        title: r.title,
        description: r.description,
        link: r.demo_url ?? r.source_url,
        sourceUrl: r.source_url,
        demoUrl: r.demo_url,
        imageUrl: r.image_url,
        tags: r.tags ?? [],
        createdAt: r.created_at.toISOString(),
      }))
    );
  } catch (err) {
    console.error('Error fetching projects:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/:userId/projects',
  async (
    req: Request<
      { userId: string },
      unknown,
      { title?: string; description?: string; sourceUrl?: string; demoUrl?: string; imageUrl?: string; tags?: string[] }
    >,
    res: Response
  ) => {
    const { userId } = req.params;
    const { title, description, sourceUrl, demoUrl, imageUrl, tags } = req.body;

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Project title and description are required' });
    }

    try {
      const rows = await prisma.$queryRaw<
        {
          project_id: string;
          title: string;
          description: string;
          source_url: string | null;
          demo_url: string | null;
          image_url: string | null;
          created_at: Date;
        }[]
      >`
        INSERT INTO user_projects (user_id, title, description, source_url, demo_url, image_url)
        VALUES (${userId}, ${title.trim()}, ${description.trim()}, ${sourceUrl?.trim() || null}, ${demoUrl?.trim() || null}, ${imageUrl?.trim() || null})
        RETURNING project_id, title, description, source_url, demo_url, image_url, created_at
      `;

      const created = rows[0];
      const normalizedTags = Array.isArray(tags)
        ? Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)))
        : [];

      for (const tagName of normalizedTags) {
        await prisma.$queryRaw`
          INSERT INTO project_tags (project_id, tag_name)
          VALUES (${created.project_id}, ${tagName})
        `;
      }

      return res.status(201).json({
        id: created.project_id,
        title: created.title,
        description: created.description,
        link: created.demo_url ?? created.source_url,
        sourceUrl: created.source_url,
        demoUrl: created.demo_url,
        imageUrl: created.image_url,
        tags: normalizedTags,
        createdAt: created.created_at.toISOString(),
      });
    } catch (err) {
      console.error('Error creating project:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.delete(
  '/:userId/projects/:projectId',
  async (req: Request<{ userId: string; projectId: string }>, res: Response) => {
    const { userId, projectId } = req.params;

    try {
      const result = await prisma.$queryRaw<{ count: number }[]>`
        WITH deleted AS (
          DELETE FROM user_projects
          WHERE user_id = ${userId} AND project_id = ${projectId}
          RETURNING 1
        )
        SELECT COUNT(*)::int AS count FROM deleted
      `;

      const count = result[0]?.count ?? 0;
      if (count === 0) {
        return res.status(404).json({ message: 'Project not found' });
      }

      return res.status(204).send();
    } catch (err) {
      console.error('Error deleting project:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }
);

export default router;
