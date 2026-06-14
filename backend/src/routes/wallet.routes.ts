import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(AuthMiddleware.verifyToken);

router.get('/me', WalletController.getMyWallet);
router.get('/transactions', WalletController.getTransactions);

export default router;
