-- ============================================================================
-- 002_admin_rbac.sql
-- Role-based access control for admin users (Phase 1) + audit-log groundwork
-- (Phase 0). Fully idempotent: safe to run on every boot.
-- ============================================================================

-- ---- admin_role: configurable roles on top of user_type = 'admin' ----------
CREATE TABLE IF NOT EXISTS admin_role (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key         VARCHAR(50)  UNIQUE NOT NULL,           -- 'super_admin', 'operations'…
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]',            -- ["users:read", …] or ["*"]
    is_system   BOOLEAN NOT NULL DEFAULT FALSE,         -- system roles can't be deleted
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---- link an admin user to exactly one role (NULL for non-admins) -----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role_id UUID REFERENCES admin_role(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_admin_role ON users(admin_role_id);

-- ---- DB-backed platform config (used from Phase 7; created now so the FK and
--       settings can be seeded early) ---------------------------------------
CREATE TABLE IF NOT EXISTS platform_setting (
    key        VARCHAR(100) PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---- keep updated_at fresh on admin_role ----------------------------------
DROP TRIGGER IF EXISTS update_admin_role_updated_at ON admin_role;
CREATE TRIGGER update_admin_role_updated_at BEFORE UPDATE ON admin_role
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---- seed the six system roles --------------------------------------------
-- ON CONFLICT keeps the permission set in sync with code on every deploy, but
-- never overwrites a role an admin renamed (name/description are left alone for
-- non-system rows because those are matched by a different key).
INSERT INTO admin_role (key, name, description, permissions, is_system) VALUES
    ('super_admin', 'Super Admin',
     'Accès complet à toute la plateforme.',
     '["*"]', TRUE),
    ('operations', 'Opérations',
     'Gère les missions, l''affectation des GP et les trajets.',
     '["users:read","missions:read","missions:write","missions:assign","missions:delete","trips:read","trips:delete","analytics:read","broadcast:send"]', TRUE),
    ('finance', 'Finance',
     'Gère les paiements, remboursements et retraits.',
     '["payments:read","payments:refund","payments:export","withdrawals:read","withdrawals:approve","withdrawals:payout","analytics:read","audit:read"]', TRUE),
    ('support', 'Support',
     'Traite les réclamations et modère les avis.',
     '["users:read","claims:read","claims:write","reviews:read","reviews:moderate","broadcast:send"]', TRUE),
    ('verification', 'Vérification KYC',
     'Vérifie l''identité des utilisateurs.',
     '["users:read","users:verify"]', TRUE),
    ('analyst', 'Analyste',
     'Accès en lecture seule aux données et rapports.',
     '["users:read","missions:read","trips:read","payments:read","withdrawals:read","claims:read","reviews:read","analytics:read","audit:read"]', TRUE)
ON CONFLICT (key) DO UPDATE
    SET permissions = EXCLUDED.permissions,
        updated_at  = CURRENT_TIMESTAMP
    WHERE admin_role.is_system = TRUE;   -- only re-sync the built-in roles

-- ---- backfill: any existing admin with no role becomes super_admin ---------
--       (prevents lock-out of accounts created before RBAC existed).
UPDATE users
   SET admin_role_id = (SELECT id FROM admin_role WHERE key = 'super_admin')
 WHERE user_type = 'admin'
   AND admin_role_id IS NULL
   AND deleted_at IS NULL;
