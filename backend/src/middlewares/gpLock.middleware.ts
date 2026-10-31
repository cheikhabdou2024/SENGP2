import { Response, NextFunction } from 'express';
import { AuthRequest, UserType } from '../types';
import { MissionDeliveryService } from '../services/mission-delivery.service';

/** Blocks a GP (HTTP 423) while the admin has not validated the end of their scan. */
export async function requireGpUnlocked(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user && req.user.user_type === UserType.GP && (await MissionDeliveryService.isGpLocked(req.user.id))) {
      res.status(423).json({ success: false, error: "Accès suspendu : en attente de la validation de l'administration." });
      return;
    }
    next();
  } catch (e) { next(); }
}
