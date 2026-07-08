/**
 * lib/crypto.ts
 *
 * App-level encryption for stored credentials (Ring 2: Google OAuth
 * tokens). Copied from Trellis lib/monarch/crypto.ts with the secret
 * renamed. AES-256-GCM (authenticated encryption) keyed off
 * KEYSTONE_TOKEN_SECRET, on top of the database's at-rest protection
 * and the deny-all RLS on the token table. The key never leaves the
 * server; the ciphertext is the only thing in the table.
 *
 * Fail closed: if KEYSTONE_TOKEN_SECRET is not set, encrypt/decrypt
 * throw. The connect route surfaces that as a clear configuration error
 * rather than silently storing a plaintext token. No plaintext fallback.
 *
 * Format: `kge1:<ivB64>:<tagB64>:<ctB64>` (versioned so the scheme can
 * change later without ambiguity). Node's built-in crypto, no new
 * dependency. SERVER-ONLY.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const VERSION = 'kge1'
const IV_BYTES = 12 // GCM standard nonce length

function key(): Buffer {
  const secret = process.env.KEYSTONE_TOKEN_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'KEYSTONE_TOKEN_SECRET is not set (or too short). Set a strong secret before connecting Google.'
    )
  }
  // Derive a stable 32-byte key from the configured secret.
  return createHash('sha256').update(secret, 'utf8').digest()
}

/** Encrypt a token string into a versioned, self-describing blob. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** Decrypt a blob produced by encryptToken. Throws on tamper or bad key. */
export function decryptToken(blob: string): string {
  const parts = blob.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed token blob')
  }
  const [, ivB64, tagB64, ctB64] = parts
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()])
  return pt.toString('utf8')
}

/** Whether token encryption is configured. Routes use this to fail fast. */
export function isTokenCryptoConfigured(): boolean {
  const secret = process.env.KEYSTONE_TOKEN_SECRET
  return !!secret && secret.length >= 16
}
