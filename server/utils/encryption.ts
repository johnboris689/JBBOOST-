import crypto from 'crypto';

// Use ENCRYPTION_KEY or derive a consistent 32-byte key from JWT_SECRET
const SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'jb-boost-smm-super-secret-key-32b';
const KEY = crypto.createHash('sha256').update(SECRET).digest();
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt sensitive provider API keys before persisting in the database
 */
export function encryptApiKey(text: string): string {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[Encryption] Failed to encrypt API key:', err);
    return text;
  }
}

/**
 * Decrypt provider API key for server-side provider API requests
 */
export function decryptApiKey(encryptedText: string): string {
  if (!encryptedText) return '';
  // If not formatted as iv:ciphertext, assume it is plain (legacy/unencrypted)
  if (!encryptedText.includes(':')) {
    return encryptedText;
  }
  try {
    const [ivHex, ciphertext] = encryptedText.split(':');
    if (!ivHex || !ciphertext) return encryptedText;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Encryption] Failed to decrypt API key:', err);
    return encryptedText;
  }
}

/**
 * Mask API key for secure presentation in Admin UI (e.g. "abc1...9xyz")
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  const plain = decryptApiKey(key);
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}••••••••${plain.slice(-4)}`;
}
