import { getMimeType, processMedia, processPost } from "../src/media";
import { getImageMimeType } from "../src/image";
import { getVideoMimeType } from "../src/video";
import path from "path";
import fs from "fs";

// Mock the file system
jest.mock("fs", () => ({
  readFileSync: jest.fn(),
}));

// Mock the logger to avoid console noise during tests
jest.mock("../src/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the video validation
jest.mock("../src/video", () => ({
  validateVideo: jest.fn().mockReturnValue(true),
  getVideoDimensions: jest.fn().mockResolvedValue({ width: 640, height: 480 }),
  getVideoMimeType: jest.fn(),
  isVideoMimeType: jest.fn()
}));

// Add mocks for image and video mime type handlers
jest.mock("../src/image", () => ({
  getImageMimeType: jest.fn(),
  processImageBuffer: jest.fn(),
  isImageTooLarge: jest.fn()
}));

describe("Media Processing", () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    // Setup default mock for readFileSync
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from("test"));
    (getImageMimeType as jest.Mock).mockImplementation((type) => {
      if (type.toLowerCase() === 'jpg') return 'image/jpeg';
      return '';
    });
    (getVideoMimeType as jest.Mock).mockImplementation((type) => {
      if (type.toLowerCase() === 'mp4') return 'video/mp4';
      return '';
    });
  });

  describe("getMimeType", () => {
    test("should try image mime type handler first", () => {
      getMimeType("jpg");
      expect(getImageMimeType).toHaveBeenCalledWith("jpg");
      expect(getVideoMimeType).not.toHaveBeenCalled();
    });

    test("should try video mime type handler if image returns empty", () => {
      getMimeType("mp4");
      expect(getImageMimeType).toHaveBeenCalledWith("mp4");
      expect(getVideoMimeType).toHaveBeenCalledWith("mp4");
    });

    test("should handle case-insensitive extensions", () => {
      getMimeType("JPG");
      expect(getImageMimeType).toHaveBeenCalledWith("JPG");
    });

    test("should return empty string when neither handler recognizes the type", () => {
      const result = getMimeType("xyz");
      expect(getImageMimeType).toHaveBeenCalledWith("xyz");
      expect(getVideoMimeType).toHaveBeenCalledWith("xyz");
      expect(result).toBe("");
    });
  });

  describe("processMedia", () => {
    const testMedia = {
      uri: "test.mp4",
      creation_timestamp: Date.now() / 1000,
      title: "Test Media",
      media_metadata: {
        photo_metadata: {
          exif_data: [
            {
              latitude: 45.5,
              longitude: -122.5,
            },
          ],
        },
      },
    };

    test("should process video media file correctly", async () => {
      const result = await processMedia(
        testMedia,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.mimeType).toBe("video/mp4");
      expect(result.isVideo).toBe(true);
      expect(result.mediaBuffer).toBeTruthy();
      expect(result.mediaText).toContain("Test Media");
      expect(result.mediaText).toContain("geo:45.5,-122.5");
    });

    test("should handle missing media file", async () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error("File not found");
      });

      const result = await processMedia(
        testMedia,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.mimeType).toBeNull();
      expect(result.mediaBuffer).toBeNull();
    });
  });

  describe("processPost", () => {
    const testPost = {
      creation_timestamp: Date.now() / 1000,
      title: "Test Post",
      media: [
        {
          uri: "test.mp4",
          creation_timestamp: Date.now() / 1000,
          title: "Test Media",
        },
      ],
    };

    test("should process post correctly", async () => {
      const result = await processPost(
        testPost,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe("Test Post");
      // Video media should only be a single embedded object.
      expect(Array.isArray(result.embeddedMedia)).toBe(false);
      expect(result.mediaCount).toBe(1);
    });

    test("should handle post with no media", async () => {
      const emptyPost = {
        creation_timestamp: Date.now() / 1000,
        title: "Empty Post",
        media: [],
      };

      const result = await processPost(
        emptyPost,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe("Empty Post");
      expect(result.embeddedMedia).toHaveLength(0);
      expect(result.mediaCount).toBe(0);
    });

    test("should truncate long post text", async () => {
      const longPost = {
        creation_timestamp: Date.now() / 1000,
        title: "A".repeat(400), // Create a string longer than POST_TEXT_LIMIT
        media: [],
      };

      const result = await processPost(
        longPost,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.postText.length).toBeLessThanOrEqual(300);
      expect(result.postText.endsWith("...")).toBe(true);
    });

    test("should handle post with jpg media as array", async () => {
      const jpgPost = {
        creation_timestamp: Date.now() / 1000,
        title: "Image Post",
        media: [
          {
            uri: "test.jpg",
            creation_timestamp: Date.now() / 1000,
            title: "Test Image",
          },
        ],
      };

      const result = await processPost(
        jpgPost,
        path.join(__dirname, "../transfer/test_videos")
      );

      expect(result.postDate).toBeTruthy();
      expect(result.postText).toBe("Image Post");
      // Image media should be an array
      expect(Array.isArray(result.embeddedMedia)).toBe(true);
      expect(result.embeddedMedia).toHaveLength(1);
      expect(result.mediaCount).toBe(1);
    });
  });
});
