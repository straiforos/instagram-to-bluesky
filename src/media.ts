import FS from "fs";
import byteSize from "byte-size";
import sharp from "sharp";

import {
  ImageEmbed,
  VideoEmbed,
  ImageEmbedImpl,
  VideoEmbedImpl,
} from "./bluesky";
import { logger } from "./logger";
import { validateVideo } from "./video";
import { processImageBuffer } from "./image";

export interface MediaProcessResult {
  mediaText: string;
  mimeType: string | null;
  mediaBuffer: Buffer | null;
  isVideo: boolean;
}

export interface ProcessedPost {
  postDate: Date | null;
  postText: string;
  embeddedMedia: VideoEmbed | ImageEmbed[];
  mediaCount: number;
}

const MAX_IMAGES_PER_POST = 4;
const POST_TEXT_LIMIT = 300;
const POST_TEXT_TRUNCATE_SUFFIX = "...";
/**
 * Image lexicon maxSize 1mb
 * @link https://github.com/bluesky-social/atproto/blob/f90eedc865136f50a9daee72c52b275d26310aa3/lexicons/app/bsky/embed/images.json#L24
 */
const API_LIMIT_IMAGE_UPLOAD_SIZE = 976000;

export function getMimeType(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case "heic":
      return "image/heic";
    case "webp":
      return "image/webp";
    case "jpg":
      return "image/jpeg";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    default:
      logger.warn("Unsupported file type " + fileType);
      return "";
  }
}

export async function processMedia(
  media: any,
  archiveFolder: string
): Promise<MediaProcessResult> {
  const mediaDate = new Date(media.creation_timestamp * 1000);
  const fileType = media.uri.substring(media.uri.lastIndexOf(".") + 1);
  const mimeType = getMimeType(fileType);
  const mediaFilename = `${archiveFolder}/${media.uri}`;

  let mediaBuffer;
  try {
    mediaBuffer = FS.readFileSync(mediaFilename);
  } catch (error) {
    logger.error({
      message: `Failed to read media file: ${mediaFilename}`,
      error,
    });
    return { mediaText: "", mimeType: null, mediaBuffer: null, isVideo: false };
  }

  /** start spadged's work */
  if (mediaBuffer.length > API_LIMIT_IMAGE_UPLOAD_SIZE && mimeType != "") {
    const processedBuffer = await processImageBuffer(mediaBuffer, mediaFilename);
    if (!processedBuffer) {
      return {
        mediaText: "",
        mimeType: null,
        mediaBuffer: null,
        isVideo: false,
      };
    }
    mediaBuffer = processedBuffer;
  }
  /** end spadged's work */

  let mediaText = media.title ?? "";
  if (media.media_metadata?.photo_metadata?.exif_data?.length > 0) {
    const location = media.media_metadata.photo_metadata.exif_data[0];
    if (location.latitude > 0) {
      mediaText += `\nPhoto taken at these geographical coordinates: geo:${location.latitude},${location.longitude}`;
    }
  }

  const truncatedText =
    mediaText.length > 100 ? mediaText.substring(0, 100) + "..." : mediaText;

  const isVideo = mimeType.startsWith("video/");

  logger.debug({
    message: "Instagram Source Media",
    mimeType,
    mediaFilename,
    Created: `${mediaDate.toISOString()}`,
    Text: truncatedText.replace(/[\r\n]+/g, " ") || "No title",
    Type: isVideo ? "Video" : "Image",
  });

  return { mediaText: truncatedText, mimeType, mediaBuffer, isVideo };
}

export async function processPost(
  post: any,
  archiveFolder: string
): Promise<ProcessedPost> {
  let postDate = post.creation_timestamp
    ? new Date(post.creation_timestamp * 1000)
    : undefined;
  let postText = post.title ?? "";

  if (postText.length > POST_TEXT_LIMIT) {
    postText =
      postText.substring(
        0,
        POST_TEXT_LIMIT - POST_TEXT_TRUNCATE_SUFFIX.length
      ) + POST_TEXT_TRUNCATE_SUFFIX;
  }

  if (!post.media?.length) {
    return {
      postDate: postDate || null,
      postText,
      embeddedMedia: [],
      mediaCount: 0,
    };
  }

  if (post.media.length === 1) {
    postText = postText || post.media[0].title;
    postDate = postDate || new Date(post.media[0].creation_timestamp * 1000);
  }

  let embeddedMedia: VideoEmbed | ImageEmbed[] = [];
  let mediaCount = 0;

  // If first media is video, process only that
  const firstMedia = await processMedia(post.media[0], archiveFolder);
  if (firstMedia.isVideo) {
    if (
      firstMedia.mimeType &&
      firstMedia.mediaBuffer &&
      validateVideo(firstMedia.mediaBuffer)
    ) {
      embeddedMedia = new VideoEmbedImpl(
        firstMedia.mediaText,
        firstMedia.mediaBuffer,
        firstMedia.mimeType
      );
      mediaCount = 1;
    }
    return { postDate: postDate || null, postText, embeddedMedia, mediaCount };
  }

  // Otherwise process images
  for (let j = 0; j < post.media.length; j++) {
    if (j >= MAX_IMAGES_PER_POST) {
      logger.warn(
        "Bluesky does not support more than 4 images per post, excess images will be discarded."
      );
      break;
    }

    const { mediaText, mimeType, mediaBuffer, isVideo } = await processMedia(
      post.media[j],
      archiveFolder
    );

    if (!mimeType || !mediaBuffer || isVideo) continue;

    (embeddedMedia as ImageEmbed[]).push(
      new ImageEmbedImpl(mediaText, mediaBuffer, mimeType)
    );
    mediaCount++;
  }

  return {
    postDate: postDate || null,
    postText,
    embeddedMedia,
    mediaCount,
  };
}
