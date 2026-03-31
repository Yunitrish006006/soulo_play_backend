export const ROLE_ADMIN = 'admin';
export const ROLE_PLAYER = 'player';

export function normalizeRole(role) {
  const value = String(role ?? '').trim().toLowerCase();
  if (value === ROLE_ADMIN) {
    return ROLE_ADMIN;
  }
  return ROLE_PLAYER;
}
