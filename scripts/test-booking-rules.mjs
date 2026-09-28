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
      client2: {},
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

await env.cleanup();

console.log(`\n${pass}/${pass + failures.length} assertions OK`);
if (failures.length) {
  console.error('\nFALLOS:');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
