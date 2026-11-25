import pool from '../../config/database';
import { ALL_PERMISSIONS, canGrant } from '../../utils/permissions';

/** Action refused because the acting admin lacks the rights to do it (maps to HTTP 403). */
export class AdminForbidden extends Error {}

/** Rôles et permissions (RBAC). */
export class AdminRoleService {
  // ---------- Admin roles (RBAC) ----------
  static async listRoles() {
    const r = await pool.query(
      `SELECT ar.id, ar.key, ar.name, ar.description, ar.permissions, ar.is_system,
              ar.created_at, ar.updated_at,
              (SELECT COUNT(*) FROM users u WHERE u.admin_role_id = ar.id AND u.deleted_at IS NULL) AS admin_count
         FROM admin_role ar
        ORDER BY ar.is_system DESC, ar.name ASC`
    );
    return { data: r.rows, catalog: ALL_PERMISSIONS };
  }

  /** Validate a permission list against the known catalog (allows '*'). */
  private static sanitizePermissions(permissions: any): string[] {
    if (!Array.isArray(permissions)) throw new Error('permissions must be an array');
    const valid = new Set<string>([...ALL_PERMISSIONS, '*']);
    const clean = [...new Set(permissions.map((p) => String(p)))];
    const bad = clean.filter((p) => !valid.has(p));
    if (bad.length) throw new Error(`Unknown permissions: ${bad.join(', ')}`);
    return clean;
  }

  /** Refuse an action that would leave the platform without any active super admin. */
  static async assertNotLastSuperAdmin(userId: string) {
    const r = await pool.query(
      `SELECT u.id FROM users u JOIN admin_role ar ON ar.id = u.admin_role_id
        WHERE ar.key = 'super_admin' AND u.user_type = 'admin' AND u.deleted_at IS NULL
          AND u.status NOT IN ('suspended', 'deleted')`
    );
    const ids = r.rows.map((x: any) => x.id);
    if (ids.includes(userId) && ids.length <= 1) {
      throw new Error('Cannot remove or suspend the last super admin');
    }
  }

  /** Revoke the sessions of every admin holding a role, so a change applies at once. */
  private static async revokeRoleHolders(roleId: string) {
    await pool.query(
      `UPDATE users SET token_version = COALESCE(token_version, 0) + 1 WHERE admin_role_id = $1`,
      [roleId]
    );
  }

  static async createRole(data: { key?: string; name: string; description?: string; permissions: any }, actorPerms?: string[]) {
    if (!data.name) throw new Error('name is required');
    const key = (data.key || data.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!key) throw new Error('A valid key or name is required');
    const perms = this.sanitizePermissions(data.permissions || []);
    if (!canGrant(actorPerms, perms)) throw new AdminForbidden('You cannot grant permissions you do not hold');
    const exists = await pool.query('SELECT 1 FROM admin_role WHERE key = $1', [key]);
    if (exists.rows.length) throw new Error('A role with this key already exists');
    const r = await pool.query(
      `INSERT INTO admin_role (key, name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4, FALSE)
       RETURNING id, key, name, description, permissions, is_system, created_at, updated_at`,
      [key, data.name, data.description || null, JSON.stringify(perms)]
    );
    return r.rows[0];
  }

  static async updateRole(id: string, data: { name?: string; description?: string; permissions?: any }, actorPerms?: string[]) {
    const cur = await pool.query('SELECT is_system FROM admin_role WHERE id = $1', [id]);
    if (cur.rows.length === 0) throw new Error('Role not found');
    // System-role permissions are managed in code (re-synced on deploy); editing
    // them from the UI would silently revert. Name/description stay editable.
    if (cur.rows[0].is_system && data.permissions !== undefined) {
      throw new Error('Permissions of a system role cannot be edited (managed in code)');
    }
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    if (data.name !== undefined) { sets.push(`name = $${i++}`); args.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${i++}`); args.push(data.description); }
    if (data.permissions !== undefined) {
      const perms = this.sanitizePermissions(data.permissions);
      if (!canGrant(actorPerms, perms)) throw new AdminForbidden('You cannot grant permissions you do not hold');
      sets.push(`permissions = $${i++}`); args.push(JSON.stringify(perms));
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    args.push(id);
    const r = await pool.query(
      `UPDATE admin_role SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, key, name, description, permissions, is_system, created_at, updated_at`,
      args
    );
    if (data.permissions !== undefined) await this.revokeRoleHolders(id);
    return r.rows[0];
  }

  static async deleteRole(id: string) {
    const cur = await pool.query('SELECT is_system FROM admin_role WHERE id = $1', [id]);
    if (cur.rows.length === 0) throw new Error('Role not found');
    if (cur.rows[0].is_system) throw new Error('System roles cannot be deleted');
    const assigned = await pool.query(
      'SELECT COUNT(*) FROM users WHERE admin_role_id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (parseInt(assigned.rows[0].count) > 0) {
      throw new Error('Reassign the admins on this role before deleting it');
    }
    await pool.query('DELETE FROM admin_role WHERE id = $1', [id]);
    return { id, deleted: true };
  }

  /** Assign an admin role to a user (promoting them to admin in the process). */
  static async setUserRole(userId: string, roleId: string, actorPerms?: string[]) {
    if (!roleId) throw new Error('role_id is required');
    const role = await pool.query('SELECT id, key, name, permissions FROM admin_role WHERE id = $1', [roleId]);
    if (role.rows.length === 0) throw new Error('Role not found');
    let granted = role.rows[0].permissions;
    if (typeof granted === 'string') { try { granted = JSON.parse(granted); } catch { granted = []; } }
    if (!canGrant(actorPerms, Array.isArray(granted) ? granted : [])) {
      throw new AdminForbidden('You cannot assign a role with more permissions than you hold');
    }
    // Moving the last super admin to another role would lock everyone out.
    if (role.rows[0].key !== 'super_admin') await this.assertNotLastSuperAdmin(userId);
    const r = await pool.query(
      `UPDATE users
          SET admin_role_id = $1, user_type = 'admin', status = 'verified',
              token_version = COALESCE(token_version, 0) + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING id, email, user_type, admin_role_id`,
      [roleId, userId]
    );
    if (r.rows.length === 0) throw new Error('User not found');
    return { ...r.rows[0], role: role.rows[0] };
  }
}
