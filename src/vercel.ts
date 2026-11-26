import type { IncomingMessage, ServerResponse } from "node:http";

export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface VercelResponse extends ServerResponse {
  status(code: number): this;
  json(body: unknown): this;
  send(body: string | Buffer): this;
}
