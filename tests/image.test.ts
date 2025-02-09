import { isImageMimeType, getImageMimeType, isImageTooLarge, processImageBuffer } from '../src/image';
import { logger } from '../src/logger';
import sharp from 'sharp';

jest.mock('../src/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
}));

// Create a partial mock of Sharp
jest.mock('sharp', () => {
  const sharpInstance = {
    metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
    resize: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.alloc(500000))
  };
  return jest.fn().mockImplementation(() => sharpInstance);
});

describe('Image Utils', () => {
  describe('isImageMimeType', () => {
    test('should return true for image mime types', () => {
      expect(isImageMimeType('image/jpeg')).toBe(true);
      expect(isImageMimeType('image/png')).toBe(true);
      expect(isImageMimeType('image/webp')).toBe(true);
    });

    test('should return false for non-image mime types', () => {
      expect(isImageMimeType('video/mp4')).toBe(false);
      expect(isImageMimeType('application/json')).toBe(false);
      expect(isImageMimeType('')).toBe(false);
    });
  });

  describe('getImageMimeType', () => {
    test('should return correct mime type for supported image formats', () => {
      expect(getImageMimeType('jpg')).toBe('image/jpeg');
      expect(getImageMimeType('jpeg')).toBe('image/jpeg');
      expect(getImageMimeType('png')).toBe('image/png');
      expect(getImageMimeType('webp')).toBe('image/webp');
      expect(getImageMimeType('heic')).toBe('image/heic');
    });

    test('should handle case-insensitive file extensions', () => {
      expect(getImageMimeType('JPG')).toBe('image/jpeg');
      expect(getImageMimeType('PNG')).toBe('image/png');
    });

    test('should return empty string for unsupported formats', () => {
      expect(getImageMimeType('gif')).toBe('');
      expect(getImageMimeType('bmp')).toBe('');
      expect(getImageMimeType('')).toBe('');
    });
  });

  describe('isImageTooLarge', () => {
    test('should return true for buffers larger than limit', () => {
      const largeBuffer = Buffer.alloc(1000000); // 1MB
      expect(isImageTooLarge(largeBuffer)).toBe(true);
    });

    test('should return false for buffers within limit', () => {
      const smallBuffer = Buffer.alloc(900000); // 900KB
      expect(isImageTooLarge(smallBuffer)).toBe(false);
    });

    test('should handle edge case at exactly the limit', () => {
      const exactBuffer = Buffer.alloc(976000);
      expect(isImageTooLarge(exactBuffer)).toBe(false);
    });
  });

  describe('processImageBuffer', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return original buffer if size is within limit', async () => {
      const smallBuffer = Buffer.alloc(900000);
      const result = await processImageBuffer(smallBuffer, 'test.jpg');
      expect(result).toBe(smallBuffer);
    });

    test('should process and resize large images', async () => {
      const largeBuffer = Buffer.alloc(1000000);
      const result = await processImageBuffer(largeBuffer, 'test.jpg');
      expect(result).not.toBeNull();
      expect(sharp).toHaveBeenCalled();
    });

    test('should handle metadata errors', async () => {
      const mockSharp = sharp as jest.MockedFunction<typeof sharp>;
      const mockInstance = {
        metadata: jest.fn().mockRejectedValue(new Error('Metadata error')),
        resize: jest.fn(),
        toBuffer: jest.fn()
      };
      mockSharp.mockImplementationOnce(() => mockInstance as any);

      const buffer = Buffer.alloc(1000000);
      const result = await processImageBuffer(buffer, 'test.jpg');
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });

    test('should handle image metadata errors', async () => {
      const mockSharp = sharp as jest.MockedFunction<typeof sharp>;
      const mockInstance = {
        metadata: jest.fn().mockResolvedValue({ width: undefined, height: undefined }),
        resize: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Resize error'))
      };
      mockSharp.mockImplementationOnce(() => mockInstance as any);

      const buffer = Buffer.alloc(1000000);
      const result = await processImageBuffer(buffer, 'test.jpg');
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalled();
    });
  });
}); 