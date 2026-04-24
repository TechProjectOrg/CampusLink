import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// We use the JWT_SECRET as a fallback to derive a 256-bit key if a dedicated ENCRYPTION_KEY is not set.
// A real production app would ideally manage keys using KMS, but a static ENV secret suffices here.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest() 
  : crypto.createHash('sha256').update(process.env.JWT_SECRET || 'fallback-secret-for-chat').digest();

/**
 * Encrypts a string using AES-256-GCM.
 * @returns a formatted string: `ivHex:authTagHex:encryptedHex`
 */
export function encryptMessage(text: string | null): string | null {
  if (!text) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Failed to encrypt message:', error);
    return text;
  }
}

/**
 * Decrypts a string encrypted by `encryptMessage`.
 * Falls back to returning the original string if it's not in the expected format (e.g. legacy plaintext).
 */
export function decryptMessage(encryptedText: string | null): string | null {
  if (!encryptedText) return encryptedText;
  
  try {
    const parts = encryptedText.split(':');
    // If it doesn't match our encryption format, return it as-is (legacy plaintext)
    if (parts.length !== 3) return encryptedText; 
    
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    return '[Decryption Failed]';
  }
}
