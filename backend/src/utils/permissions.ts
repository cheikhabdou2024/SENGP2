/**
 * Admin permission model.
 *
 * Permissions are `resource:action` strings. An admin's role carries a list of
 * them (or the wildcard `["*"]` for super admins). The list is embedded in the
 * JWT at login so both the API (route guards) and the frontend (section
 * visibility) read from one source of truth.
 */

/** Every permission the system understands (source of truth for the UI). */
export const ALL_PERMISSIONS = [
  'users:read', 'users:write', 'users:verify', 'users:delete',
  'missions:read', 'missions:write', 'missions:assign', 'missions:delete',
  'trips:read', 'trips:delete',
  'payments:read', 'payments:refund', 'payments:export',
  'withdrawals:read', 'withdrawals:approve', 'withdrawals:payout',
  'claims:read', 'claims:write',
  'reviews:read', 'reviews:moderate',
  'analytics:read',
  'broadcast:send',
  'settings:read', 'settings:write',
  'roles:read', 'roles:manage',
  'audit:read',
] as const;

export type Permission = typeof ALL_PERMISSIONS[number];

/**
 * Does `granted` satisfy the `required` permission?
 * Supports the global wildcard `*` and per-resource wildcards like `users:*`.
 */
export function hasPermission(granted: string[] | undefined | null, required: string): boolean {
  if (!granted || granted.length === 0) return false;
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const resource = required.split(':')[0];
  return granted.includes(`${resource}:*`);
}
