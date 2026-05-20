import crypto from 'crypto';
import { cacheSetJson, cacheGetJson, cacheDelete } from './cache';

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 10 * 60; // 10 minutes

interface OtpPayload {
  code: string;
  email: string;
  createdAt: number;
}

/**
 * Generate a 6-digit OTP code
 */
export function generateOtp(): string {
  const digits = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return digits.toString().padStart(OTP_LENGTH, '0');
}

/**
 * Store OTP in Redis cache with TTL
 * Key format: otp:{userId}:{newEmail}
 */
export async function storeOtp(userId: string, newEmail: string, code: string): Promise<void> {
  const key = `otp:${userId}:${newEmail.toLowerCase()}`;
  const payload: OtpPayload = {
    code,
    email: newEmail.toLowerCase(),
    createdAt: Date.now(),
  };
  await cacheSetJson(key, payload, OTP_TTL_SECONDS);
}

/**
 * Verify OTP from cache
 * Returns true if OTP is valid and matches, false otherwise
 * Automatically clears the OTP after verification attempt
 */
export async function verifyOtp(userId: string, newEmail: string, providedCode: string): Promise<boolean> {
  const key = `otp:${userId}:${newEmail.toLowerCase()}`;
  const payload = await cacheGetJson<OtpPayload>(key);

  // Clear the OTP after attempting verification (one-time use)
  await cacheDelete(key);

  if (!payload) {
    return false; // OTP not found or expired
  }

  // Case-insensitive code comparison (remove spaces)
  const normalizedProvided = (providedCode || '').replace(/\s/g, '');
  const codeMatches = payload.code === normalizedProvided;

  return codeMatches;
}

/**
 * Clear OTP from cache (for manual cleanup or resend scenarios)
 */
export async function clearOtp(userId: string, newEmail: string): Promise<void> {
  const key = `otp:${userId}:${newEmail.toLowerCase()}`;
  await cacheDelete(key);
}

/**
 * Check if an OTP already exists for a user-email combination
 * (useful for preventing duplicate OTPs before resending)
 */
export async function hasOtpStored(userId: string, newEmail: string): Promise<boolean> {
  const key = `otp:${userId}:${newEmail.toLowerCase()}`;
  const payload = await cacheGetJson<OtpPayload>(key);
  return payload !== null;
}
