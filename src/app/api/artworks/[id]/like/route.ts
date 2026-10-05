import { NextRequest, NextResponse } from 'next/server';
import { ServerValue } from 'firebase-admin/database';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    let artworkId = '';
    try {
      artworkId = (await context.params).id?.trim() || '';
    } catch {
      return NextResponse.json({ success: false, error: 'Missing artwork id.' }, { status: 400 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
    }

    const userId = (body?.userId || '').toString().trim();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required.' }, { status: 400 });
    }

    const db = getAdminDb();
    const artworkSnap = await db.ref(`artworks/${artworkId}`).get();
    if (!artworkSnap.exists()) {
      return NextResponse.json({ success: false, error: 'Artwork not found.' }, { status: 404 });
    }
    const artwork = artworkSnap.val();
    const artistId = (artwork.artistId || '').toString();

    if (!artistId) {
      return NextResponse.json({ success: false, error: 'Artwork has no artistId.' }, { status: 422 });
    }
    if (userId === artistId) {
      return NextResponse.json({ success: false, error: 'You cannot like your own artwork.' }, { status: 400 });
    }

    const likeRef = db.ref(`artworks/${artworkId}/likes/${userId}`);
    const existing = await likeRef.get();
    if (existing.exists()) {
      return NextResponse.json({ success: true, alreadyLiked: true, message: 'Artwork already liked.' });
    }

    const updates: { [key: string]: any } = {};
    updates[`artworks/${artworkId}/likes/${userId}`] = true;
    updates[`artworks/${artworkId}/likesCount`] = ServerValue.increment(1);
    updates[`users/${userId}/likedArtworks/${artworkId}`] = true;
    updates[`users/${artistId}/points`] = ServerValue.increment(10);

    const notificationsRef = db.ref(`users/${artistId}/notifications`);
    const notificationId = notificationsRef.push().key;
    if (notificationId) {
      updates[`users/${artistId}/notifications/${notificationId}`] = {
        type: 'like',
        fromUserId: userId,
        fromUserName: body?.fromUserName?.toString().slice(0, 60) || 'A user',
        message: body?.message?.toString().slice(0, 160) || 'A user liked your artwork.',
        isRead: false,
        createdAt: ServerValue.TIMESTAMP,
        link: `/artwork/${artworkId}`,
      };
    }

    await db.ref().update(updates);
    return NextResponse.json({ success: true, liked: true, likesCount: (artwork.likesCount || 0) + 1, artistEarnedPoints: 10 });
  } catch (error) {
    console.error('[artworks/like] unexpected error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}