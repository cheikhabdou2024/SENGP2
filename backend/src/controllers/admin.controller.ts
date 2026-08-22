import { Response } from 'express';
import { AdminService } from '../services/admin.service';
import { WithdrawalService } from '../services/withdrawal.service';
import { ResponseUtil } from '../utils/response';
import { logAdminAction } from '../utils/audit';
import { toCsv } from '../utils/csv';
import { AuthRequest, UserType } from '../types';
import logger from '../utils/logger';

/** Pull common list query params. */
function listParams(req: AuthRequest) {
  return {
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
    search: (req.query.search as string) || undefined,
    status: (req.query.status as string) || undefined,
    user_type: (req.query.user_type as string) || undefined,
  };
}

export class AdminController {
  static async stats(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const data = await AdminService.getStats();
      ResponseUtil.success(res, data);
    } catch (e: any) {
      logger.error('Admin stats error:', e);
      ResponseUtil.serverError(res, e.message || 'Failed to load stats');
    }
  }

  // Users
  static async listUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listUsers(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async updateUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const u = await AdminService.updateUser(req.params.id, req.body);
      void logAdminAction({ req, action: 'user.update', entityType: 'user', entityId: req.params.id, metadata: { fields: Object.keys(req.body || {}) } });
      ResponseUtil.success(res, u, 'User updated');
    } catch (e: any) {
      if (e.message === 'User not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Update failed');
    }
  }
  static async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (req.user && req.user.id === req.params.id) {
        ResponseUtil.badRequest(res, 'You cannot delete your own admin account');
        return;
      }
      const r = await AdminService.deleteUser(req.params.id);
      void logAdminAction({ req, action: 'user.delete', entityType: 'user', entityId: req.params.id });
      ResponseUtil.success(res, r, 'User deleted');
    } catch (e: any) {
      if (e.message === 'User not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Delete failed');
    }
  }
  static async getUserDetail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const d = await AdminService.getUserDetail(req.params.id);
      ResponseUtil.success(res, d);
    } catch (e: any) {
      if (e.message === 'User not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Failed');
    }
  }
  static async createUser(req: AuthRequest, res: Response): Promise<void> {
    try {
      const u = await AdminService.createUser(req.body);
      void logAdminAction({ req, action: 'user.create', entityType: 'user', entityId: u.id, description: u.email });
      ResponseUtil.created(res, u, 'User created');
    } catch (e: any) {
      if (e.message === 'Email already registered') return void ResponseUtil.conflict(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Create failed');
    }
  }

  // KYC / identity verification
  static async listKyc(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listKyc(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async approveKyc(req: AuthRequest, res: Response): Promise<void> {
    try {
      const u = await AdminService.approveKyc(req.params.id, req.user!.id);
      void logAdminAction({ req, action: 'kyc.approve', entityType: 'user', entityId: req.params.id });
      ResponseUtil.success(res, u, 'Identité vérifiée');
    } catch (e: any) {
      if (e.message === 'User not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Approve failed');
    }
  }
  static async rejectKyc(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.rejectKyc(req.params.id, req.user!.id, req.body.reason);
      void logAdminAction({ req, action: 'kyc.reject', entityType: 'user', entityId: req.params.id, description: req.body.reason });
      ResponseUtil.success(res, r, 'Pièce refusée');
    } catch (e: any) {
      if (e.message === 'User not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Reject failed');
    }
  }

  // Missions
  static async listMissions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listMissions(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async updateMission(req: AuthRequest, res: Response): Promise<void> {
    try {
      const m = await AdminService.updateMission(req.params.id, req.body);
      void logAdminAction({ req, action: 'mission.update', entityType: 'mission', entityId: req.params.id, metadata: { fields: Object.keys(req.body || {}) } });
      ResponseUtil.success(res, m, 'Mission updated');
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Update failed');
    }
  }
  static async deleteMission(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.deleteMission(req.params.id);
      void logAdminAction({ req, action: 'mission.delete', entityType: 'mission', entityId: req.params.id });
      ResponseUtil.success(res, r, 'Mission deleted');
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Delete failed');
    }
  }
  static async assignMission(req: AuthRequest, res: Response): Promise<void> {
    try {
      const m = await AdminService.assignMission(req.params.id, req.body.gp_id);
      void logAdminAction({ req, action: 'mission.assign', entityType: 'mission', entityId: req.params.id, metadata: { gp_id: req.body.gp_id } });
      ResponseUtil.success(res, m, 'Mission assigned and GP notified');
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Assignment failed');
    }
  }
  static async confirmArrival(req: AuthRequest, res: Response): Promise<void> {
    try {
      const m = await AdminService.confirmArrival(req.params.id);
      void logAdminAction({ req, action: 'mission.confirm_arrival', entityType: 'mission', entityId: req.params.id });
      ResponseUtil.success(res, m, 'Arrivée confirmée — le GP peut livrer');
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Confirmation failed');
    }
  }
  static async getMissionDetail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const d = await AdminService.getMissionDetail(req.params.id);
      ResponseUtil.success(res, d);
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Failed');
    }
  }
  static async reassignMission(req: AuthRequest, res: Response): Promise<void> {
    try {
      const m = await AdminService.reassignMission(req.params.id, req.body.gp_id);
      void logAdminAction({ req, action: 'mission.reassign', entityType: 'mission', entityId: req.params.id, metadata: { gp_id: req.body.gp_id } });
      ResponseUtil.success(res, m, 'Mission réassignée — le GP a été notifié');
    } catch (e: any) {
      if (e.message === 'Mission not found' || e.message === 'GP not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Reassign failed');
    }
  }

  // Trips
  static async listTrips(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listTrips(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async deleteTrip(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.deleteTrip(req.params.id);
      void logAdminAction({ req, action: 'trip.delete', entityType: 'trip', entityId: req.params.id });
      ResponseUtil.success(res, r, 'Trip deleted');
    } catch (e: any) {
      if (e.message && e.message.includes('not found')) return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Delete failed');
    }
  }
  static async getTripDetail(req: AuthRequest, res: Response): Promise<void> {
    try {
      const d = await AdminService.getTripDetail(req.params.id);
      ResponseUtil.success(res, d);
    } catch (e: any) {
      if (e.message === 'Trip not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Failed');
    }
  }
  static async updateTrip(req: AuthRequest, res: Response): Promise<void> {
    try {
      const t = await AdminService.updateTrip(req.params.id, req.body);
      void logAdminAction({ req, action: 'trip.update', entityType: 'trip', entityId: req.params.id, metadata: { fields: Object.keys(req.body || {}) } });
      ResponseUtil.success(res, t, 'Trip updated');
    } catch (e: any) {
      if (e.message === 'Trip not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Update failed');
    }
  }

  // Payments
  static async listPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listPayments(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async refundPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const p = await AdminService.refundPayment(req.params.id, req.user!.id, req.body.reason);
      void logAdminAction({ req, action: 'payment.refund', entityType: 'payment', entityId: req.params.id, description: req.body.reason });
      ResponseUtil.success(res, p, 'Paiement remboursé');
    } catch (e: any) {
      if (e.message === 'Payment not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Refund failed');
    }
  }
  static async exportPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const rows = await AdminService.listPaymentsForExport(listParams(req));
      const csv = toCsv(rows, [
        { key: 'payment_code', label: 'Code' }, { key: 'created_at', label: 'Date' },
        { key: 'amount', label: 'Montant' }, { key: 'commission', label: 'Commission' },
        { key: 'net_amount', label: 'Net' }, { key: 'currency', label: 'Devise' },
        { key: 'payment_method', label: 'Méthode' }, { key: 'status', label: 'Statut' },
        { key: 'transaction_type', label: 'Type' },
        { key: 'payer_name', label: 'Payeur' }, { key: 'payee_name', label: 'Bénéficiaire' },
      ]);
      void logAdminAction({ req, action: 'payment.export', entityType: 'payment', metadata: { count: rows.length } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
      res.status(200).send(csv);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Export failed'); }
  }

  // Withdrawals (reuse WithdrawalService)
  static async listWithdrawals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const p = listParams(req);
      const r = await WithdrawalService.listAll(p.page, p.limit, p.status);
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async approveWithdrawal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const w = await WithdrawalService.approve(req.params.id, req.user!.id);
      void logAdminAction({ req, action: 'withdrawal.approve', entityType: 'withdrawal', entityId: req.params.id });
      ResponseUtil.success(res, w, 'Withdrawal approved');
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Approve failed'); }
  }
  static async rejectWithdrawal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const w = await WithdrawalService.reject(req.params.id, req.user!.id, req.body.reason || 'Rejected by admin');
      void logAdminAction({ req, action: 'withdrawal.reject', entityType: 'withdrawal', entityId: req.params.id, description: req.body.reason });
      ResponseUtil.success(res, w, 'Withdrawal rejected');
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Reject failed'); }
  }
  static async payWithdrawal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const w = await WithdrawalService.markPaid(req.params.id, req.user!.id, req.body.reference, req.body.proof_url);
      void logAdminAction({ req, action: 'withdrawal.paid', entityType: 'withdrawal', entityId: req.params.id, metadata: { reference: req.body.reference } });
      ResponseUtil.success(res, w, 'Retrait marqué payé');
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Payout failed'); }
  }
  static async exportWithdrawals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const rows = await WithdrawalService.listForExport((req.query.status as string) || undefined);
      const csv = toCsv(rows, [
        { key: 'withdrawal_code', label: 'Code' }, { key: 'created_at', label: 'Date' },
        { key: 'gp_name', label: 'GP' }, { key: 'gp_phone', label: 'Téléphone' },
        { key: 'amount', label: 'Montant' }, { key: 'currency', label: 'Devise' },
        { key: 'withdrawal_method', label: 'Méthode' }, { key: 'account_number', label: 'Compte' },
        { key: 'account_name', label: 'Nom du compte' }, { key: 'status', label: 'Statut' },
        { key: 'external_reference', label: 'Référence' }, { key: 'completed_at', label: 'Payé le' },
      ]);
      void logAdminAction({ req, action: 'withdrawal.export', entityType: 'withdrawal', metadata: { count: rows.length } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="withdrawals.csv"');
      res.status(200).send(csv);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Export failed'); }
  }

  // Claims
  static async listClaims(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listClaims(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async updateClaim(req: AuthRequest, res: Response): Promise<void> {
    try {
      const c = await AdminService.updateClaim(req.params.id, req.user!.id, req.body);
      void logAdminAction({ req, action: 'claim.update', entityType: 'claim', entityId: req.params.id, metadata: { fields: Object.keys(req.body || {}) } });
      ResponseUtil.success(res, c, 'Claim updated');
    } catch (e: any) {
      if (e.message === 'Claim not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Update failed');
    }
  }

  // ---------- Current admin's permissions ----------
  static async myPermissions(req: AuthRequest, res: Response): Promise<void> {
    // Legacy token (no perms claim) → treat a raw admin as full access.
    const perms = req.user?.permissions ?? (req.user?.user_type === UserType.ADMIN ? ['*'] : []);
    ResponseUtil.success(res, { permissions: perms, user_type: req.user?.user_type });
  }

  // ---------- Roles ----------
  static async listRoles(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listRoles();
      ResponseUtil.success(res, r.data, undefined, { catalog: r.catalog } as any);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }
  static async createRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const role = await AdminService.createRole(req.body);
      void logAdminAction({ req, action: 'role.create', entityType: 'admin_role', entityId: role.id, description: role.name });
      ResponseUtil.created(res, role, 'Role created');
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Create failed'); }
  }
  static async updateRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const role = await AdminService.updateRole(req.params.id, req.body);
      void logAdminAction({ req, action: 'role.update', entityType: 'admin_role', entityId: req.params.id });
      ResponseUtil.success(res, role, 'Role updated');
    } catch (e: any) {
      if (e.message === 'Role not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Update failed');
    }
  }
  static async deleteRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.deleteRole(req.params.id);
      void logAdminAction({ req, action: 'role.delete', entityType: 'admin_role', entityId: req.params.id });
      ResponseUtil.success(res, r, 'Role deleted');
    } catch (e: any) {
      if (e.message === 'Role not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Delete failed');
    }
  }
  static async setUserRole(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.setUserRole(req.params.id, req.body.role_id);
      void logAdminAction({ req, action: 'user.set_role', entityType: 'user', entityId: req.params.id, metadata: { role_id: req.body.role_id } });
      ResponseUtil.success(res, r, 'Role assigned');
    } catch (e: any) {
      if (e.message === 'User not found' || e.message === 'Role not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Assign failed');
    }
  }

  // ---------- Audit log ----------
  static async listAudit(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listAudit(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
  }

  // Bootstrap (public, secret-gated)
  static async bootstrap(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, secret } = req.body;
      if (!email || !secret) { ResponseUtil.badRequest(res, 'email and secret are required'); return; }
      const u = await AdminService.bootstrapAdmin(email, secret);
      ResponseUtil.success(res, u, 'User promoted to admin');
    } catch (e: any) {
      if (e.message === 'Invalid bootstrap secret') return void ResponseUtil.forbidden(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Bootstrap failed');
    }
  }

  // Reset a password (public, secret-gated — recovery when no email flow exists)
  static async resetPassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { email, secret, new_password } = req.body;
      if (!email || !secret || !new_password) {
        ResponseUtil.badRequest(res, 'email, secret and new_password are required');
        return;
      }
      const u = await AdminService.resetPassword(email, secret, new_password);
      ResponseUtil.success(res, { id: u.id, email: u.email }, 'Password reset');
    } catch (e: any) {
      if (e.message === 'Invalid bootstrap secret') return void ResponseUtil.forbidden(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Reset failed');
    }
  }
}
