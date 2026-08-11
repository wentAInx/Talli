import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerPriceProviderAdapters } from "@/providers/server-factory";
import { PriceRefreshService } from "@/services";

import { withDatabase } from "../../../server-runtime";
import { isSameOriginRequest } from "../../same-origin";

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
