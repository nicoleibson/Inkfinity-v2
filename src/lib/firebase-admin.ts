// src/lib/firebase-admin.ts
// Server-side Firebase Admin initialization.
// REQUIRES explicit credentials: FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
// Application Default Credentials (ADC) are NOT supported in Vercel build environment.
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

function parsePrivateKey(key: string): string {
  // Handle both escaped (\n) and literal newlines
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key;
}

export function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials missing. ' +
      'Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY environment variables. ' +
      'ADC is not supported in Vercel build environment.'
    );
  }

  if (!projectId) {
    throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable is required.');
  }

  return initializeApp({
    projectId,
    credential: cert({
      projectId,
      clientEmail,
      privateKey: parsePrivateKey(privateKey),
    }),
  });
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getDatabase(getAdminApp());
}

/**
 * Resolves the Cloud Storage bucket name used for artwork persistence.
 * Falls back to the Firebase web config, which already points at the
 * project's default bucket.
 */
export function getArtworkBucketName(): string | null {
  return (
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    null
  );
}

/**
 * Builds a public, unauthenticated download URL for an object in the project
 * bucket. Requires the Firebase Storage rules (see storage.rules) to allow
 * public reads on the inkfinity/ paths.
 */
export function getPublicStorageUrl(bucketName: string, objectPath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(
    objectPath
  )}?alt=media`;
}