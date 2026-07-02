import http from "node:http";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import * as sse from "../src/services/sse.js";
import { broadcast } from "../src/services/sse.js";

async function seedCoin(): Promise<void> {
  await prisma.coin.create({
    data: {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      currentPrice: "50000.00",
      marketCap: "1000000000000.00",
      marketCapRank: 1,
      lastUpdatedUpstream: new Date(),
    },
  });
}

describe("GET /api/events", () => {
  it("responds with an SSE content-type, pushes the initial coins snapshot, and receives broadcasts", async () => {
    await seedCoin();

    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a bound TCP address");
    }
    const port = address.port;

    const req = http.get({ host: "127.0.0.1", port, path: "/api/events" });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("timed out waiting for SSE frames"));
        }, 5_000);

        let buffered = "";
        let sawInitialSnapshot = false;

        req.on("response", (res) => {
          expect(res.headers["content-type"]).toContain("text/event-stream");

          res.on("data", (chunk: Buffer) => {
            buffered += chunk.toString("utf8");

            if (!sawInitialSnapshot && buffered.includes("event: coins")) {
              sawInitialSnapshot = true;
              expect(buffered).toContain("data:");

              // Now exercise a broadcast from the service and confirm this
              // client receives it too.
              buffered = "";
              broadcast("coins", { fromBroadcast: true });
              return;
            }

            if (sawInitialSnapshot && buffered.includes("fromBroadcast")) {
              clearTimeout(timeout);
              expect(buffered).toContain("event: coins");
              expect(buffered).toContain('"fromBroadcast":true');
              resolve();
            }
          });
        });

        req.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } finally {
      req.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("responds 503 with Retry-After when the SSE connection cap is reached", async () => {
    vi.spyOn(sse, "isAtCapacity").mockReturnValue(true);

    const res = await request(createApp()).get("/api/events");

    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("30");
    expect(res.body).toEqual({ error: "server at SSE capacity, retry shortly" });
  });
});
