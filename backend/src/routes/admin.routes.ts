import { Router, RequestHandler } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { UserType } from '../types';
import { RateLimitMiddleware } from '../middlewares/rateLimit.middleware';
import { ResponseUtil } from '../utils/response';

/** Status values the database accepts, per listing (an unknown one used to end in a SQL error). */
export const LIST_STATUSES = {
  users: ['pending', 'verified', 'suspended', 'deleted'],
  missions: ['pending', 'matched', 'accepted', 'picked_up', 'in_transit', 'in_customs', 'out_for_delivery', 'delivered', 'cancelled', 'disputed'],
  trips: ['draft', 'published', 'active', 'completed', 'cancelled'],
  payments: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
  withdrawals: ['pending', 'approved', 'processing', 'completed', 'rejected', 'cancelled'],
  claims: ['open', 'in_progress', 'resolved', 'rejected', 'closed'],
} as const;

const knownStatus = (list: readonly string[], param = 'status'): RequestHandler => (req, res, next) => {
  const s = req.query[param];
  if (s !== undefined && s !== '' && !list.includes(String(s))) {
    ResponseUtil.badRequest(res, `Invalid ${param} filter: ${String(s)}`);
    return;
  }
  next();
};

const router = Router();
const { requirePermission } = AuthMiddleware;

// Public, secret-gated: promote a user to admin (first-admin bootstrap).
router.post('/bootstrap', RateLimitMiddleware.secretGate, AdminController.bootstrap);
// Public, secret-gated: reset a user's password (recovery, no email flow).
router.post('/reset-password', RateLimitMiddleware.secretGate, AdminController.resetPassword);

// Everything below requires an authenticated ADMIN…
router.use(AuthMiddleware.verifyToken);
router.use(AuthMiddleware.requireRole(UserType.ADMIN));
// …and, per route, the matching fine-grained permission.

// The signed-in admin's own permission set (used by the UI to gate sections).
router.get('/me/permissions', AdminController.myPermissions);

// Overview counts + activity are the landing view for every admin (no extra permission).
router.get('/stats', AdminController.stats);
router.get('/activity', AdminController.activity);

// Analytics
router.get('/analytics/timeseries', requirePermission('analytics:read'), AdminController.analyticsTimeseries);
router.get('/analytics/top-routes', requirePermission('analytics:read'), AdminController.analyticsTopRoutes);
router.get('/analytics/gp-performance', requirePermission('analytics:read'), AdminController.analyticsGpPerformance);
router.get('/analytics/payment-methods', requirePermission('analytics:read'), AdminController.analyticsPaymentMethods);

router.get('/users', requirePermission('users:read'), knownStatus(LIST_STATUSES.users), AdminController.listUsers);
router.get('/users/export', requirePermission('users:read'), knownStatus(LIST_STATUSES.users), AdminController.exportUsers);
router.get('/users/status-series', requirePermission('users:read'), AdminController.userStatusSeries);
router.post('/users', requirePermission('users:write'), AdminController.createUser);
router.get('/users/:id', requirePermission('users:read'), AdminController.getUserDetail);
router.put('/users/:id', requirePermission('users:write'), AdminController.updateUser);
router.put('/users/:id/role', requirePermission('roles:manage'), AdminController.setUserRole);
router.delete('/users/:id', requirePermission('users:delete'), AdminController.deleteUser);

// KYC / identity verification
router.get('/kyc/queue', requirePermission('users:verify'), AdminController.listKyc);
router.post('/kyc/:id/approve', requirePermission('users:verify'), AdminController.approveKyc);
router.post('/kyc/:id/reject', requirePermission('users:verify'), AdminController.rejectKyc);

router.get('/missions', requirePermission('missions:read'), knownStatus(LIST_STATUSES.missions), AdminController.listMissions);
router.get('/missions/export', requirePermission('missions:read'), knownStatus(LIST_STATUSES.missions), AdminController.exportMissions);
router.get('/missions/status-series', requirePermission('missions:read'), AdminController.missionStatusSeries);
router.get('/missions/:id', requirePermission('missions:read'), AdminController.getMissionDetail);
router.put('/missions/:id', requirePermission('missions:write'), AdminController.updateMission);
router.post('/missions/:id/assign', requirePermission('missions:assign'), AdminController.assignMission);
router.get('/matching', requirePermission('missions:assign'), AdminController.getMatching);
router.post('/assignments', requirePermission('missions:assign'), AdminController.bulkAssign);
router.post('/missions/:id/reassign', requirePermission('missions:assign'), AdminController.reassignMission);
router.post('/missions/:id/confirm-arrival', requirePermission('missions:write'), AdminController.confirmArrival);
router.get('/scan-reviews', requirePermission('missions:read'), AdminController.listScanReviews);
router.post('/gps/:id/release', requirePermission('missions:write'), AdminController.releaseGp);
router.delete('/missions/:id', requirePermission('missions:delete'), AdminController.deleteMission);

router.get('/trips', requirePermission('trips:read'), knownStatus(LIST_STATUSES.trips), knownStatus(['missing', 'pending', 'approved', 'rejected'], 'ticket_status'), AdminController.listTrips);
router.get('/trips/export', requirePermission('trips:read'), knownStatus(LIST_STATUSES.trips), AdminController.exportTrips);
router.get('/trips/status-series', requirePermission('trips:read'), AdminController.tripStatusSeries);
router.get('/trips/:id', requirePermission('trips:read'), AdminController.getTripDetail);
router.put('/trips/:id', requirePermission('trips:write'), AdminController.updateTrip);
router.post('/trips/:id/ticket-review', requirePermission('trips:write'), AdminController.reviewTripTicket);
router.delete('/trips/:id', requirePermission('trips:delete'), AdminController.deleteTrip);

router.get('/payments', requirePermission('payments:read'), knownStatus(LIST_STATUSES.payments), AdminController.listPayments);
router.get('/payments/export', requirePermission('payments:export'), knownStatus(LIST_STATUSES.payments), AdminController.exportPayments);
router.post('/payments/:id/refund', requirePermission('payments:refund'), AdminController.refundPayment);

router.get('/withdrawals', requirePermission('withdrawals:read'), knownStatus(LIST_STATUSES.withdrawals), AdminController.listWithdrawals);
router.get('/withdrawals/export', requirePermission('withdrawals:read'), knownStatus(LIST_STATUSES.withdrawals), AdminController.exportWithdrawals);
router.put('/withdrawals/:id/approve', requirePermission('withdrawals:approve'), AdminController.approveWithdrawal);
router.put('/withdrawals/:id/reject', requirePermission('withdrawals:approve'), AdminController.rejectWithdrawal);
router.put('/withdrawals/:id/paid', requirePermission('withdrawals:payout'), AdminController.payWithdrawal);

router.get('/claims', requirePermission('claims:read'), knownStatus(LIST_STATUSES.claims), AdminController.listClaims);
router.get('/claims/:id/thread', requirePermission('claims:read'), AdminController.claimThread);
router.post('/claims/:id/reply', requirePermission('claims:write'), AdminController.replyClaim);
router.post('/claims/:id/compensate', requirePermission('claims:write'), AdminController.compensateClaim);
router.put('/claims/:id', requirePermission('claims:write'), AdminController.updateClaim);

// Reviews moderation
router.get('/reviews', requirePermission('reviews:read'), AdminController.listReviews);
router.delete('/reviews/:id', requirePermission('reviews:moderate'), AdminController.deleteReview);

// Roles & RBAC administration
router.get('/roles', requirePermission('roles:read'), AdminController.listRoles);
router.post('/roles', requirePermission('roles:manage'), AdminController.createRole);
router.put('/roles/:id', requirePermission('roles:manage'), AdminController.updateRole);
router.delete('/roles/:id', requirePermission('roles:manage'), AdminController.deleteRole);

// Audit log
router.get('/audit', requirePermission('audit:read'), AdminController.listAudit);

// Broadcast (mass notifications)
router.post('/broadcast', requirePermission('broadcast:send'), AdminController.broadcast);

// Platform settings
router.get('/settings', requirePermission('settings:read'), AdminController.getSettings);
router.put('/settings', requirePermission('settings:write'), AdminController.updateSettings);

export default router;
