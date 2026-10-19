// src/app/api/storage/route.ts
// Local storage adapter: writes images into the project's public/uploads folder
// so Next.js can serve them statically for all users. Temporarily replaces Firebase Storage.
export const runtime = 'nodejs';
// Firebase Admin / Cloud Storage round-trips can exceed Vercel's default 10s
// function limit, which surfaces as a 504 Gateway Timeout.
export const maxDuration = 60;


import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");

const sanitizePath = (rawPath: string): string => {
  const normalized = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(part => part !== "" && part !== "." && part !== "..");
  const relativePath = parts.join("/");
  const absolutePath = path.join(UPLOADS_DIR, relativePath);
  if (absolutePath !== UPLOADS_DIR && !absolutePath.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error("Invalid path");
  }
  return relativePath;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const filePath = body?.path;
    const dataUri = body?.dataUri;

    if (!filePath || typeof dataUri !== "string" || !dataUri) {
      return NextResponse.json({ error: "Missing path or dataUri" }, { status: 400 });
    }

    const match = dataUri.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) {
      return NextResponse.json({ error: "Invalid data URI" }, { status: 400 });
    }

    const buffer = Buffer.from(match[2], "base64");
    const safePath = sanitizePath(filePath);
    const absolutePath = path.join(UPLOADS_DIR, safePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    return NextResponse.json({ url: `/uploads/${safePath}` });
  } catch (error) {
    console.error("Storage POST error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const filePath = body?.path;

    if (!filePath) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const safePath = sanitizePath(filePath);
    const absolutePath = path.join(UPLOADS_DIR, safePath);

    try {
      await stat(absolutePath);
    } catch {
      return NextResponse.json({ ok: true });
    }

    await unlink(absolutePath);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Storage DELETE error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}