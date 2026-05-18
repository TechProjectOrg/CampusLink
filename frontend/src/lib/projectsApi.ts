import { resolveApiBaseUrl } from './apiBase';
import { resolveProjectImageUrls } from './mediaUtils';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UserProject {
  id: string;
  title: string;
  description: string;
  link: string | null;
  sourceUrl?: string | null;
  demoUrl?: string | null;
  images: string[];
  imageUrl: string | null;
  tags: string[];
}

export interface CreateOrUpdateProjectPayload {
  title: string;
  description: string;
  sourceUrl?: string;
  demoUrl?: string;
  imageUrl?: string;
  images?: string[];
  tags?: string[];
}

type ProjectRaw = {
  id?: string;
  projectId?: string;
  project_id?: string;
  title?: string;
  description?: string;
  link?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  images?: string[];
  tags?: string[] | string;
};

function normalizeProject(raw: ProjectRaw, index: number): UserProject {
  const id = raw.id ?? raw.projectId ?? raw.project_id ?? String(index);
  const title = raw.title ?? '';
  const description = raw.description ?? '';
  const link = raw.link ?? null;
  const imageUrl = raw.imageUrl ?? raw.image_url ?? null;
  const images = resolveProjectImageUrls({
    images: Array.isArray(raw.images) ? raw.images : undefined,
    imageUrl,
  });

  let tags: string[] = [];
  if (typeof raw.tags === 'string') {
    tags = raw.tags.split(',').map((t) => t.trim()).filter(Boolean);
  } else if (Array.isArray(raw.tags)) {
    tags = raw.tags;
  }

  return {
    id: String(id),
    title: String(title),
    description: String(description),
    link: link ? String(link) : null,
    sourceUrl: (raw as Record<string, unknown>).sourceUrl as string | null,
    demoUrl: (raw as Record<string, unknown>).demoUrl as string | null,
    images,
    imageUrl: images[0] ?? (imageUrl ? String(imageUrl) : null),
    tags,
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({}));
  return err?.message || `Request failed (${response.status})`;
}

export async function apiFetchUserProjects(userId: string, token?: string): Promise<UserProject[]> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/projects`, {
    headers: {
      ...authHeaders(token),
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => [])) as unknown;
  if (!Array.isArray(data)) return [];

  return (data as ProjectRaw[]).map((item, idx) => normalizeProject(item, idx));
}

export async function apiCreateUserProject(
  userId: string,
  payload: CreateOrUpdateProjectPayload,
  token?: string,
): Promise<UserProject> {
  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      sourceUrl: payload.sourceUrl,
      demoUrl: payload.demoUrl,
      images: payload.images,
      imageUrl: payload.imageUrl,
      tags: payload.tags,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => null)) as ProjectRaw | null;
  if (!data) {
    throw new Error('Project was created but response payload was empty');
  }
  return normalizeProject(data, 0);
}

export async function apiUploadUserProjectImage(userId: string, file: File, token?: string): Promise<string> {
  const urls = await apiUploadUserProjectImages(userId, [file], token);
  return urls[0];
}

export async function apiUploadUserProjectImages(
  userId: string,
  files: File[],
  token?: string,
): Promise<string[]> {
  if (files.length === 0) return [];

  const formData = new FormData();
  for (const file of files) {
    formData.append('images', file);
  }

  const response = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/projects/upload-images`, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => ({}))) as { imageUrls?: string[]; imageUrl?: string };
  if (Array.isArray(data.imageUrls) && data.imageUrls.length > 0) {
    return data.imageUrls;
  }
  if (data.imageUrl) {
    return [data.imageUrl];
  }
  throw new Error('Project image upload succeeded but image URLs were missing');
}

export async function apiUpdateUserProject(
  userId: string,
  projectId: string,
  payload: {
    title?: string;
    description?: string;
    sourceUrl?: string;
    demoUrl?: string;
    imageUrl?: string;
    images?: string[];
    tags?: string[];
  },
  token?: string,
): Promise<UserProject> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const data = (await response.json().catch(() => null)) as ProjectRaw | null;
  if (!data) {
    throw new Error('Project was updated but response payload was empty');
  }
  return normalizeProject(data, 0);
}

export async function apiDeleteUserProject(userId: string, projectId: string, token?: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/users/${encodeURIComponent(userId)}/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeaders(token),
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}
