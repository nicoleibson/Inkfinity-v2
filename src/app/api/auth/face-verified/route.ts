import { NextRequest, NextResponse } from 'next/server';
import { getAdminApp } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';

const adminApp = getAdminApp();
const adminAuth = getAuth(adminApp);

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<Response> {
  // Esta ruta debe ser llamada SOLO desde el cliente después de una verificación facial exitosa
  // El cliente debe estar autenticado (cookie __session válida)
  
  const sessionCookie = request.cookies.get('__session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const decodedClaims = await getAuth().verifySessionCookie(request.cookies.get('__session')?.value || '', true);
    const uid = decodedClaims.uid;

    // Establecer custom claim de verificación facial
    await getAuth().setCustomUserClaims(uid, {
      ...decodedClaims,
      faceVerified: true,
      faceVerifiedAt: Date.now(),
    });

    // Forzar refresh del token en el cliente
    // El cliente deberá hacer auth.currentUser.getIdToken(true) para obtener el nuevo token
    return NextResponse.json({ success: true, message: 'Face verification recorded' });
  } catch (error) {
    console.error('Error setting faceVerified claim:', error);
    return NextResponse.json(
      { error: 'Failed to record face verification' },
      { status: 500 }
    );
  }
}