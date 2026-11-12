import type { Readable } from "node:stream";

/** Largest request body the server reads. A chat message is far smaller; the cap keeps a huge body from filling memory. */
export const MAX_BODY_BYTES = 100 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
  }
}

/** Read a request body, stopping as soon as it passes `maxBytes`. */
export async function readRawBody(req: Readable, maxBytes = MAX_BODY_BYTES): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      req.destroy();
      throw new BodyTooLargeError();
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Read a JSON request body. Throws BodyTooLargeError past the size cap, or if it isn't valid JSON. */
export async function readJsonBody(req: Readable, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  return JSON.parse((await readRawBody(req, maxBytes)).toString());
}
