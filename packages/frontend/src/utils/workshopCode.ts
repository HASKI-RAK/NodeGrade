/**
 * Workshop codes are shared out loud and off paper, so what a participant types rarely
 * matches what was stored byte for byte. Normalising on the client mirrors the backend's
 * `normalizeWorkshopCode` and keeps the deep link in the address bar canonical.
 */
export const normalizeWorkshopCode = (code: string): string =>
  code.toUpperCase().replace(/[^0-9A-Z]/g, '')

/** The grouped form used in print and on screen: `ABCD-EFGH`. */
export const displayWorkshopCode = (code: string): string => {
  const normalized = normalizeWorkshopCode(code)
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized
}
