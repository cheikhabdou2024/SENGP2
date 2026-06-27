import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/response';
import { uploadBuffer, isS3Configured } from '../utils/s3';
import logger from '../utils/logger';

export class UploadController {
  /**
   * Upload a file (e.g. a claim voice message) to S3.
   * POST /api/v1/uploads  (multipart, field "file") -> { key }
   */
  static async upload(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) { ResponseUtil.unauthorized(res); return; }
      if (!isS3Configured()) { ResponseUtil.serverError(res, 'Stockage de fichiers non configuré'); return; }
      const file = (req as any).file;
      if (!file || !file.buffer) { ResponseUtil.badRequest(res, 'Aucun fichier reçu'); return; }

      const mime = file.mimetype || 'application/octet-stream';
      if (!/^audio\/|^image\//.test(mime)) {
        ResponseUtil.badRequest(res, 'Type de fichier non autorisé');
        return;
      }
      const ext = (mime.split('/')[1] || 'bin').split(';')[0].replace(/[^a-z0-9]/gi, '') || 'bin';
      const key = `claims/${req.user.id}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

      await uploadBuffer(key, file.buffer, mime);
      ResponseUtil.success(res, { key }, 'Fichier téléversé');
    } catch (e: any) {
      logger.error('Upload error:', e);
      ResponseUtil.badRequest(res, e.message || 'Téléversement échoué');
    }
  }
}
