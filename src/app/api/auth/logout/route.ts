import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Clears the server-side session and the signed facial-verification cookies.
 *
 * The grants are httpOnly, so the client cannot clear them; calling this on sign-out
 * prevents a signed-in browser from keeping a valid face grant after the Firebase
 * session is gone.
 */
export async function POST(): Promise<Response> {
  const response = NextResponse.json({ success: true });

  response.cookies.delete('__session');
  response.cookies.delete('face_req_signed');
  response.cookies.delete('face_verified_signed');

  return response;
}