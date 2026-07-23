/**
 * Signed workplace QR tokens. The static QR printed at a location encodes a
 * signed token (never raw ids), valid ~3 months. The token embeds the workplace
 * id and the workplace's current qr_nonce so an owner can invalidate old prints
 * by rotating the nonce.
 */
import jwt from "jsonwebtoken";
import { env } from "./env";

const QR_TTL = "100d"; // ~3 months

export interface QrPayload {
  wid: string; // workplace id
  nonce: string; // workplaces.qr_nonce at issue time
}

export function signWorkplaceToken(workplaceId: string, nonce: string): string {
  return jwt.sign({ wid: workplaceId, nonce }, env.qrTokenSecret(), { expiresIn: QR_TTL });
}

export function verifyWorkplaceToken(token: string): QrPayload | null {
  try {
    const decoded = jwt.verify(token, env.qrTokenSecret()) as QrPayload;
    if (!decoded.wid || !decoded.nonce) return null;
    return decoded;
  } catch {
    return null;
  }
}
