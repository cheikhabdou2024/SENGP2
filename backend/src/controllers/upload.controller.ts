import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../types';
import { ResponseUtil } from '../utils/response';
import { uploadBuffer, isS3Configured } from '../utils/s3';
import logger from '../utils/logger';
import { detectFileType } from '../utils/fileType';

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

      // The type comes from the file's own bytes, never from the client-declared
      // MIME type or file name (an HTML or SVG file renamed .png must not get in).
      const detected = detectFileType(file.buffer);
      if (!detected) {
        ResponseUtil.badRequest(res, 'Type de fichier non autorisé');
        return;
      }
      const mime = detected.mime;
      const ext = detected.ext;
      const key = `claims/${req.user.id}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;

      await uploadBuffer(key, file.buffer, mime);
      ResponseUtil.success(res, { key }, 'Fichier téléversé');
    } catch (e: any) {
      logger.error('Upload error:', e);
      ResponseUtil.badRequest(res, e.message || 'Téléversement échoué');
    }
  }
}
