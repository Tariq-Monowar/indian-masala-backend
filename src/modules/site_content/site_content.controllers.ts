import fs from "fs";
import path from "path";
import { FileService, uploads } from "../../config/storage.config";
import {
  GALLERY_SLOTS,
  GALLERY_SLOT_NUMBERS,
  parseGallerySlot,
} from "./gallery-slots";
import {
  deleteGalleryImage,
  findGalleryImage,
  listGalleryImages,
  saveGalleryImage,
  type GalleryImageRow,
} from "./site_content.db";

function shapeSlot(slot: number, row: GalleryImageRow | null | undefined) {
  return {
    slot,
    width: GALLERY_SLOTS[slot].width,
    height: GALLERY_SLOTS[slot].height,
    image: row?.image ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export const getGallery = async (request, reply) => {
  try {
    const rows = await listGalleryImages();
    const existing = rows.filter((row) => fs.existsSync(path.join(uploads, row.image)));
    const bySlot = new Map(existing.map((row) => [row.slot, row]));

    return reply.status(200).send({
      success: true,
      data: GALLERY_SLOT_NUMBERS.map((slot) => shapeSlot(slot, bySlot.get(slot))),
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateGallerySlot = async (request, reply) => {
  const uploaded = request.body?.image;
  const files = uploaded ? [].concat(uploaded) : [];

  try {
    const slot = parseGallerySlot(request.params?.slot);
    if (!slot) {
      FileService.removeFiles(files);
      return reply.status(400).send({
        success: false,
        message: "Invalid gallery slot",
      });
    }

    if (files.length !== 1 || typeof files[0] !== "string") {
      FileService.removeFiles(files);
      return reply.status(400).send({
        success: false,
        message: "Upload exactly one image in the `image` field",
      });
    }

    const previous = await findGalleryImage(slot);
    const saved = await saveGalleryImage(slot, files[0]);
    if (previous && previous !== files[0]) {
      FileService.removeFile(previous);
    }

    return reply.status(200).send({
      success: true,
      data: shapeSlot(slot, saved),
    });
  } catch (error) {
    FileService.removeFiles(files);
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};

export const removeGallerySlot = async (request, reply) => {
  try {
    const slot = parseGallerySlot(request.params?.slot);
    if (!slot) {
      return reply.status(400).send({
        success: false,
        message: "Invalid gallery slot",
      });
    }

    const previous = await findGalleryImage(slot);
    await deleteGalleryImage(slot);
    if (previous) FileService.removeFile(previous);

    return reply.status(200).send({
      success: true,
      data: shapeSlot(slot, null),
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      success: false,
      message: "Internal server error",
    });
  }
};
