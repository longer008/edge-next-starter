/**
 * Upload API Tests
 *
 * Tests for the /api/upload endpoint.
 * Note: Due to the complexity of FormData handling and the middleware chain
 * in the test environment, only basic authentication tests are included.
 * Full coverage is provided by integration tests.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/upload/route';
import { NextRequest } from 'next/server';

// Mock auth
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
}));

// Mock R2 client
vi.mock('@/lib/r2/client', () => ({
  uploadFile: vi.fn(),
  downloadFile: vi.fn(),
}));

// Mock rate limiter
vi.mock('@/lib/rate-limiter', () => ({
  checkUploadRateLimit: vi.fn(),
  checkRateLimit: vi.fn(),
}));

// Mock signed URL
vi.mock('@/lib/signed-url', () => ({
  createSignedDownloadUrl: vi.fn(),
  verifySignedUrl: vi.fn(),
}));

// Mock client identifier
vi.mock('@/lib/utils/client-identifier', () => ({
  getClientIdentifier: vi.fn().mockResolvedValue('test-client-id'),
  getAdjustedRateLimit: vi.fn().mockReturnValue({ limit: 30, isStrict: false }),
}));

describe('Upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/upload', () => {
    it('should reject unauthenticated requests', async () => {
      const { auth } = await import('@/lib/auth/config');
      (auth as any).mockResolvedValue(null);

      const formData = new FormData();
      formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('login');
    });

    it('should reject requests exceeding rate limit', async () => {
      const { auth } = await import('@/lib/auth/config');
      const { checkUploadRateLimit } = await import('@/lib/rate-limiter');

      (auth as any).mockResolvedValue({ user: { id: '1' } });
      (checkUploadRateLimit as any).mockResolvedValue({
        allowed: false,
        limit: 10,
        current: 10,
        remaining: 0,
        resetAt: Math.floor(Date.now() / 1000) + 60,
      });

      const formData = new FormData();
      formData.append('file', new Blob(['test content'], { type: 'text/plain' }), 'test.txt');

      const request = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = (await response.json()) as {
        success: boolean;
        error: { message: string };
      };

      expect(response.status).toBe(429);
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('rate limit');
    });
  });

  // Note: Additional upload tests (file validation, successful upload, R2 errors)
  // are skipped because FormData handling in the test environment differs from
  // the actual runtime environment. These scenarios are covered by integration tests.
});
