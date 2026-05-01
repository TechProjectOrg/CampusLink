import prisma from '../prisma';

export type ClubPrivacy = 'open' | 'request' | 'private';
export type ClubMembershipRole = 'owner' | 'admin' | 'member';
export type ClubMembershipStatus = 'active' | 'pending' | 'invited' | 'removed' | 'left';
export type ClubRestrictionType = 'posting_blocked' | 'comment_blocked' | 'membership_ban';

export interface ClubPermissionSnapshot {
  canViewClub: boolean;
  canJoinClub: boolean;
  canRequestJoin: boolean;
  canManageClub: boolean;
  canModerateMembers: boolean;
  canCreatePosts: boolean;
  canComment: boolean;
  canInviteMembers: boolean;
  membershipStatus: ClubMembershipStatus | null;
  membershipRole: ClubMembershipRole | null;
}

export interface ClubMembershipRecord {
  clubMembershipId: string;
  clubId: string;
  userId: string;
  role: ClubMembershipRole;
  status: ClubMembershipStatus;
  joinedAt: Date | null;
}

interface ClubAccessRow {
  club_id: string;
  privacy: ClubPrivacy;
  created_by_user_id: string;
  membership_role: ClubMembershipRole | null;
  membership_status: ClubMembershipStatus | null;
  club_membership_id: string | null;
  active_restrictions: unknown;
}

const CLUB_RESTRICTION_TYPES: ClubRestrictionType[] = ['posting_blocked', 'comment_blocked', 'membership_ban'];

function parseActiveRestrictions(rawValue: unknown): ClubRestrictionType[] {
  let values: string[] = [];

  if (Array.isArray(rawValue)) {
    values = rawValue.map((value) => String(value));
  } else if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          values = parsed.map((value) => String(value));
        }
      } catch {
        values = [];
      }
    } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      values = trimmed
        .slice(1, -1)
        .split(',')
        .map((value) => value.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    } else {
      values = [trimmed];
    }
  }

  const valid = new Set(CLUB_RESTRICTION_TYPES);
  return values.filter((value): value is ClubRestrictionType => valid.has(value as ClubRestrictionType));
}

export function normalizeClubCategoryName(rawValue: string): string {
  return rawValue.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeClubTagName(rawValue: string): string {
  return rawValue.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function slugifyClubName(rawValue: string): string {
  return rawValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 255);
}

export async function ensureUniqueClubSlug(baseName: string): Promise<string> {
  const baseSlug = slugifyClubName(baseName) || `club-${Date.now()}`;
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const rows = await prisma.$queryRaw<Array<{ slug: string }>>`
      SELECT slug
      FROM clubs
      WHERE slug = ${candidate}
      LIMIT 1
    `;

    if (!rows[0]) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function resolveOrCreateClubCategory(params: {
  displayName: string;
  createdByUserId: string;
}): Promise<{ clubCategoryId: string; displayName: string; normalizedName: string }> {
  const displayName = params.displayName.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeClubCategoryName(displayName);

  const rows = await prisma.$queryRaw<Array<{ club_category_id: string; display_name: string; normalized_name: string }>>`
    INSERT INTO club_categories (display_name, normalized_name, is_system, created_by_user_id, created_at, updated_at)
    VALUES (${displayName}, ${normalizedName}, FALSE, ${params.createdByUserId}, NOW(), NOW())
    ON CONFLICT (normalized_name)
    DO UPDATE SET display_name = club_categories.display_name
    RETURNING club_category_id, display_name, normalized_name
  `;

  return {
    clubCategoryId: rows[0]!.club_category_id,
    displayName: rows[0]!.display_name,
    normalizedName: rows[0]!.normalized_name,
  };
}

export async function upsertClubTags(clubId: string, rawTags: string[]): Promise<void> {
  const seen = new Map<string, string>();
  for (const rawTag of rawTags) {
    const displayName = rawTag.trim().replace(/\s+/g, ' ');
    const normalizedName = normalizeClubTagName(displayName);
    if (!normalizedName) continue;
    seen.set(normalizedName, displayName);
  }

  await prisma.$queryRaw`DELETE FROM club_tags_on_clubs WHERE club_id = ${clubId}`;

  for (const [normalizedName, displayName] of seen.entries()) {
    const tagRows = await prisma.$queryRaw<Array<{ club_tag_id: string }>>`
      INSERT INTO club_tags (display_name, normalized_name)
      VALUES (${displayName}, ${normalizedName})
      ON CONFLICT (normalized_name)
      DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING club_tag_id
    `;

    const clubTagId = tagRows[0]?.club_tag_id;
    if (!clubTagId) continue;

    await prisma.$queryRaw`
      INSERT INTO club_tags_on_clubs (club_id, club_tag_id)
      VALUES (${clubId}, ${clubTagId})
      ON CONFLICT (club_id, club_tag_id) DO NOTHING
    `;
  }
}

async function loadClubAccess(clubId: string, viewerUserId: string): Promise<ClubAccessRow | null> {
  const rows = await prisma.$queryRaw<ClubAccessRow[]>`
    SELECT
      c.club_id,
      c.privacy,
      c.created_by_user_id,
      cm.role AS membership_role,
      cm.status AS membership_status,
      cm.club_membership_id,
      COALESCE(
        (
          SELECT JSON_AGG(cmr.restriction_type::text)
          FROM club_member_restrictions cmr
          WHERE cmr.club_membership_id = cm.club_membership_id
            AND (cmr.expires_at IS NULL OR cmr.expires_at > NOW())
        ),
        '[]'::json
      ) AS active_restrictions
    FROM clubs c
    LEFT JOIN club_memberships cm
      ON cm.club_id = c.club_id
      AND cm.user_id = ${viewerUserId}
    WHERE c.club_id = ${clubId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function getClubPermissionSnapshot(clubId: string, viewerUserId: string): Promise<ClubPermissionSnapshot | null> {
  const row = await loadClubAccess(clubId, viewerUserId);
  if (!row) return null;

  const membershipRole = row.membership_role;
  const membershipStatus = row.membership_status;
  const restrictions = new Set(parseActiveRestrictions(row.active_restrictions));
  const isManager = membershipRole === 'owner' || membershipRole === 'admin';
  const isActiveMember = membershipStatus === 'active';
  const isInvitedMember = membershipStatus === 'invited';
  const isCreator = row.created_by_user_id === viewerUserId;
  const canViewClub = row.privacy !== 'private' || isActiveMember || isInvitedMember || isManager || isCreator;

  return {
    canViewClub,
    canJoinClub: !isActiveMember && (row.privacy === 'open' || isInvitedMember),
    canRequestJoin: row.privacy === 'request' && membershipStatus !== 'pending' && !isActiveMember,
    canManageClub: isManager || isCreator,
    canModerateMembers: isManager || isCreator,
    canCreatePosts: canViewClub && isActiveMember && !restrictions.has('posting_blocked'),
    canComment: canViewClub && isActiveMember && !restrictions.has('comment_blocked'),
    canInviteMembers: isManager || isCreator,
    membershipStatus,
    membershipRole,
  };
}

export async function requireActiveClubMembership(clubId: string, userId: string): Promise<ClubMembershipRecord | null> {
  const rows = await prisma.$queryRaw<ClubMembershipRecord[]>`
    SELECT
      club_membership_id,
      club_id,
      user_id,
      role,
      status,
      joined_at
    FROM club_memberships
    WHERE club_id = ${clubId}
      AND user_id = ${userId}
      AND status = CAST('active' AS "ClubMembershipStatus")
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function canViewerAccessClubPost(viewerUserId: string, postId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ visible_to_viewer: boolean }>>`
    SELECT (
      p.author_user_id = ${viewerUserId}
      OR (
        p.club_id IS NOT NULL
        AND (
          (p.visibility = CAST('club_members' AS "PostVisibility") AND EXISTS (
            SELECT 1
            FROM club_memberships cm
            WHERE cm.club_id = p.club_id
              AND cm.user_id = ${viewerUserId}
              AND cm.status = CAST('active' AS "ClubMembershipStatus")
          ))
          OR (
            p.visibility IN (CAST('public' AS "PostVisibility"), CAST('followers' AS "PostVisibility"))
            AND (
              c.privacy <> CAST('private' AS "ClubPrivacy")
              OR EXISTS (
                SELECT 1
                FROM club_memberships cm
                WHERE cm.club_id = p.club_id
                  AND cm.user_id = ${viewerUserId}
                  AND cm.status = CAST('active' AS "ClubMembershipStatus")
              )
            )
          )
        )
      )
      OR (
        p.club_id IS NULL
        AND (
          p.visibility = CAST('public' AS "PostVisibility")
          OR (
            p.visibility = CAST('followers' AS "PostVisibility")
            AND EXISTS (
              SELECT 1
              FROM follows f
              WHERE f.follower_user_id = ${viewerUserId}
                AND f.followed_user_id = p.author_user_id
            )
          )
        )
      )
    ) AS visible_to_viewer
    FROM posts p
    LEFT JOIN clubs c ON c.club_id = p.club_id
    WHERE p.post_id = ${postId}
    LIMIT 1
  `;

  return Boolean(rows[0]?.visible_to_viewer);
}
