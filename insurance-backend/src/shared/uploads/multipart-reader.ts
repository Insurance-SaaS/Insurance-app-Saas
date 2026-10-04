import { BadRequestException, HttpException, PayloadTooLargeException } from '@nestjs/common';
import { UploadedFile } from 'src/shared/types/uploaded-file';

export interface MultipartUpload {
  /** Text fields. A field sent several times becomes an array. */
  fields: Record<string, string | string[]>;
  files: UploadedFile[];
}

export interface MultipartOptions {
  /** Form field(s) that may carry files; files under any other name are discarded. */
  fileFields: string[];
  maxFiles: number;
  maxFileBytes?: number;
  /** Which kinds of file are accepted. */
  accept: 'images' | 'images-and-pdf';
}

const MB = 1024 * 1024;

/** Largest single file accepted by default (UPLOAD_MAX_FILE_MB, default 15). */
export function defaultMaxFileBytes(): number {
  return (Number.parseInt(process.env.UPLOAD_MAX_FILE_MB || '', 10) || 15) * MB;
}

/** File types recognised by their first bytes; the name and declared type are not trusted. */
function sniff(head: Buffer): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  if (
    head.length >= 12 &&
    head.subarray(0, 4).toString('latin1') === 'RIFF' &&
    head.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

const ACCEPTED: Record<MultipartOptions['accept'], { types: string[]; label: string }> = {
  images: { types: ['image/jpeg', 'image/png', 'image/webp'], label: 'a JPG, PNG or WEBP image' },
  'images-and-pdf': {
    types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    label: 'a JPG, PNG or WEBP image or a PDF',
  },
};

/**
 * Reads a multipart request: text fields plus files. This is the one place the
 * application parses uploads.
 *
 * Limits are enforced while reading: the request is refused as soon as there is
 * one file too many, one byte too many, or content that is not of an accepted
 * type, without buffering the rest. The returned mimetype is the detected one.
 */
export async function readMultipart(request: any, options: MultipartOptions): Promise<MultipartUpload> {
  if (!request.isMultipart?.()) {
    throw new BadRequestException('Request must be multipart/form-data');
  }

  const limits = {
    maxFileBytes: options.maxFileBytes ?? defaultMaxFileBytes(),
    accepted: ACCEPTED[options.accept],
  };
  // No prototype: a field named "constructor" or "__proto__" is just a field.
  const fields: MultipartUpload['fields'] = Object.create(null);
  const files: UploadedFile[] = [];

  try {
    for await (const part of request.parts()) {
      const name = String(part.fieldname ?? '').trim();

      if (part.type === 'field') {
        addField(fields, name, String(part.value ?? ''));
      } else if (!options.fileFields.includes(name)) {
        part.file.resume(); // discard files we did not ask for
      } else if (files.length >= options.maxFiles) {
        throw new BadRequestException(`Maximum ${options.maxFiles} file(s) allowed per request`);
      } else {
        files.push(await readFile(part, name, limits));
      }
    }
  } catch (error) {
    throw asClientError(error);
  }

  return { fields, files };
}

/**
 * The multipart parser refuses some forms itself (a field named like an object
 * internal, too many parts, a part over its limit) with an error that carries
 * a 4xx status. Those are the client's mistakes and are answered as such.
 */
function asClientError(error: unknown): unknown {
  if (error instanceof HttpException) {
    return error;
  }
  const { statusCode, message } = (error ?? {}) as { statusCode?: unknown; message?: string };
  const isClientStatus = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500;
  return isClientStatus ? new HttpException(message || 'Invalid form data', statusCode) : error;
}

/** A field sent once is a string; sent several times, the list of its values. */
function addField(fields: MultipartUpload['fields'], name: string, value: string): void {
  if (!(name in fields)) {
    fields[name] = value;
    return;
  }
  const existing = fields[name];
  fields[name] = Array.isArray(existing) ? [...existing, value] : [existing, value];
}

/** Buffers one file, stopping at the first byte too many or at content of the wrong type. */
async function readFile(
  part: any,
  fieldname: string,
  limits: { maxFileBytes: number; accepted: { types: string[]; label: string } },
): Promise<UploadedFile> {
  const notAccepted = () =>
    new BadRequestException(`"${part.filename}" is not ${limits.accepted.label}`);
  const chunks: Buffer[] = [];
  let size = 0;
  let mimetype: string | null = null;

  for await (const chunk of part.file as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > limits.maxFileBytes) {
      throw new PayloadTooLargeException(
        `"${part.filename}" is larger than ${Math.floor(limits.maxFileBytes / MB)} MB`,
      );
    }
    chunks.push(chunk);
    // The type is decided once, as soon as enough bytes have arrived.
    if (mimetype === null && size >= 12) {
      mimetype = sniff(Buffer.concat(chunks));
      if (!mimetype || !limits.accepted.types.includes(mimetype)) {
        throw notAccepted();
      }
    }
  }
  if (!mimetype) {
    throw notAccepted();
  }

  const buffer = Buffer.concat(chunks);
  return {
    fieldname,
    originalname: String(part.filename ?? 'file'),
    encoding: part.encoding || '7bit',
    mimetype,
    buffer,
    size: buffer.length,
  };
}

/** The single value of a text field (the first one if it was sent several times). */
export function fieldValue(fields: MultipartUpload['fields'], name: string): string | undefined {
  const value = fields[name];
  return Array.isArray(value) ? value[0] : value;
}
