import AWS from 'aws-sdk';

const REGION = process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.AWS_S3_BUCKET || '';

// Credentials come from the App Runner instance role via the default chain.
const s3 = new AWS.S3({ region: REGION, signatureVersion: 'v4' });

export function isS3Configured(): boolean {
  return !!BUCKET;
}

/** Upload a buffer and return its object key. */
export async function uploadBuffer(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (!BUCKET) throw new Error('S3 bucket not configured');
  await s3
    .putObject({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType })
    .promise();
  return key;
}

/** Short-lived presigned GET URL for private playback/download. */
export function signedGetUrl(key: string, expiresSeconds = 3600): string | null {
  if (!BUCKET || !key) return null;
  return s3.getSignedUrl('getObject', { Bucket: BUCKET, Key: key, Expires: expiresSeconds });
}

/** Map a stored evidence value to a playable URL (presign keys; pass through URLs/data). */
export function resolveEvidenceUrl(value: string): string {
  if (!value) return value;
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  return signedGetUrl(value) || value;
}
