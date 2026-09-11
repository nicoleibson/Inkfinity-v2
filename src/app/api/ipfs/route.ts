// src/app/api/ipfs/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bs58 from "bs58";

// In-memory / process-level IPFS asset store for instant gateway fallback
const ipfsStore = new Map<string, { buffer: Buffer; mimeType: string; fileName: string }>();

function computeCIDv0(buffer: Buffer): string {
  const hash = crypto.createHash("sha256").update(buffer).digest();
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), hash]);
  const encodeFn = (bs58 as any).default?.encode || bs58.encode;
  return encodeFn(multihash);
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

    // 1. Compute standard IPFS CIDv0
    const imageCid = computeCIDv0(fileBuffer);
    const ipfsUri = `ipfs://${imageCid}`;
    
    // Store in local IPFS cache
    ipfsStore.set(imageCid, { buffer: fileBuffer, mimeType, fileName: fileName || `${imageCid}.jpg` });

    // 2. Try external pinning service if configured (e.g. Pinata)
    const pinataJwt = process.env.PINATA_JWT;
    const pinataApiKey = process.env.PINATA_API_KEY;
    const pinataSecretApiKey = process.env.PINATA_SECRET_API_KEY;

    let pinnedExternally = false;

    if (pinataJwt || (pinataApiKey && pinataSecretApiKey)) {
      try {
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: mimeType });
        formData.append("file", blob, fileName || `inkfinity_${imageCid}.jpg`);
        formData.append("pinataMetadata", JSON.stringify({
          name: title || `Inkfinity NFT #${tokenId || imageCid.slice(0, 8)}`,
          keyvalues: { platform: "Inkfinity", type: "NFT", contractAddress: contractAddress || "" }
        }));

        const headers: Record<string, string> = {};
        if (pinataJwt) {
          headers["Authorization"] = `Bearer ${pinataJwt}`;
        } else {
          headers["pinata_api_key"] = pinataApiKey!;
          headers["pinata_secret_api_key"] = pinataSecretApiKey!;
        }

        const pinRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
          method: "POST",
          headers,
          body: formData,
        });

        if (pinRes.ok) {
          pinnedExternally = true;
        }
      } catch (pinErr) {
        console.warn("Pinata upload notice:", pinErr);
      }
    }

    // 3. Generate standard ERC-721 / ERC-1155 NFT Metadata
    const nftMetadata = {
      name: title || "Inkfinity Digital Art NFT",
      description: description || "Authentic digital tattoo and art NFT on Inkfinity",
      image: ipfsUri,
      external_url: `https://inkfinity.site`,
      attributes: [
        { trait_type: "Artist", value: artistName || "Inkfinity Creator" },
        ...(tags && Array.isArray(tags) ? [{ trait_type: "Tags", value: tags.join(", ") }] : []),
        ...(contractAddress ? [{ trait_type: "Contract", value: contractAddress }] : []),
        ...(tokenId ? [{ trait_type: "Token ID", value: tokenId }] : []),
        { trait_type: "Storage", value: "IPFS / Decentralized" },
      ]
    };

    const metadataBuffer = Buffer.from(JSON.stringify(nftMetadata, null, 2), "utf-8");
    const metadataCid = computeCIDv0(metadataBuffer);
    const metadataIpfsUri = `ipfs://${metadataCid}`;
    ipfsStore.set(metadataCid, { buffer: metadataBuffer, mimeType: "application/json", fileName: "metadata.json" });

    // Primary gateway URL
    const gatewayUrl = `https://ipfs.io/ipfs/${imageCid}`;
    const fallbackGatewayUrl = `https://gateway.pinata.cloud/ipfs/${imageCid}`;
    const localProxyUrl = `/api/ipfs?cid=${imageCid}`;

    return NextResponse.json({
      success: true,
      cid: imageCid,
      ipfsUri,
      gatewayUrl,
      fallbackGatewayUrl,
      localProxyUrl,
      pinnedExternally,
      metadataCid,
      metadataIpfsUri,
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
    return new NextResponse(asset.buffer, {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Redirect to public IPFS gateway if not in memory
  return NextResponse.redirect(`https://ipfs.io/ipfs/${cid}`);
}
