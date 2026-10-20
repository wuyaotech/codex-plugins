export class MobileSdkError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'MobileSdkError';
  }
}
export function abortError(): MobileSdkError {
  return new MobileSdkError('ABORTED', '操作已取消或会话已变化');
}
