import sharp from "sharp";

const MAX_EDGE = 1920;
const QUALITY = 82;

export async function compressUploadToWebp(input: Buffer) {
  return sharp(input, {
    failOn: "none",
    pages: 1,
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY, effort: 4, smartSubsample: true })
    .toBuffer();
}
