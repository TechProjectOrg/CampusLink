const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000';

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UserSkill {
  id: string;
  name: string;
}

type SkillRaw =
  | string
  | {
      id?: string;
      skillId?: string;
      skill_id?: string;
      userSkillId?: string;
      user_skill_id?: string;
      name?: string;
      skillName?: string;
      skill_name?: string;
      skill?: string;
    };

function normalizeSkill(raw: SkillRaw, index: number): UserSkill {
  if (typeof raw === 'string') {
    return { id: raw, name: raw };
  }

  const id =
    raw.id ??
    raw.skillId ??
    raw.skill_id ??
    raw.userSkillId ??
    raw.user_skill_id ??
    String(index);

  const name = raw.name ?? raw.skillName ?? raw.skill_name ?? raw.skill ?? '';

  return { id: String(id), name: String(name) };
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

export async function apiFetchUserSkills(userId: string, token?: string): Promise<UserSkill[]> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/skills`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  if (!Array.isArray(data)) return [];

  return (data as SkillRaw[]).map((item, idx) => normalizeSkill(item, idx));
}

export async function apiAddUserSkill(userId: string, name: string, token?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/skills`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiDeleteUserSkill(
  userId: string,
  skillId: string,
  token?: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/skills/${encodeURIComponent(skillId)}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeaders(token),
      },
    }
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}
