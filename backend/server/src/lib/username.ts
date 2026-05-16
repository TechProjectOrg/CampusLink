import crypto from 'crypto';

const USERNAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function sanitizeUsernameBase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '');
}

export function normalizeUsername(value: string): string {
  return value.trim();
}

export function validateUsername(value: string): string | null {
  if (!value) return 'Username is required';
  if (value.length < 3) return 'Username must be at least 3 characters long';
  if (value.length > 50) return 'Username must be 50 characters or fewer';
  if (!USERNAME_PATTERN.test(value)) {
    return 'Username can only contain letters, numbers, and underscores, and cannot start with a digit';
  }
  return null;
}

export function buildUsernameSuggestion(baseValue: string): string {
  const base = sanitizeUsernameBase(baseValue);
  const fallback = `user_${crypto.randomBytes(3).toString('hex')}`;
  let candidate = base || fallback;

  if (candidate.length < 3) {
    candidate = `user_${candidate}`;
  }

  if (/^[0-9]/.test(candidate)) {
    candidate = `user_${candidate}`;
  }

  candidate = candidate.slice(0, 50);
  return validateUsername(candidate) ? fallback : candidate;
}