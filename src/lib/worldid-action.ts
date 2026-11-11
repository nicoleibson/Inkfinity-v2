/**
 * Single source of truth for the World ID action.
 *
 * A World ID nullifier is scoped to `(rp_id, action)`: the same human produces a
 * different nullifier per action. Login, signup and "link from Settings" must
 * therefore request the *same* action, or an account linked in one flow can never
 * be found by the other — the login lookup in `worldId_nullifiers/<nullifier>`
 * simply misses and the member is told their World ID is not linked.
 *
 * Both `inkfinity-account` and `inkfinity-auth` are registered in the Developer
 * Portal; the app uses `inkfinity-account` everywhere because the links that
 * exist in production were created with it.
 *
 * This module is intentionally NOT `server-only`: client components build the
 * IDKit request and need the same literal the server verifies against.
 */
export const WORLD_ID_ACTION = 'inkfinity-account';
