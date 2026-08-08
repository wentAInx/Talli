import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerPriceProviderAdapters } from "@/providers/server-factory";
import { PriceRefreshService } from "@/services";

import { withDatabase } from "../../../server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z
  .object({
    force: z.boolean().optional(),
    providers: z
      .array(z.enum(["coingecko", "ecb"]))
      .max(2)
      .optional(),
  })
  .strict();

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

function isSameOriginRequest(request: Request): boolean {
  const rawOrigin = request.headers.get("origin");
  const targetHost =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    firstHeaderValue(request.headers.get("host"));
  const targetProtocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    new URL(request.url).protocol.slice(0, -1);
  if (!rawOrigin || !targetHost || !targetProtocol) return false;
  try {
    const origin = new URL(rawOrigin);
    return origin.origin === `${targetProtocol}://${targetHost}`;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Cross-origin price refresh requests are not allowed." },
      { status: 403 },
    );
  }

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Price refresh request is invalid." },
      { status: 400 },
    );
  }

  try {
    const result = await withDatabase((context) =>
      new PriceRefreshService(
        context,
        createServerPriceProviderAdapters(),
      ).refreshCurrent(input),
    );
    return NextResponse.json(
      { ok: result.failed.length === 0, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Price refresh route failed.",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      {
        ok: false,
        refreshed: [],
        skipped: [],
        failed: [],
        error: "Price refresh could not be completed.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
