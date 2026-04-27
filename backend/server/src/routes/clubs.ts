import express, { Request, Response } from 'express';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import prisma from '../prisma';
import authenticateToken, { type AuthedRequest } from '../middleware/authenticateToken';
import {
  ensureUniqueClubSlug,
  getClubPermissionSnapshot,
  normalizeClubCategoryName,
  requireActiveClubMembership,
  resolveOrCreateClubCategory,
  upsertClubTags,
} from '../lib/clubs';
import {
  deleteManagedClubMediaByUrl,
  uploadClubMediaToStorage,
} from '../lib/objectStorage';
import { createNotification } from '../lib/notifications';
import { hydratePosts } from '../lib/feedCache';

const router = express.Router();
router.use(authenticateToken);

const clubMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 2,
  },
});

interface ClubListRow {
  club_id: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  privacy: 'open' | 'request' | 'private';
  avatar_url: string | null;
  cover_image_url: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
  primary_category_id: string | null;
  category_display_name: string | null;
  member_count: number;
  post_count: number;
  tags: string[] | null;
  membership_status: 'active' | 'pending' | 'invited' | 'removed' | 'left' | null;
  membership_role: 'owner' | 'admin' | 'member' | null;
}

interface ClubMemberRow {
  club_membership_id: string;
  user_id: string;
  username: string;
  profile_photo_url: string | null;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'invited' | 'removed' | 'left';
  joined_at: Date | null;
}

function parsePaging(value: string | undefined, fallback: number, max: number): number {
  const parsed = parseInt(value ?? '', 10);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(Math.max(safe, 0), max);
}

function getAuthedUserId(req: Request): string {
  return (req as unknown as AuthedRequest).auth!.userId;
}

function isUniqueConstraintError(err: unknown, constraintName: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (err.code !== 'P2010') {
    return false;
  }

  const metaText = JSON.stringify(err.meta ?? {});
  return metaText.includes(constraintName);
}

function mapClubRow(row: ClubListRow, permissionSnapshot?: Awaited<ReturnType<typeof getClubPermissionSnapshot>>) {
  return {
    id: row.club_id,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    privacy: row.privacy,
    avatarUrl: row.avatar_url,
    coverImageUrl: row.cover_image_url,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    primaryCategory: row.primary_category_id
      ? {
          id: row.primary_category_id,
          displayName: row.category_display_name,
        }
      : null,
    tags: row.tags ?? [],
    memberCount: row.member_count,
    postCount: row.post_count,
    membership: {
      status: row.membership_status,
      role: row.membership_role,
    },
    permissions: permissionSnapshot,
  };
}

async function loadClubBySlugOrId(clubIdOrSlug: string, viewerUserId: string): Promise<ClubListRow | null> {
  const rows = await prisma.$queryRaw<ClubListRow[]>`
    SELECT
      c.club_id,
      c.name,
      c.slug,
      c.short_description,
      c.description,
      c.privacy,
      c.avatar_url,
      c.cover_image_url,
      c.created_by_user_id,
      c.created_at,
      c.updated_at,
      c.primary_category_id,
      cc.display_name AS category_display_name,
      (
        SELECT COUNT(*)::int
        FROM club_memberships cm_count
        WHERE cm_count.club_id = c.club_id
          AND cm_count.status = CAST('active' AS "ClubMembershipStatus")
      ) AS member_count,
      (
        SELECT COUNT(*)::int
        FROM posts p
        WHERE p.club_id = c.club_id
      ) AS post_count,
      COALESCE(
        (
          SELECT ARRAY_AGG(ct.display_name ORDER BY ct.display_name)
          FROM club_tags_on_clubs ctoc
          JOIN club_tags ct ON ct.club_tag_id = ctoc.club_tag_id
          WHERE ctoc.club_id = c.club_id
        ),
        ARRAY[]::text[]
      ) AS tags,
      cm.status AS membership_status,
      cm.role AS membership_role
    FROM clubs c
    LEFT JOIN club_categories cc ON cc.club_category_id = c.primary_category_id
    LEFT JOIN club_memberships cm
      ON cm.club_id = c.club_id
      AND cm.user_id = ${viewerUserId}
    WHERE c.club_id::text = ${clubIdOrSlug}
       OR c.slug = ${clubIdOrSlug}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

router.get('/categories', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 6, 1), 50);
  const offset = parsePaging(req.query.offset as string | undefined, 0, 1000);
  const q = (req.query.q as string | undefined)?.trim();
  const pattern = q ? `%${normalizeClubCategoryName(q)}%` : null;

  try {
    const rows = await prisma.$queryRaw<Array<{
      club_category_id: string;
      display_name: string;
      normalized_name: string;
      is_system: boolean;
    }>>`
      SELECT club_category_id, display_name, normalized_name, is_system
      FROM club_categories
      WHERE ${pattern}::text IS NULL
         OR normalized_name ILIKE ${pattern}
      ORDER BY is_system DESC, display_name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return res.status(200).json(rows.map((row) => ({
      id: row.club_category_id,
      displayName: row.display_name,
      normalizedName: row.normalized_name,
      isSystem: row.is_system,
    })));
  } catch (err) {
    console.error('Error loading club categories:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 50);
  const offset = parsePaging(req.query.offset as string | undefined, 0, 5000);
  const q = (req.query.q as string | undefined)?.trim();
  const category = (req.query.category as string | undefined)?.trim();
  const tag = (req.query.tag as string | undefined)?.trim();
  const qPattern = q ? `%${q}%` : null;
  const categoryPattern = category ? normalizeClubCategoryName(category) : null;
  const tagPattern = tag ? normalizeClubCategoryName(tag) : null;

  try {
    const rows = await prisma.$queryRaw<ClubListRow[]>`
      SELECT
        c.club_id,
        c.name,
        c.slug,
        c.short_description,
        c.description,
        c.privacy,
        c.avatar_url,
        c.cover_image_url,
        c.created_by_user_id,
        c.created_at,
        c.updated_at,
        c.primary_category_id,
        cc.display_name AS category_display_name,
        (
          SELECT COUNT(*)::int
          FROM club_memberships cm_count
          WHERE cm_count.club_id = c.club_id
            AND cm_count.status = CAST('active' AS "ClubMembershipStatus")
        ) AS member_count,
        (
          SELECT COUNT(*)::int
          FROM posts p
          WHERE p.club_id = c.club_id
        ) AS post_count,
        COALESCE(
          (
            SELECT ARRAY_AGG(ct.display_name ORDER BY ct.display_name)
            FROM club_tags_on_clubs ctoc
            JOIN club_tags ct ON ct.club_tag_id = ctoc.club_tag_id
            WHERE ctoc.club_id = c.club_id
          ),
          ARRAY[]::text[]
        ) AS tags,
        cm.status AS membership_status,
        cm.role AS membership_role
      FROM clubs c
      LEFT JOIN club_categories cc ON cc.club_category_id = c.primary_category_id
      LEFT JOIN club_memberships cm
        ON cm.club_id = c.club_id
        AND cm.user_id = ${viewerUserId}
      WHERE (
        c.privacy <> CAST('private' AS "ClubPrivacy")
        OR EXISTS (
          SELECT 1
          FROM club_memberships cm_visible
          WHERE cm_visible.club_id = c.club_id
            AND cm_visible.user_id = ${viewerUserId}
            AND cm_visible.status = CAST('active' AS "ClubMembershipStatus")
        )
      )
      AND (
        ${qPattern}::text IS NULL
        OR c.name ILIKE ${qPattern}
        OR COALESCE(c.short_description, '') ILIKE ${qPattern}
      )
      AND (
        ${categoryPattern}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM club_categories cc_filter
          WHERE cc_filter.club_category_id = c.primary_category_id
            AND cc_filter.normalized_name = ${categoryPattern}
        )
      )
      AND (
        ${tagPattern}::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM club_tags_on_clubs ctoc_filter
          JOIN club_tags ct_filter ON ct_filter.club_tag_id = ctoc_filter.club_tag_id
          WHERE ctoc_filter.club_id = c.club_id
            AND ct_filter.normalized_name = ${tagPattern}
        )
      )
      ORDER BY member_count DESC, c.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const clubs = await Promise.all(
      rows.map(async (row) => mapClubRow(row, await getClubPermissionSnapshot(row.club_id, viewerUserId)))
    );

    return res.status(200).json(clubs);
  } catch (err) {
    console.error('Error loading clubs:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post(
  '/',
  clubMediaUpload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    const viewerUserId = getAuthedUserId(req);
    const payload = typeof req.body.payload === 'string'
      ? JSON.parse(req.body.payload)
      : req.body;
    const name = String(payload?.name ?? '').trim();
    const shortDescription = String(payload?.shortDescription ?? '').trim() || null;
    const description = String(payload?.description ?? '').trim() || null;
    const privacy = String(payload?.privacy ?? 'open').trim().toLowerCase() as 'open' | 'request' | 'private';
    const primaryCategory = String(payload?.primaryCategory ?? '').trim();
    const tags = Array.isArray(payload?.tags) ? payload.tags.map((tag: unknown) => String(tag)) : [];

    if (!name || !description || !primaryCategory) {
      return res.status(400).json({ message: 'name, description, and primaryCategory are required' });
    }

    if (!['open', 'request', 'private'].includes(privacy)) {
      return res.status(400).json({ message: 'privacy must be open, request, or private' });
    }

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const avatarFile = files?.avatar?.[0] ?? null;
    const coverImageFile = files?.coverImage?.[0] ?? null;

    if ((avatarFile && !avatarFile.mimetype.startsWith('image/')) || (coverImageFile && !coverImageFile.mimetype.startsWith('image/'))) {
      return res.status(400).json({ message: 'Only image uploads are allowed for club media' });
    }

    let avatarUrl: string | null = null;
    let coverImageUrl: string | null = null;

    try {
      const category = await resolveOrCreateClubCategory({
        displayName: primaryCategory,
        createdByUserId: viewerUserId,
      });
      const slug = await ensureUniqueClubSlug(name);

      if (avatarFile) {
        avatarUrl = await uploadClubMediaToStorage({
          userId: viewerUserId,
          fileBuffer: avatarFile.buffer,
          mimeType: avatarFile.mimetype,
        });
      }

      if (coverImageFile) {
        coverImageUrl = await uploadClubMediaToStorage({
          userId: viewerUserId,
          fileBuffer: coverImageFile.buffer,
          mimeType: coverImageFile.mimetype,
        });
      }

      const createdClubRows = await prisma.$transaction(async (tx) => {
        const inserted = await tx.$queryRaw<Array<{ club_id: string }>>`
          INSERT INTO clubs (
            name,
            slug,
            short_description,
            description,
            privacy,
            avatar_url,
            cover_image_url,
            created_by_user_id,
            primary_category_id
          )
          VALUES (
            ${name},
            ${slug},
            ${shortDescription},
            ${description},
            CAST(${privacy} AS "ClubPrivacy"),
            ${avatarUrl},
            ${coverImageUrl},
            ${viewerUserId},
            ${category.clubCategoryId}
          )
          RETURNING club_id
        `;

        const clubId = inserted[0]?.club_id;
        if (!clubId) {
          throw new Error('Failed to create club');
        }

        await tx.$queryRaw`
          INSERT INTO club_memberships (club_id, user_id, role, status, joined_at)
          VALUES (
            ${clubId},
            ${viewerUserId},
            CAST('owner' AS "ClubMembershipRole"),
            CAST('active' AS "ClubMembershipStatus"),
            NOW()
          )
        `;

        return { clubId };
      });

      await upsertClubTags(createdClubRows.clubId, tags);
      const clubRow = await loadClubBySlugOrId(createdClubRows.clubId, viewerUserId);
      if (!clubRow) {
        return res.status(201).json({ id: createdClubRows.clubId });
      }

      return res.status(201).json(mapClubRow(clubRow, await getClubPermissionSnapshot(clubRow.club_id, viewerUserId)));
    } catch (err) {
      await Promise.allSettled([
        deleteManagedClubMediaByUrl(avatarUrl),
        deleteManagedClubMediaByUrl(coverImageUrl),
      ]);

      if (isUniqueConstraintError(err, 'clubs_name_key')) {
        return res.status(409).json({ message: 'A club with this name already exists' });
      }

      if (isUniqueConstraintError(err, 'clubs_slug_key')) {
        return res.status(409).json({ message: 'A club with a similar name already exists. Try a different name.' });
      }

      console.error('Error creating club:', err);
      return res.status(500).json({ message: 'Internal server error' });
    }
  },
);

router.get('/:clubIdOrSlug', async (req: Request<{ clubIdOrSlug: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const clubRow = await loadClubBySlugOrId(req.params.clubIdOrSlug, viewerUserId);
  if (!clubRow) {
    return res.status(404).json({ message: 'Club not found' });
  }

  const permissions = await getClubPermissionSnapshot(clubRow.club_id, viewerUserId);
  if (!permissions?.canViewClub) {
    return res.status(403).json({ message: 'You are not allowed to view this club' });
  }

  return res.status(200).json(mapClubRow(clubRow, permissions));
});

router.get('/:clubId/members', async (req: Request<{ clubId: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const permissions = await getClubPermissionSnapshot(req.params.clubId, viewerUserId);
  if (!permissions?.canViewClub) {
    return res.status(403).json({ message: 'You are not allowed to view club members' });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
  const offset = parsePaging(req.query.offset as string | undefined, 0, 5000);

  try {
    const rows = await prisma.$queryRaw<ClubMemberRow[]>`
      SELECT
        cm.club_membership_id,
        cm.user_id,
        u.username,
        u.profile_photo_url,
        cm.role,
        cm.status,
        cm.joined_at
      FROM club_memberships cm
      JOIN users u ON u.user_id = cm.user_id
      WHERE cm.club_id = ${req.params.clubId}
      ORDER BY
        CASE cm.role
          WHEN CAST('owner' AS "ClubMembershipRole") THEN 0
          WHEN CAST('admin' AS "ClubMembershipRole") THEN 1
          ELSE 2
        END,
        cm.joined_at ASC NULLS LAST,
        cm.created_at ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return res.status(200).json(rows.map((row) => ({
      clubMembershipId: row.club_membership_id,
      userId: row.user_id,
      username: row.username,
      profilePictureUrl: row.profile_photo_url,
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at ? row.joined_at.toISOString() : null,
    })));
  } catch (err) {
    console.error('Error loading club members:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:clubId/posts', async (req: Request<{ clubId: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const permissions = await getClubPermissionSnapshot(req.params.clubId, viewerUserId);
  if (!permissions?.canViewClub) {
    return res.status(403).json({ message: 'You are not allowed to view club posts' });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
  const offset = parsePaging(req.query.offset as string | undefined, 0, 5000);

  try {
    const rows = await prisma.$queryRaw<Array<{ post_id: string }>>`
      SELECT p.post_id
      FROM posts p
      WHERE p.club_id = ${req.params.clubId}
      ORDER BY p.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const posts = await hydratePosts(viewerUserId, rows.map((row) => row.post_id));
    return res.status(200).json(posts.filter((post) => post.clubId === req.params.clubId));
  } catch (err) {
    console.error('Error loading club posts:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:clubId/join', async (req: Request<{ clubId: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const clubRow = await loadClubBySlugOrId(req.params.clubId, viewerUserId);
  if (!clubRow) {
    return res.status(404).json({ message: 'Club not found' });
  }

  try {
    if (clubRow.privacy === 'private') {
      return res.status(403).json({ message: 'This club is private and invite-only' });
    }

    const nextStatus = clubRow.privacy === 'open' ? 'active' : 'pending';
    await prisma.$queryRaw`
      INSERT INTO club_memberships (club_id, user_id, role, status, joined_at)
      VALUES (
        ${clubRow.club_id},
        ${viewerUserId},
        CAST('member' AS "ClubMembershipRole"),
        CAST(${nextStatus} AS "ClubMembershipStatus"),
        ${nextStatus === 'active' ? Prisma.sql`NOW()` : null}
      )
      ON CONFLICT (club_id, user_id)
      DO UPDATE SET
        role = CAST('member' AS "ClubMembershipRole"),
        status = CAST(${nextStatus} AS "ClubMembershipStatus"),
        joined_at = CASE
          WHEN ${nextStatus} = 'active' THEN NOW()
          ELSE club_memberships.joined_at
        END,
        updated_at = NOW()
    `;

    if (nextStatus === 'pending') {
      await createNotification({
        recipientUserId: clubRow.created_by_user_id,
        actorUserId: viewerUserId,
        type: 'club',
        title: clubRow.name,
        message: 'requested to join your club',
        entityType: 'club',
        entityId: clubRow.club_id,
      });
    }

    const updatedClub = await loadClubBySlugOrId(clubRow.club_id, viewerUserId);
    return res.status(200).json(mapClubRow(updatedClub!, await getClubPermissionSnapshot(clubRow.club_id, viewerUserId)));
  } catch (err) {
    console.error('Error joining club:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:clubId/approve', async (req: Request<{ clubId: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const permissions = await getClubPermissionSnapshot(req.params.clubId, viewerUserId);
  if (!permissions?.canModerateMembers) {
    return res.status(403).json({ message: 'You are not allowed to approve members' });
  }

  const targetUserId = String((req.body as { userId?: string })?.userId ?? '').trim();
  if (!targetUserId) {
    return res.status(400).json({ message: 'userId is required' });
  }

  try {
    await prisma.$queryRaw`
      UPDATE club_memberships
      SET
        status = CAST('active' AS "ClubMembershipStatus"),
        joined_at = NOW(),
        updated_at = NOW()
      WHERE club_id = ${req.params.clubId}
        AND user_id = ${targetUserId}
        AND status IN (CAST('pending' AS "ClubMembershipStatus"), CAST('invited' AS "ClubMembershipStatus"))
    `;

    await createNotification({
      recipientUserId: targetUserId,
      actorUserId: viewerUserId,
      type: 'club',
      title: 'Club membership approved',
      message: 'Your club membership request was approved',
      entityType: 'club',
      entityId: req.params.clubId,
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Error approving club member:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:clubId/invite', async (req: Request<{ clubId: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const permissions = await getClubPermissionSnapshot(req.params.clubId, viewerUserId);
  if (!permissions?.canInviteMembers) {
    return res.status(403).json({ message: 'You are not allowed to invite members' });
  }

  const targetUserId = String((req.body as { userId?: string })?.userId ?? '').trim();
  if (!targetUserId) {
    return res.status(400).json({ message: 'userId is required' });
  }

  try {
    await prisma.$queryRaw`
      INSERT INTO club_memberships (club_id, user_id, role, status)
      VALUES (
        ${req.params.clubId},
        ${targetUserId},
        CAST('member' AS "ClubMembershipRole"),
        CAST('invited' AS "ClubMembershipStatus")
      )
      ON CONFLICT (club_id, user_id)
      DO UPDATE SET
        role = CAST('member' AS "ClubMembershipRole"),
        status = CAST('invited' AS "ClubMembershipStatus"),
        updated_at = NOW()
    `;

    await createNotification({
      recipientUserId: targetUserId,
      actorUserId: viewerUserId,
      type: 'club',
      title: 'Club invitation',
      message: 'You were invited to join a club',
      entityType: 'club',
      entityId: req.params.clubId,
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Error inviting club member:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:clubId/leave', async (req: Request<{ clubId: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);

  try {
    await prisma.$queryRaw`
      UPDATE club_memberships
      SET status = CAST('left' AS "ClubMembershipStatus"), updated_at = NOW()
      WHERE club_id = ${req.params.clubId}
        AND user_id = ${viewerUserId}
        AND status IN (
          CAST('active' AS "ClubMembershipStatus"),
          CAST('pending' AS "ClubMembershipStatus"),
          CAST('invited' AS "ClubMembershipStatus")
        )
    `;

    return res.status(204).send();
  } catch (err) {
    console.error('Error leaving club:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:clubId/remove', async (req: Request<{ clubId: string }>, res: Response) => {
  const viewerUserId = getAuthedUserId(req);
  const permissions = await getClubPermissionSnapshot(req.params.clubId, viewerUserId);
  if (!permissions?.canModerateMembers) {
    return res.status(403).json({ message: 'You are not allowed to remove members' });
  }

  const targetUserId = String((req.body as { userId?: string })?.userId ?? '').trim();
  const reason = String((req.body as { reason?: string })?.reason ?? '').trim() || null;
  const restrictPosting = Boolean((req.body as { restrictPosting?: boolean })?.restrictPosting);
  const restrictComments = Boolean((req.body as { restrictComments?: boolean })?.restrictComments);

  if (!targetUserId) {
    return res.status(400).json({ message: 'userId is required' });
  }

  try {
    const membership = await requireActiveClubMembership(req.params.clubId, targetUserId);
    if (!membership) {
      return res.status(404).json({ message: 'Active membership not found' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        UPDATE club_memberships
        SET status = CAST('removed' AS "ClubMembershipStatus"), updated_at = NOW()
        WHERE club_membership_id = ${membership.clubMembershipId}
      `;

      const restrictions: Array<'posting_blocked' | 'comment_blocked' | 'membership_ban'> = ['membership_ban'];
      if (restrictPosting) restrictions.push('posting_blocked');
      if (restrictComments) restrictions.push('comment_blocked');

      for (const restrictionType of restrictions) {
        await tx.$queryRaw`
          INSERT INTO club_member_restrictions (
            club_id,
            club_membership_id,
            user_id,
            imposed_by_user_id,
            restriction_type,
            reason
          ) VALUES (
            ${req.params.clubId},
            ${membership.clubMembershipId},
            ${targetUserId},
            ${viewerUserId},
            CAST(${restrictionType} AS "ClubRestrictionType"),
            ${reason}
          )
        `;
      }
    });

    await createNotification({
      recipientUserId: targetUserId,
      actorUserId: viewerUserId,
      type: 'club',
      title: 'Club membership updated',
      message: 'Your club membership was removed',
      entityType: 'club',
      entityId: req.params.clubId,
    });

    return res.status(204).send();
  } catch (err) {
    console.error('Error removing club member:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
