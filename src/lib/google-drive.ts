// src/lib/google-drive.ts
import { GoogleAuthProvider, signInWithPopup, getAuth } from 'firebase/auth';
import { getApps, initializeApp, getApp } from 'firebase/app';
import { auth } from './firebase-config';
import { deleteFromStorage } from './firebase/storage';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

/**
 * Gets a secondary isolated Firebase Auth instance so Drive OAuth consent popup
 * does not alter or disrupt the user's active session in the primary Inkfinity auth.
 */
const getSecondaryAuth = () => {
  const SECONDARY_APP_NAME = 'inkfinity-gdrive-oauth';
  let secondaryApp = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  if (!secondaryApp) {
    const primaryApp = getApp();
    secondaryApp = initializeApp(primaryApp.options, SECONDARY_APP_NAME);
  }
  return getAuth(secondaryApp);
};

export const setDriveAccessToken = (userEmail: string, token: string | null, expiresInSeconds: number = 3500) => {
  if (typeof window === 'undefined' || !userEmail) return;
  const normalizedEmail = userEmail.trim().toLowerCase();
  if (token) {
    const payload = {
      email: normalizedEmail,
      token,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
    sessionStorage.setItem(`inkfinity_gdrive_auth_${normalizedEmail}`, JSON.stringify(payload));
  } else {
    sessionStorage.removeItem(`inkfinity_gdrive_auth_${normalizedEmail}`);
  }
  // Clear legacy global token to prevent shared cross-user uploads
  sessionStorage.removeItem('inkfinity_gdrive_token');
};

export const getCachedDriveAccessToken = (userEmail?: string | null): string | null => {
  if (typeof window === 'undefined') return null;
  const emailToLookup = userEmail || auth.currentUser?.email;
  if (!emailToLookup) return null;

  const normalizedEmail = emailToLookup.trim().toLowerCase();
  const raw = sessionStorage.getItem(`inkfinity_gdrive_auth_${normalizedEmail}`);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.email === normalizedEmail && parsed.token) {
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        sessionStorage.removeItem(`inkfinity_gdrive_auth_${normalizedEmail}`);
        return null;
      }
      return parsed.token;
    }
  } catch {
    return null;
  }
  return null;
};

export const clearDriveAccessToken = (userEmail?: string | null) => {
  if (typeof window === 'undefined') return;
  const emailToClear = userEmail || auth.currentUser?.email;
  if (emailToClear) {
    sessionStorage.removeItem(`inkfinity_gdrive_auth_${emailToClear.trim().toLowerCase()}`);
  }
  sessionStorage.removeItem('inkfinity_gdrive_token');
};

/**
 * Requests Google OAuth consent with Google Drive scope specifically for the user's
 * registered Inkfinity email address. Rejects if the selected Google account doesn't match.
 */
export const authorizeGoogleDrive = async (registeredEmail?: string | null): Promise<string> => {
  const expectedEmail = (registeredEmail || auth.currentUser?.email)?.trim().toLowerCase();
  if (!expectedEmail) {
    throw new Error('Debes contar con un correo registrado en Inkfinity para conectar Google Drive.');
  }

  // Check valid user-specific cached token
  const cached = getCachedDriveAccessToken(expectedEmail);
  if (cached) return cached;

  const secondaryAuth = getSecondaryAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_DRIVE_SCOPE);
  provider.setCustomParameters({
    prompt: 'select_account',
    login_hint: expectedEmail,
  });

  const result = await signInWithPopup(secondaryAuth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const selectedGoogleEmail = result.user?.email?.trim().toLowerCase();

  // Sign out secondary auth instance immediately to avoid stale state
  await secondaryAuth.signOut().catch(() => {});

  if (!credential?.accessToken) {
    throw new Error('No se pudo obtener el token de acceso para Google Drive.');
  }

  // CRITICAL VALIDATION: Verify the authenticated Google email matches the registered account
  if (!selectedGoogleEmail || selectedGoogleEmail !== expectedEmail) {
    clearDriveAccessToken(expectedEmail);
    throw new Error(
      `La cuenta de Google seleccionada (${selectedGoogleEmail || 'desconocida'}) no coincide con el correo registrado de tu cuenta de Inkfinity (${expectedEmail}). Cada usuario debe subir sus archivos a su propio Google Drive usando su correo registrado.`
    );
  }

  // Double check drive user endpoint to ensure token belongs to expected email
  try {
    const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: `Bearer ${credential.accessToken}` },
    });
    if (aboutRes.ok) {
      const aboutData = await aboutRes.json();
      const driveEmail = aboutData.user?.emailAddress?.trim().toLowerCase();
      if (driveEmail && driveEmail !== expectedEmail) {
        clearDriveAccessToken(expectedEmail);
        throw new Error(
          `La cuenta de Google Drive (${driveEmail}) no coincide con el correo registrado de tu cuenta de Inkfinity (${expectedEmail}).`
        );
      }
    }
  } catch (verifyErr: any) {
    if (verifyErr.message?.includes('no coincide')) throw verifyErr;
    console.warn('Could not verify drive email via about endpoint:', verifyErr);
  }

  setDriveAccessToken(expectedEmail, credential.accessToken);
  return credential.accessToken;
};

/**
 * Finds or creates a public "Inkfinity Artworks" folder in the user's Google Drive.
 */
export const getOrCreateInkfinityFolder = async (accessToken: string): Promise<string> => {
  const q = encodeURIComponent("name = 'Inkfinity Artworks' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Inkfinity Artworks',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Carpeta pública de obras y archivos de perfil de Inkfinity',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'No se pudo crear la carpeta en Google Drive.');
  }

  const folderData = await createRes.json();

  // Make folder publicly accessible (anyone with link can view)
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${folderData.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  } catch (e) {
    console.warn('Could not set permissions on folder:', e);
  }

  return folderData.id;
};

/**
 * Uploads a file (Data URI) to the user's "Inkfinity Artworks" folder in Google Drive.
 * Returns the permanent public CDN URL, fileId and the target folderId.
 */
export const uploadFileToGoogleDrive = async (
  accessToken: string,
  fileName: string,
  dataUri: string,
  folderId?: string,
  description: string = 'Subido a través de Inkfinity'
): Promise<{ fileId: string; imageUrl: string; webViewLink?: string; folderId: string }> => {
  const mimeMatch = dataUri.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const base64Data = dataUri.replace(/^data:[^;]+;base64,/, '');

  let targetFolderId = folderId;
  if (!targetFolderId) {
    targetFolderId = await getOrCreateInkfinityFolder(accessToken);
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const safeFileName = fileName.endsWith('.jpg') || fileName.endsWith('.png') || fileName.endsWith('.webp')
    ? fileName
    : `${fileName}.jpg`;

  const metadata = {
    name: safeFileName,
    mimeType: mimeType,
    parents: [targetFolderId],
    description,
  };

  const multipartRequestBody = [
    delimiter,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    delimiter,
    `Content-Type: ${mimeType}\r\n`,
    'Content-Transfer-Encoding: base64\r\n\r\n',
    base64Data,
    closeDelimiter,
  ].join('');

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Error al subir la imagen a Google Drive.');
  }

  const file = await uploadRes.json();
  const fileId = file.id;

  // Set file permissions to public read
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  } catch (permErr) {
    console.warn('Could not set permissions on file:', permErr);
  }

  // Google UserContent CDN link directly serves the image publicly
  const imageUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

  return {
    fileId,
    imageUrl,
    webViewLink: file.webViewLink,
    folderId: targetFolderId,
  };
};

/**
 * Uploads an artwork image (Data URI) to Google Drive.
 */
export const uploadArtworkToGoogleDrive = async (
  accessToken: string,
  fileName: string,
  dataUri: string,
  folderId?: string
): Promise<{ fileId: string; imageUrl: string; webViewLink?: string; folderId: string }> => {
  return uploadFileToGoogleDrive(accessToken, fileName, dataUri, folderId, 'Obra de arte subida a través de Inkfinity');
};

/**
 * Uploads a user profile image (avatar or background cover) to the user's Google Drive folder.
 */
export const uploadProfileImageToGoogleDrive = async (
  accessToken: string,
  userId: string,
  type: 'avatar' | 'background',
  dataUri: string,
  folderId?: string
): Promise<{ fileId: string; imageUrl: string; webViewLink?: string; folderId: string }> => {
  const mimeMatch = dataUri.match(/^data:image\/([a-zA-Z0-9+]+);base64,/);
  const ext = mimeMatch && mimeMatch[1] === 'png' ? 'png' : 'jpg';
  const fileName = `${type}_${userId}_${Date.now()}.${ext}`;
  const description = type === 'avatar'
    ? 'Foto de perfil de Inkfinity'
    : 'Imagen de portada de perfil de Inkfinity';

  return uploadFileToGoogleDrive(accessToken, fileName, dataUri, folderId, description);
};

export const getDriveFolderUrl = (folderId: string): string =>
  `https://drive.google.com/drive/folders/${folderId}`;

/**
 * Extracts a Google Drive file ID from a URL (lh3 CDN link, gdrive://, direct id).
 */
export const extractDriveFileId = (urlOrId?: string | null): string | null => {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  if (!str.includes('/') && !str.includes(':') && str.length >= 15 && !str.includes('.')) {
    return str;
  }
  const lh3Match = str.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (lh3Match) return lh3Match[1];
  const gdriveMatch = str.match(/^gdrive:\/\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch) return gdriveMatch[1];
  const ucMatch = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];
  return null;
};

/**
 * Deletes a file from Google Drive using the provided user OAuth access token.
 */
export const deleteFileFromGoogleDrive = async (accessToken: string, fileId: string): Promise<boolean> => {
  if (!accessToken || !fileId) return false;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    // 204 No Content, 200 OK, or 404 Not Found (already deleted)
    return res.ok || res.status === 404;
  } catch (err) {
    console.warn(`Could not delete file ${fileId} from Google Drive:`, err);
    return false;
  }
};

/**
 * Robust helper to clean up old avatar or background images from both Google Drive
 * and local server storage (/uploads/...) to avoid accumulating orphan files,
 * stale cache, and routing/image load conflicts.
 */
export const deleteOldUserMedia = async (options: {
  oldUrl?: string | null;
  oldDriveFileId?: string | null;
  accessToken?: string | null;
}): Promise<void> => {
  const { oldUrl, oldDriveFileId, accessToken } = options;

  // 1. If the previous image was in Google Drive and we have a valid token
  const driveFileId = oldDriveFileId || extractDriveFileId(oldUrl);
  if (driveFileId && accessToken) {
    try {
      await deleteFileFromGoogleDrive(accessToken, driveFileId);
    } catch (driveErr) {
      console.warn(`[Media Cleanup] Error deleting old Drive file ${driveFileId}:`, driveErr);
    }
  }

  // 2. If the previous image was stored in local /uploads/...
  if (oldUrl && typeof oldUrl === 'string' && oldUrl.startsWith('/uploads/')) {
    try {
      // Remove /uploads/ prefix and any URL query string
      const relativePath = oldUrl.split('?')[0].replace(/^\/uploads\//, '');
      if (relativePath) {
        await deleteFromStorage(relativePath);
      }
    } catch (localErr) {
      console.warn(`[Media Cleanup] Error deleting old local file ${oldUrl}:`, localErr);
    }
  }
};


