import { realpath } from 'node:fs/promises';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function assertInside(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new HttpError(400, 'INVALID_PATH', 'Path is outside the configured static directory');
  }
}

export async function checkedFile(root, relative) {
  const requestedRoot = path.resolve(root);
  const requestedFile = path.resolve(requestedRoot, relative);
  assertInside(requestedRoot, requestedFile);
  const canonicalRoot = await realpath(requestedRoot);
  const canonicalFile = await realpath(requestedFile);
  assertInside(canonicalRoot, canonicalFile);
  return canonicalFile;
}
