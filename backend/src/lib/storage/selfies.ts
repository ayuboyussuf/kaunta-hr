/**
 * Selfie storage — attendance clock-in/out photos for owner review.
 *
 * Photos land in the PRIVATE `selfies` Supabase Storage bucket (create it once
 * in the dashboard). They are never public: the owner dashboard fetches a
 * short-lived signed URL per view. Same service-client pattern as pdf/render.ts.
 */
import { getServiceClient } from "../supabase";

/** A data URL ("data:image/jpeg;base64,…") or a bare base64 string → Buffer. */
function decodeImage(input: string): Buffer {
  const comma = input.indexOf(",");
  const b64 = input.startsWith("data:") && comma !== -1 ? input.slice(comma + 1) : input;
  return Buffer.from(b64, "base64");
}

/**
 * Upload a clock-in/out selfie. Returns the object path stored on the
 * attendance entry (never a URL — those are signed on demand).
 * Best-effort: throws on failure so the caller can decide (we log & continue).
 */
export async function uploadSelfie(
  employeeId: string,
  entryId: string,
  imageBase64: string
): Promise<string> {
  const db = getServiceClient();
  const path = `${employeeId}/${entryId}.jpg`;
  const { error } = await db.storage.from("selfies").upload(path, decodeImage(imageBase64), {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`[selfie] upload failed: ${error.message}`);
  return path;
}

/** Sign a stored selfie path for viewing (default 5 min). */
export async function signSelfie(path: string, ttlSec = 300): Promise<string | null> {
  const db = getServiceClient();
  const { data, error } = await db.storage.from("selfies").createSignedUrl(path, ttlSec);
  if (error || !data) return null;
  return data.signedUrl;
}
