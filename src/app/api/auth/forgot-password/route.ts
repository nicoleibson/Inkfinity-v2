import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
// Firebase Admin / Cloud Storage round-trips can exceed Vercel's default 10s
// function limit, which surfaces as a 504 Gateway Timeout.
export const maxDuration = 60;

/**
 * Forgot password - sends recovery request to external support assistant or records
 * a support ticket in Firebase RTDB if an external assistant URL is not configured.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const assistantUrl = process.env.EXTERNAL_ASSISTANT_URL;
    const assistantKey = process.env.EXTERNAL_ASSISTANT_KEY;

    // If an external assistant endpoint is configured and is not the example placeholder, forward to it.
    if (assistantUrl && !assistantUrl.includes('example.com')) {
      const response = await fetch(assistantUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(assistantKey && { 'Authorization': `Bearer ${assistantKey}` }),
        },
        body: JSON.stringify({
          type: 'password_recovery_request',
          email: cleanEmail,
          timestamp: new Date().toISOString(),
          source: 'inkfinity-web',
        }),
      });

      if (!response.ok) {
        console.error('External assistant error:', await response.text());
        return NextResponse.json({ error: 'Failed to submit recovery request' }, { status: 502 });
      }
    } else {
      // Fallback: Store the ticket in RTDB so support can process it and the user is not blocked
      const adminDb = getAdminDb();
      const ticketRef = adminDb.ref('support_tickets/password_recovery').push();
      await ticketRef.set({
        email: cleanEmail,
        createdAt: new Date().toISOString(),
        status: 'pending',
        source: 'inkfinity-web',
      });
    }

    return NextResponse.json({ success: true, message: 'Recovery request sent to support team' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}