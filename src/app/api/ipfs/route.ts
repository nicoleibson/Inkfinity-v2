// src/app/api/ipfs/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bs58 from "bs58";
import { getAdminStorage, getArtworkBucketName, getPublicStorageUrl } from "@/lib/firebase-admin";

export const runtime = 'nodejs';
// Firebase Admin / Cloud Storage round-trips can exceed Vercel's default 10s
// function limit, which surfaces as a 504 Gateway Timeout.
export const maxDuration = 60;


// In-memory cache of recently processed assets for fast local serving.
// It is a cache, NOT the source of truth: durability comes from Cloud Storage.
const ipfsStore = new Map<string, { buffer: Buffer; mimeType: string; fileName: string }>();

const ARTWORK_FOLDER = "inkfinity/artworks";
const METADATA_FOLDER = "inkfinity/nft-metadata";

function computeCIDv0(buffer: Buffer): string {
  const hash = crypto.createHash("sha256").update(buffer).digest();
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), hash]);
  const encodeFn = (bs58 as any).default?.encode || bs58.encode;
  return encodeFn(multihash);
}

/** Stores an object in the project's Cloud Storage bucket. */
async function persistToCloudStorage(
  objectPath: string,
  content: Buffer,
  contentType: string,
  customMetadata: Record<string, string>
): Promise<void> {
  const bucketName = getArtworkBucketName();
  if (!bucketName) {
    throw new Error("No storage bucket configured.");
  }
  const bucket = getAdminStorage().bucket(bucketName);
  await bucket.file(objectPath).save(content, {
    contentType,
    resumable: false,
    gzip: false,
    metadata: { metadata: customMetadata },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { dataUri, fileName, title, description, artistName, tags, contractAddress, tokenId } = await req.json();

    if (!dataUri) {
      return NextResponse.json({ error: "Missing dataUri" }, { status: 400 });
    }

    const mimeMatch = dataUri.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const base64Data = dataUri.replace(/^data:[^;]+;base64,/, "");
    const fileBuffer = Buffer.from(base64Data, "base64");

    const finalFileName = fileName || `inkfinity_${crypto.createHash("sha256").update(fileBuffer).digest("hex").slice(0, 16)}.jpg`;

    // Authoritative CID, computed from the exact bytes of the artwork.
    const imageCid = computeCIDv0(fileBuffer);

    // Standard ERC-721 / ERC-1155 NFT Metadata.
    const nftMetadata: Record<string, unknown> = {
      name: title || "Inkfinity Digital Art NFT",
      description: description || "Authentic digital tattoo and art NFT on Inkfinity",
      image: `ipfs://${imageCid}`,
      external_url: (process.env.NEXT_PUBLIC_SITE_URL as string) || "https://inkfinity-ten.vercel.app",
      attributes: [
        { trait_type: "Artist", value: artistName || "Inkfinity Creator" },
        ...(tags && Array.isArray(tags) ? [{ trait_type: "Tags", value: tags.join(", ") }] : []),
        ...(contractAddress ? [{ trait_type: "Contract", value: contractAddress }] : []),
        ...(tokenId ? [{ trait_type: "Token ID", value: tokenId }] : []),
        { trait_type: "Storage", value: "Google Cloud Storage (IPFS-compatible CID)" },
      ],
    };
    const metadataBuffer = Buffer.from(JSON.stringify(nftMetadata, null, 2), "utf-8");
    const metadataCid = computeCIDv0(metadataBuffer);

    const artistPath = `${ARTWORK_FOLDER}/${imageCid}`;
    const metadataPath = `${METADATA_FOLDER}/${metadataCid}.json`;

    // Always seed the in-process cache for fast local serving.
    ipfsStore.set(imageCid, { buffer: fileBuffer, mimeType, fileName: finalFileName });
    ipfsStore.set(metadataCid, {
      buffer: metadataBuffer,
      mimeType: "application/json",
      fileName: "metadata.json",
    });

    // Primary path: persist durably in Cloud Storage so the artwork survives
    // server restarts (this is the replace for the old Pinata dependency).
    let storedDurably = false;
    let storageUrl: string | null = null;
    try {
      await persistToCloudStorage(
        artistPath,
        fileBuffer,
        mimeType,
        { platform: "Inkfinity", type: "NFT", contractAddress: contractAddress || "" }
      );
      await persistToCloudStorage(
        metadataPath,
        metadataBuffer,
        "application/json",
        { platform: "Inkfinity", type: "NFT-metadata", contractAddress: contractAddress || "" }
      );
      storedDurably = true;
      storageUrl = getPublicStorageUrl(getArtworkBucketName()!, artistPath);
      console.log(`[IPFS] Persisted to Cloud Storage: ${artistPath}`);
    } catch (storageErr) {
      console.warn("[IPFS] Cloud Storage unavailable, falling back to in-memory cache:", storageErr);
    }

    const ipfsUri = `ipfs://${imageCid}`;
    // When durable, prefer the Cloud Storage URL (public via storage.rules);
    // otherwise fall back to the app's own proxy so the image can still render.
    const gatewayUrl = storedDurably && storageUrl ? storageUrl : `/api/ipfs?cid=${imageCid}`;
    const fallbackGatewayUrl = `https://ipfs.io/ipfs/${imageCid}`;
    const localProxyUrl = `/api/ipfs?cid=${imageCid}`;

    return NextResponse.json({
      success: true,
      cid: imageCid,
      ipfsUri,
      gatewayUrl,
      fallbackGatewayUrl,
      localProxyUrl,
      storedDurably,
      metadataCid,
      metadataIpfsUri: `ipfs://${metadataCid}`,
      metadata: nftMetadata,
    });
  } catch (error: any) {
    console.error("IPFS Route error:", error);
    return NextResponse.json({ error: error.message || "Failed to process IPFS upload" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");

  if (!cid) {
    return new NextResponse("Missing cid parameter", { status: 400 });
  }

  const asset = ipfsStore.get(cid);
  if (asset) {
    return new NextResponse(asset.buffer as any, {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Cache miss: try to resolve from Cloud Storage (durable copy).
  const bucketName = getArtworkBucketName();
  if (bucketName) {
    return NextResponse.redirect(
      getPublicStorageUrl(bucketName, `${ARTWORK_FOLDER}/${cid}`)
    );
  }

  return NextResponse.redirect(`https://ipfs.io/ipfs/${cid}`);
}