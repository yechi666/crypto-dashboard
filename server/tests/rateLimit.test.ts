import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { makeRateLimiter } from "../src/middleware/rateLimit.js";

function makeThrowawayApp() {
  const app = express();
  app.use(makeRateLimiter({ windowMs: 60_000, max: 2 }));
  app.get("/", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe("makeRateLimiter", () => {
  it("allows requests up to the configured max and rejects the next with 429", async () => {
    const app = makeThrowawayApp();

    const first = await request(app).get("/");
    expect(first.status).toBe(200);

    const second = await request(app).get("/");
    expect(second.status).toBe(200);

    const third = await request(app).get("/");
    expect(third.status).toBe(429);
  });

  it("carries standard RateLimit headers", async () => {
    const app = makeThrowawayApp();

    const res = await request(app).get("/");

    expect(res.headers).toHaveProperty("ratelimit");
    expect(res.headers).toHaveProperty("ratelimit-policy");
  });
});

describe("GET /api/coins rate limiting", () => {
  it("includes RateLimit headers, proving the limiter is mounted on the coins route", async () => {
    const res = await request(createApp()).get("/api/coins");

    expect(res.headers).toHaveProperty("ratelimit");
  });
});
