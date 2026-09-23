// src/lib/firebase-admin.ts
// Server-side Firebase Admin initialization for Cloud Storage.
//
// Credential resolution:
//  1. If FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY are set (e.g. local dev),
//     a service account key is used.
//  2. Otherwise it relies on Application Default Credentials, which Firebase
//     App Hosting provides automatically through the project's service account.
import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

export function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (clientEmail && privateKey && projectId) {
    return initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  return initializeApp({ projectId });
}

export function getAdminStorage() {
  return getStorage(getAdminApp());
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