import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Firebase Admin / Cloud Storage round-trips can exceed Vercel's default 10s
// function limit, which surfaces as a 504 Gateway Timeout.
export const maxDuration = 60;


/**
 * Clears the server-side session cookie.
 */
export async function POST(): Promise<Response> {
  const response = NextResponse.json({ success: true });

  response.cookies.delete('__session');

  return response;
}