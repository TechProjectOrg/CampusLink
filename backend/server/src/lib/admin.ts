import prisma from '../prisma';

export type AdminSessionProfile = {
  userId: string;
  email: string;
  username: string;
  role: 'super_admin';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

export async function getAdminAccountByUserId(userId: string): Promise<AdminSessionProfile | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      user_id: string;
      email: string;
      username: string;
      role: 'super_admin';
      must_change_password: boolean;
      last_login_at: Date | null;
    }>
  >`
    SELECT
      u.user_id,
      u.email,
      u.username,
      aa.role,
      aa.must_change_password,
      aa.last_login_at
    FROM admin_accounts aa
    JOIN users u ON u.user_id = aa.user_id
    WHERE aa.user_id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    userId: row.user_id,
    email: row.email,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password,
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
  };
}

export async function markAdminLogin(userId: string): Promise<void> {
  await prisma.$queryRaw`
    UPDATE admin_accounts
    SET last_login_at = NOW(), updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

export async function setAdminMustChangePassword(userId: string, mustChangePassword: boolean): Promise<void> {
  await prisma.$queryRaw`
    UPDATE admin_accounts
    SET must_change_password = ${mustChangePassword}, updated_at = NOW()
    WHERE user_id = ${userId}
  `;
}

export async function recordAdminAuditLog(input: {
  actorUserId: string;
  actionType: string;
  summary: string;
  severity?: 'info' | 'warning' | 'critical';
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.$queryRaw`
    INSERT INTO admin_audit_logs (
      actor_user_id,
      action_type,
      target_type,
      target_id,
      severity,
      summary,
      metadata
    )
    VALUES (
      ${input.actorUserId},
      ${input.actionType},
      ${input.targetType ?? null},
      ${input.targetId ?? null},
      CAST(${input.severity ?? 'info'} AS "AdminSeverity"),
      ${input.summary},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;
}
