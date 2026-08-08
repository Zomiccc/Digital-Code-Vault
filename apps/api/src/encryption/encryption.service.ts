import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    const keyHex = this.configService.get<string>('ENCRYPTION_KEY');
    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    this.key = Buffer.from(keyHex, 'hex');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
    }
  }

  /**
   * Encrypts a plaintext code using AES-256-GCM.
   * Returns a string in format: iv:authTag:ciphertext (all hex encoded)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts an AES-256-GCM encrypted string.
   * Input format: iv:authTag:ciphertext (all hex encoded)
   */
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /**
   * Hashes a code for deduplication checking (SHA-256).
   * This does NOT allow recovery of the plaintext.
   */
  hashCode(plaintext: string): string {
    return crypto.createHash('sha256').update(plaintext).digest('hex');
  }

  /**
   * Masks a code for dashboard display — shows only last 4 characters.
   */
  maskCode(plaintext: string): string {
    if (plaintext.length <= 4) return '****';
    return '*'.repeat(plaintext.length - 4) + plaintext.slice(-4);
  }

  /**
   * Generates a cryptographically secure random token.
   */
  generateToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Hashes a token for storage (for delivery tokens, etc.)
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * HMAC-SHA256 for API request signing.
   */
  hmacSha256(secret: string, data: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Constant-time comparison to prevent timing attacks.
   */
  safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
