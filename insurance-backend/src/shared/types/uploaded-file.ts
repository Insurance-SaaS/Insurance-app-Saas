/**
 * Framework-agnostic uploaded file interface.
 * Replaces Express.Multer.File — works with both Fastify multipart and Express multer.
 */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  destination?: string;
  filename?: string;
  path?: string;
}
