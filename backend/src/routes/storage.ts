import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const router = Router();

const s3Client = process.env.R2_ACCESS_KEY_ID ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
}) : null;

// Ensure the local upload folder exists (routing to writeable /tmp in serverless)
const isServerless = !!process.env.VERCEL;
const uploadDir = isServerless ? '/tmp' : path.join(__dirname, '../../public/uploads');

if (!isServerless && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Disk Storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit matching PRD
});

// POST /api/storage/upload — Upload media file locally for dev env, or Cloudflare R2 in production
router.post('/upload', requireAuth, upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    if (s3Client && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL) {
      const fileStream = fs.readFileSync(file.path);
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const key = `${uniqueSuffix}-${file.originalname}`;

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: fileStream,
        ContentType: file.mimetype,
      }));

      // Delete the temp local file after upload
      fs.unlinkSync(file.path);

      const fileUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
      return res.status(200).json({
        url: fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype
      });
    }

    // Fallback: local uploads for dev mode
    const fileUrl = `http://localhost:5000/uploads/${file.filename}`;
    return res.status(200).json({
      url: fileUrl,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype
    });
  } catch (err) {
    console.error('Error in file upload:', err);
    return res.status(500).json({ error: 'Internal server error uploading file' });
  }
});

export default router;
