import { randomUUID } from 'crypto';
import { PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

interface StorageEnv {
  bucketName: string;
  region: string;
  endpoint?: string;
  publicBaseUrl: string;
  profilePhotosPrefix: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function requiredEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable (any of): ${names.join(', ')}`);
}

function optionalEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function buildStorageEnv(): StorageEnv {
  const bucketName = requiredEnv([
    'STORAGE_BUCKET_NAME',
    'STORAGE_S3_BUCKET_NAME',
    'STORAGE_S3_BUCKET',
    'S3_BUCKET_NAME',
  ]);
  const region = requiredEnv(['STORAGE_S3_REGION', 'S3_REGION']);
  const endpoint = optionalEnv(['STORAGE_S3_ENDPOINT', 'S3_ENDPOINT']);
  const accessKeyId = requiredEnv(['STORAGE_S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID']);
  const secretAccessKey = requiredEnv(['STORAGE_S3_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY']);

  const publicBaseUrl = normalizeBaseUrl(
    optionalEnv(['STORAGE_S3_PUBLIC_BASE_URL', 'S3_PUBLIC_BASE_URL']) ??
      (endpoint
        ? `${normalizeBaseUrl(endpoint)}/${bucketName}`
        : `https://${bucketName}.s3.${region}.amazonaws.com`)
  );

  return {
    bucketName,
    region,
    endpoint,
    publicBaseUrl,
    profilePhotosPrefix:
      optionalEnv(['STORAGE_S3_PROFILE_PHOTOS_PREFIX', 'S3_PROFILE_PHOTOS_PREFIX']) ??
      'users/profile-photos',
    accessKeyId,
    secretAccessKey,
  };
}

let cachedStorageEnv: StorageEnv | null = null;
let cachedS3Client: S3Client | null = null;

function getStorageEnv(): StorageEnv {
  if (!cachedStorageEnv) {
    cachedStorageEnv = buildStorageEnv();
  }
  return cachedStorageEnv;
}

function getS3Client(): S3Client {
  if (!cachedS3Client) {
    const storageEnv = getStorageEnv();
    cachedS3Client = new S3Client({
      region: storageEnv.region,
      endpoint: storageEnv.endpoint,
      forcePathStyle: !!storageEnv.endpoint,
      credentials: {
        accessKeyId: storageEnv.accessKeyId,
        secretAccessKey: storageEnv.secretAccessKey,
      },
    });
  }

  return cachedS3Client;
}

function extensionFromMime(mimeType: string): string {
  const lookup: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };

  return lookup[mimeType.toLowerCase()] ?? 'bin';
}

export async function uploadProfilePhotoToStorage(params: {
  userId: string;
  fileBuffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const storageEnv = getStorageEnv();
  const extension = extensionFromMime(params.mimeType);
  const fileName = `${Date.now()}-${randomUUID()}.${extension}`;
  const key = `${storageEnv.profilePhotosPrefix}/${params.userId}/${fileName}`;

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: storageEnv.bucketName,
      Key: key,
      Body: params.fileBuffer,
      ContentType: params.mimeType,
      CacheControl: 'public,max-age=31536000,immutable',
    })
  );

  return `${storageEnv.publicBaseUrl}/${key}`;
}

export async function deleteManagedPhotoByUrl(photoUrl: string | null): Promise<void> {
  if (!photoUrl) return;

  const storageEnv = getStorageEnv();

  const base = `${storageEnv.publicBaseUrl}/`;
  if (!photoUrl.startsWith(base)) {
    return;
  }

  const key = photoUrl.slice(base.length);
  if (!key) return;

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: storageEnv.bucketName,
      Key: key,
    })
  );
}
