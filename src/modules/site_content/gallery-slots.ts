import type { UploadImageSize } from "../../utils/compress-upload-image";

/** Fixed /gallery boxes — keep in sync with the frontend `gallery-slots.ts`. */
export const GALLERY_SLOTS: Record<number, UploadImageSize> = {
  1: { width: 1272, height: 864 },
  2: { width: 1272, height: 864 },
  3: { width: 1272, height: 888 },
  4: { width: 1272, height: 626 },
  5: { width: 1272, height: 1212 },
  6: { width: 1272, height: 864 },
  7: { width: 1272, height: 906 },
  8: { width: 1272, height: 779 },
  9: { width: 1272, height: 626 },
  10: { width: 1272, height: 1323 },
  11: { width: 1272, height: 864 },
  12: { width: 1272, height: 1323 },
};

export const GALLERY_SLOT_NUMBERS = Object.keys(GALLERY_SLOTS).map(Number);

export function parseGallerySlot(value: unknown) {
  const slot = Number(value);
  return Number.isInteger(slot) && GALLERY_SLOTS[slot] ? slot : null;
}
