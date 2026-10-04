import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Forgot password - sends recovery request to external support assistant.
 * Replaces Firebase's built-in password reset (disabled).
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    // Send to external support assistant
    const assistantUrl = process.env.EXTERNAL_ASSISTANT_URL || 'https://api.example.com/assist/support';
    const assistantKey = process.env.EXTERNAL_ASSISTANT_KEY;

    const response = await fetch(assistantUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(assistantKey && { 'Authorization': `Bearer ${assistantKey}` }),
      },
      body: JSON.stringify({
        type: 'password_recovery_request',
        email: email.toLowerCase().trim(),
        timestamp: new Date().toISOString(),
        source: 'inkfinity-web',
      }),
    });

    if (!response.ok) {
      console.error('External assistant error:', await response.text());
      return NextResponse.json({ error: 'Failed to submit recovery request' }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'Recovery request sent to support team' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}