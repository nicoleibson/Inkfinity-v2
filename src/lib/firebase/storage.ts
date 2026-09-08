// src/lib/firebase/storage.ts
// Local storage adapter: stores images in the project's public/uploads folder
// and serves them statically via Next.js. This temporarily replaces Firebase Storage.

/**
 * Uploads a Data URI to the local server's public/uploads directory.
 * @param path The relative path where the file should be stored.
 * @param dataUri The Data URI of the file to upload.
 * @returns A promise that resolves with the public URL of the file.
 */
export const uploadDataUri = async (path: string, dataUri: string): Promise<string> => {
  try {
    const response = await fetch("/api/storage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, dataUri }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || "Failed to upload file.");
    }

    const data = await response.json();
    return data.url as string;
  } catch (error) {
    console.error(`Upload failed for path: ${path}`, error);
    throw new Error("Failed to upload file and get download URL.");
  }
};

/**
 * Deletes a file from the local server's public/uploads directory.
 * @param path The full relative path to the file (relative to /uploads).
 * @returns A promise that resolves when the file is deleted.
 */
export const deleteFromStorage = async (path: string): Promise<void> => {
  if (!path) return; // Do nothing if the path is empty
  try {
    await fetch("/api/storage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
  } catch (error) {
    console.error(`Failed to delete file at path: ${path}`, error);
  }
}