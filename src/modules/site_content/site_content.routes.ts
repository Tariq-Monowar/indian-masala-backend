import { FastifyInstance } from "fastify";
import { getGallery, removeGallerySlot, updateGallerySlot } from "./site_content.controllers";
import { GALLERY_SLOTS, parseGallerySlot } from "./gallery-slots";
import { verifyUser } from "../../middleware/auth.middleware";

export default async function siteContentRoutes(fastify: FastifyInstance) {
  /*
   * get gallery slots (public)
   * {{_baseUrl}}/api/content/gallery
  */
  fastify.get("/gallery", getGallery);

  /*
   * replace one gallery slot image — multipart field `image`
   * Auth runs on `onRequest` so nothing is written to disk without an admin token.
   * {{_baseUrl}}/api/content/gallery/:slot
  */
  fastify.put(
    "/gallery/:slot",
    {
      onRequest: [verifyUser("admin")],
      config: {
        uploadImageSize: (request) => {
          const slot = parseGallerySlot((request.params as { slot?: string })?.slot);
          return slot ? GALLERY_SLOTS[slot] : null;
        },
      },
    },
    updateGallerySlot,
  );

  /*
   * remove one gallery slot image (slot is hidden on the site until a new upload)
   * {{_baseUrl}}/api/content/gallery/:slot
  */
  fastify.delete(
    "/gallery/:slot",
    {
      onRequest: [verifyUser("admin")],
    },
    removeGallerySlot,
  );
}
