const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UserCertification {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;

  // Optional metadata (not currently used by UI)
  issuedAt?: string | null;
  createdAt?: string;
}

type CertificationRaw = {
  id?: string;
  certificationId?: string;
  certification_id?: string;
  name?: string;
  issuer?: string | null;
  description?: string | null;
  credentialUrl?: string | null;
  credential_url?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  issuedAt?: string | null;
  issued_at?: string | null;
  createdAt?: string;
  created_at?: string;
};

function normalizeCertification(raw: CertificationRaw, index: number): UserCertification {
  const id = raw.id ?? raw.certificationId ?? raw.certification_id ?? String(index);
  const name = raw.name ?? '';
  const description = (raw.description ?? raw.issuer ?? null) as string | null;
  const imageUrl = (raw.imageUrl ?? raw.credentialUrl ?? raw.image_url ?? raw.credential_url ?? null) as
    | string
    | null;
  const issuedAt = raw.issuedAt ?? raw.issued_at ?? null;
  const createdAt = raw.createdAt ?? raw.created_at;

  return {
    id: String(id),
    name: String(name),
    description: description ? String(description) : null,
    imageUrl: imageUrl ? String(imageUrl) : null,
    issuedAt: issuedAt ? String(issuedAt) : null,
    createdAt: createdAt ? String(createdAt) : undefined,
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

export async function apiFetchUserCertifications(
  userId: string,
  token?: string
): Promise<UserCertification[]> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/certifications`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  if (!Array.isArray(data)) return [];

  return (data as CertificationRaw[]).map((item, idx) => normalizeCertification(item, idx));
}

export async function apiCreateUserCertification(
  userId: string,
  payload: { name: string; description?: string; imageUrl?: string },
  token?: string
): Promise<void> {
  const name = payload.name.trim();
  const description = payload.description?.trim() || null;
  const imageUrl = payload.imageUrl?.trim() || null;

  // Backend currently stores: issuer + credentialUrl. We send both to stay compatible.
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/certifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({
      name,
      description,
      imageUrl,
      issuer: description,
      credentialUrl: imageUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function apiDeleteUserCertification(
  userId: string,
  certificationId: string,
  token?: string
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/certifications/${encodeURIComponent(certificationId)}`,
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
