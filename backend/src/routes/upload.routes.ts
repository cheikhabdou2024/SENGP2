import { Router } from 'express';
import multer from 'multer';
import { UploadController } from '../controllers/upload.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

const router = Router();

router.use(AuthMiddleware.verifyToken);
router.post('/', upload.single('file'), UploadController.upload);

export default router;
