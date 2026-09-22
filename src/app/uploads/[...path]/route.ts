import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

// 1x1 transparent PNG fallback (70 bytes)
const FALLBACK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

// 1x1 neutral JPEG fallback (134 bytes)
const FALLBACK_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
);

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

const sanitizePath = (parts: string[]): string | null => {
  const safeParts = parts.filter(
    (part) => part !== "" && part !== "." && part !== ".." && !part.includes("\\")
  );
  if (safeParts.length === 0) return null;
  const relativePath = safeParts.join(path.sep);
  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  if (!absolutePath.startsWith(UPLOADS_DIR + path.sep) && absolutePath !== UPLOADS_DIR) {
    return null;
  }
  return relativePath;
};

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ path?: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const pathSegments = resolvedParams?.path || [];
    const safeRelativePath = sanitizePath(pathSegments);

    if (!safeRelativePath) {
      return new NextResponse(FALLBACK_JPEG, {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    const absolutePath = path.join(UPLOADS_DIR, safeRelativePath);
    const ext = path.extname(safeRelativePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "image/jpeg";

    try {
      await stat(absolutePath);
      const fileBuffer = await readFile(absolutePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // File not found on disk: return valid fallback image so Next.js image optimization doesn't crash
      const fallbackBuffer = ext === ".png" ? FALLBACK_PNG : FALLBACK_JPEG;
      const fallbackMime = ext === ".png" ? "image/png" : "image/jpeg";

      return new NextResponse(fallbackBuffer, {
        status: 200,
        headers: {
          "Content-Type": fallbackMime,
          "Cache-Control": "public, max-age=3600",
          "X-Fallback-Image": "true",
        },
      });
    }
  } catch (error) {
    console.error("[Uploads Route Error]:", error);
    return new NextResponse(FALLBACK_JPEG, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-cache",
      },
    });
  }
}
