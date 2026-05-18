import type { UserPostMedia } from './postsApi';

export const MAX_POST_IMAGES = 10;
export const MAX_POST_IMAGE_BYTES = 10 * 1024 * 1024;

export function resolvePostImageUrls(media?: UserPostMedia[]): string[] {
  if (!media?.length) return [];
  return [...media]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => m.mediaUrl)
    .filter(Boolean);
}

export function resolveProjectImageUrls(project: {
  images?: string[];
  imageUrl?: string | null;
}): string[] {
  if (project.images?.length) return project.images.filter(Boolean);
  return project.imageUrl ? [project.imageUrl] : [];
}

export function withOpportunityImages(images: string[]): {
  images: string[];
  image?: string;
} {
  const normalized = images.filter(Boolean);
  return {
    images: normalized,
    image: normalized[0],
  };
}

export function collectImageFiles(draft: {
  imageFiles?: File[];
  imageFile?: File;
}): File[] {
  if (Array.isArray(draft.imageFiles) && draft.imageFiles.length > 0) {
    return draft.imageFiles.slice(0, MAX_POST_IMAGES);
  }
  if (draft.imageFile instanceof File) {
    return [draft.imageFile];
  }
  return [];
}
