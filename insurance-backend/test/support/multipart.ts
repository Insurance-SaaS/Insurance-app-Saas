export interface FormFile {
  field: string;
  name: string;
  type: string;
  content: Buffer;
}

/** The smallest content that passes the upload type check for each format. */
export const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a46494600', 'hex'), Buffer.alloc(2048, 1)]);
export const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(1024, 32)]);

/**
 * Builds a multipart/form-data body. A field given as an array is sent once
 * per value, the way a form sends a repeated field.
 */
export function multipartForm(fields: Record<string, string | string[]>, files: FormFile[] = []) {
  const boundary = '----integration-test-form';
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${item}\r\n`),
      );
    }
  }
  for (const file of files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.name}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
      ),
      file.content,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
