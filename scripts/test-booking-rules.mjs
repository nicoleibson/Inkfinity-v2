/**
 * Regresión de `database.rules.json` para el pipeline de pagos de reservas.
 *
 * Por qué existe: las liquidaciones las hace el servidor con el Admin SDK, que
 * ignora las reglas. Si las reglas permiten a un cliente escribir a mano
 * `paymentTxHash` / `depositConfirmedAt` o pasar `status` a `confirmed`, la
 * verificación on-chain del servidor queda evadible.
 *
 * IMPORTANTE: los tests usan `update(ref(db), { '/bookings/...': ... })`, que es
 * el patrón que usa la app (PATCH en la raíz con claves absolutas). Un PATCH en
 * `/bookings` se evalúa de forma distinta a uno en `/bookings/<id>`, así que
 * probar con la ruta equivocada da falsos negativos.
 *
 * Ejecutar:  npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { ref, set, update, get } from 'firebase/database';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'inkfinity-2d470';

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  database: { rules: readFileSync('database.rules.json', 'utf8') },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  await set(ref(ctx.database()), {
    users: {
      admin1: { role: 'Administrator' },
      super1: { role: 'Super-Administrator' },
      client1: { myBookings: {} },
      artist1: {},
      client2: { role: 'Client' },
    },
    bookings: {
      b_paid: {
        clientId: 'client1', artistId: 'artist1', bookingDate: '2026-01-01', createdAt: 1,
        status: 'awaiting_payment', depositAmount: 0.5, price: 100,
        clientWalletAddress: '0xclient', artistWalletAddress: '0xartist',
      },
      b_free: {
        clientId: 'client1', artistId: 'artist1', bookingDate: '2026-01-01', createdAt: 1,
        status: 'pending', depositAmount: 0, price: 100,
      },
    },
  });
});

let pass = 0;
const failures = [];

async function check(name, expected, fn) {
  let got = 'allow';
  try {
    await fn();
  } catch {
    got = 'deny';
  }
  if (got === expected) pass++;
  else failures.push(`${name}: esperado ${expected}, real ${got}`);
}

const root = (uid) => ref(env.authenticatedContext(uid).database());
const fresh = (uid) => ref(env.authenticatedContext(uid).database()); // uid sin perfil previo
const guest = () => ref(env.unauthenticatedContext().database());
const HASH = '0x' + 'a'.repeat(64);

// --- Flujos legítimos que la app ejecuta hoy ---
await check('crear reserva (PATCH raíz, booking-dialog)', 'allow', () =>
  update(root('client1'), {
    '/bookings/b_new': { artistId: 'artist1', clientId: 'client1', bookingDate: '2026-02-01', status: 'pending', createdAt: 1, depositAmount: 0.5 },
    '/users/client1/myBookings/b_new': true,
  }));

await check('cliente cancela su reserva', 'allow', () =>
  update(root('client1'), { '/bookings/b_paid/status': 'cancelled' }));

await check('artista acepta la reserva', 'allow', () =>
  update(root('artist1'), { '/bookings/b_paid/status': 'awaiting_payment' }));

await check('cliente escribe un campo normal', 'allow', () =>
  update(root('client1'), { '/bookings/b_paid/description': 'hola' }));

await check('cliente sube el depósito', 'allow', () =>
  update(root('client1'), { '/bookings/b_paid/depositAmount': 0.9 }));

await check('cliente confirma reserva SIN depósito', 'allow', () =>
  update(root('client1'), { '/bookings/b_free/status': 'confirmed' }));

// --- El bypass que importa: liquidar sin que el servidor verifique nada ---
await check('cliente NO confirma reserva CON depósito', 'deny', () =>
  update(root('client1'), { '/bookings/b_paid/status': 'confirmed' }));

await check('artista NO confirma reserva CON depósito', 'deny', () =>
  update(root('artist1'), { '/bookings/b_paid/status': 'confirmed' }));

await check('tercero NO confirma reserva CON depósito', 'deny', () =>
  update(root('client2'), { '/bookings/b_paid/status': 'confirmed' }));

await check('anónimo NO confirma reserva CON depósito', 'deny', () =>
  update(guest(), { '/bookings/b_paid/status': 'confirmed' }));

await check('cliente NO marca pagada+confirmada a la vez', 'deny', () =>
  update(root('client1'), {
    '/bookings/b_paid/status': 'confirmed',
    '/bookings/b_paid/paymentTxHash': HASH,
    '/bookings/b_paid/depositConfirmedAt': 1,
  }));

// --- Campos de liquidación: solo el servidor (Admin SDK) o un admin ---
// Se siembran ya liquidados (como haría el Admin SDK) para que "borrar" sea un
// cambio real y no una escritura no-op.
await env.withSecurityRulesDisabled(async (ctx) => {
  await update(ref(ctx.database()), {
    'bookings/b_paid/paymentTxHash': HASH,
    'bookings/b_paid/depositConfirmedAt': 1,
    'bookings/b_paid/refundConfirmedAt': 1,
    'bookings/b_paid/cancellationTxHash': HASH,
  });
});

for (const field of ['paymentTxHash', 'depositConfirmedAt', 'refundConfirmedAt', 'cancellationTxHash']) {
  await check(`cliente NO escribe ${field}`, 'deny', () =>
    update(root('client1'), { [`/bookings/b_paid/${field}`]: field.endsWith('At') ? 1 : HASH }));

  await check(`artista NO escribe ${field}`, 'deny', () =>
    update(root('artist1'), { [`/bookings/b_paid/${field}`]: field.endsWith('At') ? 1 : HASH }));

  await check(`cliente NO borra ${field}`, 'deny', () =>
    update(root('client1'), { [`/bookings/b_paid/${field}`]: null }));
}

await check('cliente NO baja el depósito', 'deny', () =>
  update(root('client1'), { '/bookings/b_paid/depositAmount': 0.1 }));

// --- Los admins (y solo ellos) pueden liquidar a mano ---
await check('admin escribe paymentTxHash', 'allow', () =>
  update(root('admin1'), { '/bookings/b_paid/paymentTxHash': HASH }));

await check('super-admin confirma reserva CON depósito', 'allow', () =>
  update(root('super1'), { '/bookings/b_paid/status': 'confirmed' }));

await check('admin escribe refundConfirmedAt', 'allow', () =>
  update(root('admin1'), { '/bookings/b_paid/refundConfirmedAt': 1 }));

// --- payment_claims: solo el servidor ---
// Las rutas de verificación recuperan una liquidación interrumpida a partir del
// claim registrado. Si un cliente pudiera escribirlo, podría auto-satisfacer una
// reserva sin pagar. Deny-by-default en la raíz, pero se fija con un test.
await check('cliente NO crea un claim de pago', 'deny', () =>
  update(root('client1'), { '/payment_claims/worldchain:b_paid:deposit': { userId: 'client1', kind: 'booking:deposit', paymentRef: HASH } }));

await check('artista NO crea un claim de pago', 'deny', () =>
  update(root('artist1'), { '/payment_claims/worldchain:b_paid:refund': { userId: 'artist1', kind: 'booking:refund', paymentRef: HASH } }));

await check('anónimo NO lee los claims de pago', 'deny', () =>
  get(guest(), '/payment_claims'));

await check('cliente autenticado NO lee los claims de pago', 'deny', () =>
  get(root('client1'), '/payment_claims'));

// --- World ID: el servidor es la única fuente de verdad ---
// La verificación de World ID corre íntegramente en el servidor con el Admin SDK
// (que ignora las reglas). Si el dueño de la cuenta pudiera escribirse a sí mismo
// `worldIdVerified`, se auto-verificaría sin proof, y el índice de nullifiers es
// justamente lo que impide registrar un World ID en dos cuentas.
await check('cliente NO se auto-verifica World ID', 'deny', () =>
  update(root('client1'), { '/users/client1/worldIdVerified': true }));

await check('artista NO se auto-verifica World ID', 'deny', () =>
  update(root('artist1'), { '/users/artist1/worldIdVerified': true }));

await check('cliente NO falsifica la fecha de verificación', 'deny', () =>
  update(root('client1'), { '/users/client1/worldIdVerifiedAt': '2026-01-01T00:00:00.000Z' }));

await check('admin SÍ marca World ID como verificado', 'allow', () =>
  update(root('admin1'), { '/users/client1/worldIdVerified': true }));

await check('cliente NO registra un nullifier', 'deny', () =>
  update(root('client1'), { '/worldId_nullifiers/0xabc': { uid: 'client1' } }));

await check('anónimo NO lee el índice de nullifiers', 'deny', () =>
  get(guest(), '/worldId_nullifiers'));

await check('cliente autenticado NO lee el índice de nullifiers', 'deny', () =>
  get(root('client1'), '/worldId_nullifiers'));

// --- Escalada de privilegios vía `users/<uid>` ---
// `users/<uid>` concede `.write` al dueño, y en Realtime Database los permisos
// heredan hacia abajo SIN PODER REVOCARSE: un `.write` admin-only en un hijo no
// impedía nada. Estos campos exigían `.validate`, que sí se evalúa.
await check('dueño NO se auto-nombra Administrator', 'deny', () =>
  update(root('client1'), { '/users/client1/role': 'Administrator' }));

await check('dueño NO se auto-nombra Super-Administrator', 'deny', () =>
  update(root('client1'), { '/users/client1/role': 'Super-Administrator' }));

await check('dueño NO cambia un role ya establecido', 'deny', () =>
  update(root('client2'), { '/users/client2/role': 'Studio' }));

await check('dueño NO se activa a sí mismo (status=active)', 'deny', () =>
  update(root('client1'), { '/users/client1/status': 'active' }));

// Bypass del gate de pago: al no evaluarse .validate en borrados, un usuario
// podría borrar su status y volver a escribirlo como 'active'. La regla del
// nodo padre (`users/$uid`) cierra esa transición.
await check('dueño NO borra status y lo reescribe como active', 'deny', async () => {
  await update(root('client2'), { '/users/client2/status': null });
  await update(root('client2'), { '/users/client2/status': 'active' });
});

await check('dueño NO se marca a sí mismo como suspendido', 'deny', () =>
  update(root('client1'), { '/users/client1/status': 'suspended' }));

await check('dueño NO falsifica su paymentDate', 'deny', () =>
  update(root('client1'), { '/users/client1/paymentDate': '2026-01-01T00:00:00.000Z' }));

await check('dueño NO falsifica su paymentTxHash', 'deny', () =>
  update(root('client1'), { '/users/client1/paymentTxHash': '0xdead' }));

// `verify-payment` paga comissão usando estos campos; el propio código asume que
// solo el servidor los escribe. Sin .validate el dueño podía forzar comisiones.
await check('dueño NO se auto-asigna referredBy', 'deny', () =>
  update(root('client1'), { '/users/client1/referredBy': 'admin1' }));

await check('dueño NO se auto-asigna referralCodeUsed', 'deny', () =>
  update(root('client1'), { '/users/client1/referralCodeUsed': 'CODE' }));

await check('dueño NO se auto-asigna referralEarnings', 'deny', () =>
  update(root('client1'), { '/users/client1/referralEarnings/2026-W40/commissionWei': '1' }));

// --- Flujos legítimos que NO deben romperse ---
// El registro crea el perfil con role + status: se permite solo en la creación y
// solo con valores no privilegiados.
await check('dueño fija su role por 1ª vez (signup, no privilegiado)', 'allow', () =>
  update(root('client1'), { '/users/client1/role': 'Tattoo Artist' }));

// El flujo real de signup escribe el perfil entero de una vez (role + status
// + legal + contadores). Es el camino que NO debe romperse.
await check('signup crea perfil completo (role Tattoo Artist + status active)', 'allow', () =>
  update(fresh('newbie1'), {
    '/users/newbie1': {
      role: 'Tattoo Artist', status: 'active', name: 'Nuevo Artista', username: 'nuevoartista',
      email: 'nuevo@example.com', points: 0, followersCount: 0, followingCount: 0,
      artworksCount: 0, collectionCount: 0, twoFactorEnabled: false, storageUsed: 0,
      artistRequestStatus: 'none', referralCodeUsed: false, onboardingComplete: false,
      legal: { globalTerms: true, acceptedAt: '2026-01-01T00:00:00.000Z' },
    },
  }));

await check('signup crea perfil completo (role Studio + status pending_payment)', 'allow', () =>
  update(fresh('newbie2'), {
    '/users/newbie2': {
      role: 'Studio', status: 'pending_payment', name: 'Nuevo Studio', username: 'nuevostudio',
      email: 'studio@example.com', points: 0, followersCount: 0, followingCount: 0,
      artworksCount: 0, collectionCount: 0, twoFactorEnabled: false, storageUsed: 0,
      artistRequestStatus: 'none', referralCodeUsed: false, onboardingComplete: false,
    },
  }));

await check('dueño NO escribe el perfil de otro usuario', 'deny', () =>
  update(root('client1'), { '/users/client2': { role: 'Studio', status: 'active' } }));

// Un trial de artista caducado pasa a pending_payment: lo escribe el propio
// cliente en el login, así que debe seguir permitido.
await check('dueño marca su propio status=pending_payment', 'allow', () =>
  update(root('client1'), { '/users/client1/status': 'pending_payment' }));

await check('admin SÍ cambia el status de otro usuario', 'allow', () =>
  update(root('admin1'), { '/users/client1/status': 'suspended' }));

await check('admin SÍ promueve a otro usuario', 'allow', () =>
  update(root('admin1'), { '/users/client1/role': 'Administrator' }));

await check('admin SÍ marca el pago de otro usuario', 'allow', () =>
  update(root('admin1'), { '/users/client1/paymentDate': '2026-01-01T00:00:00.000Z' }));

await env.cleanup();

console.log(`\n${pass}/${pass + failures.length} assertions OK`);
if (failures.length) {
  console.error('\nFALLOS:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
