import { Response } from 'express';
import { AdminService } from '../services/admin.service';
import { WithdrawalService } from '../services/withdrawal.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../types';
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
      ResponseUtil.success(res, r, 'User deleted');
    } catch (e: any) {
      if (e.message === 'User not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Delete failed');
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
      ResponseUtil.success(res, m, 'Mission updated');
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Update failed');
    }
  }
  static async deleteMission(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.deleteMission(req.params.id);
      ResponseUtil.success(res, r, 'Mission deleted');
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Delete failed');
    }
  }
  static async assignMission(req: AuthRequest, res: Response): Promise<void> {
    try {
      const m = await AdminService.assignMission(req.params.id, req.body.gp_id);
      ResponseUtil.success(res, m, 'Mission assigned and GP notified');
    } catch (e: any) {
      if (e.message === 'Mission not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Assignment failed');
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
      ResponseUtil.success(res, r, 'Trip deleted');
    } catch (e: any) {
      if (e.message && e.message.includes('not found')) return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Delete failed');
    }
  }

  // Payments
  static async listPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
      const r = await AdminService.listPayments(listParams(req));
      ResponseUtil.success(res, r.data, undefined, r.pagination);
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Failed'); }
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
      ResponseUtil.success(res, w, 'Withdrawal approved');
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Approve failed'); }
  }
  static async rejectWithdrawal(req: AuthRequest, res: Response): Promise<void> {
    try {
      const w = await WithdrawalService.reject(req.params.id, req.user!.id, req.body.reason || 'Rejected by admin');
      ResponseUtil.success(res, w, 'Withdrawal rejected');
    } catch (e: any) { ResponseUtil.badRequest(res, e.message || 'Reject failed'); }
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
      ResponseUtil.success(res, c, 'Claim updated');
    } catch (e: any) {
      if (e.message === 'Claim not found') return void ResponseUtil.notFound(res, e.message);
      ResponseUtil.badRequest(res, e.message || 'Update failed');
    }
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
}
