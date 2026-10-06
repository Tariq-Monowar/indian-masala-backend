import sharp from "sharp";

const MAX_EDGE = 1920;
const QUALITY = 82;

export type UploadImageSize = {
  width: number;
  height: number;
};

/**
 * Re-encodes any raster upload to WebP.
 * Without `size` the image keeps its ratio (max edge 1920px);
 * with `size` it is cropped to exactly that box, keeping the most important area.
 */
export async function compressUploadToWebp(input: Buffer, size?: UploadImageSize) {
  const image = sharp(input, {
    failOn: "none",
    pages: 1,
    limitInputPixels: 40_000_000,
  }).rotate();

  if (size) {
    image.resize({
      width: size.width,
      height: size.height,
      fit: "cover",
      position: sharp.strategy.attention,
    });
  } else {
    image.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  return image
    .webp({ quality: QUALITY, effort: 4, smartSubsample: true })
    .toBuffer();
}
