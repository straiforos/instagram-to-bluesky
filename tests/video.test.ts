import { validateVideo, getVideoDimensions } from '../src/video';
import fs from 'fs';
import path from 'path';
import { isVideoMimeType, getVideoMimeType } from '../src/video';

describe('Video Processing', () => {
  describe('validateVideo', () => {
    test('should reject videos larger than 100MB', () => {
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024); // 101MB
      expect(validateVideo(largeBuffer)).toBe(false);
    });

    test('should accept videos smaller than 100MB', () => {
      const smallBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      expect(validateVideo(smallBuffer)).toBe(true);
    });
  });

  describe('getVideoDimensions', () => {
    test('should get correct dimensions from test video', async () => {
      const testVideoPath = path.join(__dirname, '../transfer/test_videos/AQM8KYlOYHTF5GlP43eMroHUpmnFHJh5CnCJUdRUeqWxG4tNX7D43eM77F152vfi4znTzgkFTTzzM4nHa_v8ugmP4WPRJtjKPZX5pko_17845940218109367.mp4');
      const dimensions = await getVideoDimensions(testVideoPath);
      expect(dimensions).toEqual({
        width: 640,
        height: 640
      });
    });
  });

  describe('Video Utils', () => {
    describe('isVideoMimeType', () => {
      test('should return true for video mime types', () => {
        expect(isVideoMimeType('video/mp4')).toBe(true);
        expect(isVideoMimeType('video/quicktime')).toBe(true);
      });

      test('should return false for non-video mime types', () => {
        expect(isVideoMimeType('image/jpeg')).toBe(false);
        expect(isVideoMimeType('application/json')).toBe(false);
        expect(isVideoMimeType('')).toBe(false);
      });
    });

    describe('getVideoMimeType', () => {
      test('should return correct mime type for supported video formats', () => {
        expect(getVideoMimeType('mp4')).toBe('video/mp4');
        expect(getVideoMimeType('mov')).toBe('video/quicktime');
      });

      test('should handle case-insensitive file extensions', () => {
        expect(getVideoMimeType('MP4')).toBe('video/mp4');
        expect(getVideoMimeType('MOV')).toBe('video/quicktime');
      });

      test('should return empty string for unsupported formats', () => {
        expect(getVideoMimeType('avi')).toBe('');
        expect(getVideoMimeType('wmv')).toBe('');
        expect(getVideoMimeType('')).toBe('');
      });
    });
  });
}); 