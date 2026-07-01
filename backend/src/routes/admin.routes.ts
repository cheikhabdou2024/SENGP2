import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { UserType } from '../types';

const router = Router();

// Public, secret-gated: promote a user to admin (first-admin bootstrap).
router.post('/bootstrap', AdminController.bootstrap);

// Everything below requires an authenticated ADMIN.
router.use(AuthMiddleware.verifyToken);
router.use(AuthMiddleware.requireRole(UserType.ADMIN));

router.get('/stats', AdminController.stats);

router.get('/users', AdminController.listUsers);
router.put('/users/:id', AdminController.updateUser);
router.delete('/users/:id', AdminController.deleteUser);

router.get('/missions', AdminController.listMissions);
router.put('/missions/:id', AdminController.updateMission);
router.post('/missions/:id/assign', AdminController.assignMission);
router.post('/missions/:id/confirm-arrival', AdminController.confirmArrival);
router.delete('/missions/:id', AdminController.deleteMission);

router.get('/trips', AdminController.listTrips);
router.delete('/trips/:id', AdminController.deleteTrip);

router.get('/payments', AdminController.listPayments);

router.get('/withdrawals', AdminController.listWithdrawals);
router.put('/withdrawals/:id/approve', AdminController.approveWithdrawal);
router.put('/withdrawals/:id/reject', AdminController.rejectWithdrawal);

router.get('/claims', AdminController.listClaims);
router.put('/claims/:id', AdminController.updateClaim);

export default router;
