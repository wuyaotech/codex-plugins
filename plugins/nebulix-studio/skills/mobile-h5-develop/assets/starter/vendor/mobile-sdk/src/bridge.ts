import { abortError, MobileSdkError } from './errors';
import type { MobileBridge } from './types';

/** Real browser APIs only. Missing native features are explicit, never simulated as success. */
export function createBrowserBridge(): MobileBridge {
  return {
    platform: 'browser',
    async capabilities() {
      return { location: typeof navigator !== 'undefined' && !!navigator.geolocation, files: typeof document !== 'undefined', camera: false, scanner: false, native: false };
    },
    getLocation(options = {}) {
      return new Promise((resolve, reject) => {
        if (options.signal?.aborted) return reject(abortError());
        if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new MobileSdkError('UNSUPPORTED', '当前浏览器不支持定位'));
        let finished = false;
        const cleanup = () => options.signal?.removeEventListener('abort', abort);
        const abort = () => { if (!finished) { finished = true; cleanup(); reject(abortError()); } };
        options.signal?.addEventListener('abort', abort, { once: true });
        navigator.geolocation.getCurrentPosition(position => {
          if (finished) return;
          finished = true; cleanup();
          resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp, coordinateSystem: 'WGS84' });
        }, error => {
          if (finished) return;
          finished = true; cleanup();
          reject(new MobileSdkError(error.code === 1 ? 'PERMISSION_DENIED' : error.code === 3 ? 'TIMEOUT' : 'LOCATION_FAILED', error.message));
        }, { enableHighAccuracy: true, timeout: options.timeout ?? 15_000, maximumAge: 0 });
      });
    },
    pickFiles(options = {}) {
      return new Promise((resolve, reject) => {
        if (options.signal?.aborted) return reject(abortError());
        if (typeof document === 'undefined') return reject(new MobileSdkError('UNSUPPORTED', '当前环境无法选择文件'));
        const input = document.createElement('input');
        input.type = 'file'; input.accept = options.accept ?? ''; input.multiple = options.multiple ?? false;
        if (options.capture) input.setAttribute('capture', options.capture);
        input.style.display = 'none';
        let finished = false;
        const finish = (files?: File[], error?: Error) => {
          if (finished) return;
          finished = true; input.remove();
          options.signal?.removeEventListener('abort', abort);
          clearTimeout(timeout);
          if (error) reject(error); else resolve(files ?? []);
        };
        const abort = () => finish(undefined, abortError());
        const timeout = setTimeout(() => finish(undefined, new MobileSdkError('TIMEOUT', '文件选择未完成，请重试')), 120_000);
        input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true });
        input.addEventListener('cancel', () => finish(undefined, new MobileSdkError('CANCELLED', '已取消选择文件')), { once: true });
        options.signal?.addEventListener('abort', abort, { once: true });
        document.body.appendChild(input);
        try { input.click(); } catch (error) { finish(undefined, error instanceof Error ? error : new Error(String(error))); }
      });
    },
    async scan() { throw new MobileSdkError('UNSUPPORTED', '浏览器扫码尚未适配，请使用提供扫码能力的宿主'); },
  };
}
