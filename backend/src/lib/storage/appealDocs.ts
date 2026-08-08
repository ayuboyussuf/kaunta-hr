/**
 * Documents attached to an appeal — in practice, photographs of clinic notes.
 *
 * These are the most sensitive objects Aproksi holds. A selfie proves who
 * scanned; a medical note can reveal a diagnosis, a pregnancy, a condition
 * somebody has told no one at work. So the rules are stricter than for selfies:
 *
 *   - Private bucket, no public URL, ever.
 *   - Signed links are 120 seconds, not five minutes. The owner is looking at
 *     it while deciding; nobody needs a link that outlives that.
 *   - Nothing about the CONTENT is copied anywhere. No extracted text, no
 *     diagnosis, nothing in a finding, a summary or a log. The brief says "a
 *     document was provided" and the owner opens it themselves.
 *
 * Create the private `appeal-docs` bucket once in the Supabase dashboard.
 */
import { getServiceClient } from "../supabase";

/** A data URL ("data:image/jpeg;base64,…") or a bare base64 string → Buffer. */
function decodeImage(input: string): Buffer {
  const comma = input.indexOf(",");
  const b64 = input.startsWith("data:") && comma !== -1 ? input.slice(comma + 1) : input;
  return Buffer.from(b64, "base64");
}

/** Upload an appeal document. Returns the object path, never a URL. */
export async function uploadAppealDocument(
  employeeId: string,
  appealId: string,
  imageBase64: string
): Promise<string> {
  const db = getServiceClient();
  const path = `${employeeId}/${appealId}.jpg`;
  const { error } = await db.storage.from("appeal-docs").upload(path, decodeImage(imageBase64), {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`[appeal-doc] upload failed: ${error.message}`);
  return path;
}

/** Sign a stored document for viewing. Short by design — see the header. */
export async function signAppealDocument(path: string, ttlSec = 120): Promise<string | null> {
  const db = getServiceClient();
  const { data, error } = await db.storage.from("appeal-docs").createSignedUrl(path, ttlSec);
  if (error || !data) return null;
  return data.signedUrl;
}
