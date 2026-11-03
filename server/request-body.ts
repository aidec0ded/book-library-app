import type { Readable } from "node:stream";

/** Read a JSON request body. Throws if it can't be read or isn't valid JSON. */
export async function readJsonBody(req: Readable): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
