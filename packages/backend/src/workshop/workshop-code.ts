import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 8;

export function normalizeWorkshopCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function generateWorkshopCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function displayWorkshopCode(code: string): string {
  const normalized = normalizeWorkshopCode(code);
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}
