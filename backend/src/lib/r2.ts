import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ENDPOINT   = process.env.R2_ENDPOINT   || "";
const R2_BUCKET     = process.env.R2_BUCKET     || "";
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID     || "";
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || "";

/**
 * Returns null when R2 is not configured — callers must handle this
 * so the app still boots without R2 credentials.
 */
export function getR2Client(): S3Client | null {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY || !R2_SECRET_KEY) return null;
  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId:     R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET_KEY,
    },
  });
}

export const r2Bucket = R2_BUCKET;

/**
 * Generate a presigned PUT URL (for direct client → R2 uploads).
 * Expires in 5 minutes.
 */
export async function getPresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 300
): Promise<string | null> {
  const client = getR2Client();
  if (!client || !r2Bucket) return null;

  const cmd = new PutObjectCommand({
    Bucket: r2Bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

/**
 * Generate a presigned GET URL (for temporary secure download).
 * Expires in 1 hour.
 */
export async function getPresignedGetUrl(
  key: string,
  expiresIn = 3600
): Promise<string | null> {
  const client = getR2Client();
  if (!client || !r2Bucket) return null;

  const cmd = new GetObjectCommand({ Bucket: r2Bucket, Key: key });
  return getSignedUrl(client, cmd, { expiresIn });
}

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(key: string): Promise<void> {
  const client = getR2Client();
  if (!client || !r2Bucket) return;

  await client.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }));
}

export const r2Configured = (): boolean =>
  Boolean(R2_ENDPOINT && R2_ACCESS_KEY && R2_SECRET_KEY && R2_BUCKET);
