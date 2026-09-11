// src/lib/google-drive.ts
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase-config';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let cachedDriveAccessToken: string | null = null;

export const setDriveAccessToken = (token: string | null) => {
  cachedDriveAccessToken = token;
};

export const getCachedDriveAccessToken = () => cachedDriveAccessToken;

/**
 * Requests Google OAuth consent with Google Drive scope and returns access token.
 */
export const authorizeGoogleDrive = async (): Promise<string> => {
  if (cachedDriveAccessToken) return cachedDriveAccessToken;

  const provider = new GoogleAuthProvider();
  provider.addScope(GOOGLE_DRIVE_SCOPE);
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  
  if (!credential?.accessToken) {
    throw new Error('No se pudo obtener el token de acceso para Google Drive.');
  }

  cachedDriveAccessToken = credential.accessToken;
  return cachedDriveAccessToken;
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
      description: 'Carpeta pública de obras de Inkfinity',
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
 * Uploads an image (Data URI) to the user's "Inkfinity Artworks" folder in Google Drive.
 * Returns the permanent public CDN URL and Google Drive fileId.
 */
export const uploadArtworkToGoogleDrive = async (
  accessToken: string,
  fileName: string,
  dataUri: string,
  folderId?: string
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

  const safeFileName = fileName.endsWith('.jpg') || fileName.endsWith('.png') ? fileName : `${fileName}.jpg`;

  const metadata = {
    name: safeFileName,
    mimeType: mimeType,
    parents: [targetFolderId],
    description: 'Subido a través de Inkfinity',
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
