import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

describe("GET /api/health", () => {
  it("returns ok (liveness, no DB access)", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/health/ready", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with database up, regardless of freshness (no data block)", async () => {
    // No FetchLog rows seeded — readiness must still be 200 because it gates
    // only on DB reachability, not on data freshness.
    const res = await request(createApp()).get("/api/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", checks: { database: "up" } });
    expect(res.body.data).toBeUndefined();
  });

  it("returns 503 when the database is unreachable", async () => {
    const healthRepo = await import("../src/repositories/healthRepo.js");
    vi.spyOn(healthRepo, "pingDatabase").mockResolvedValue(false);

    const res = await request(createApp()).get("/api/health/ready");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unhealthy", checks: { database: "down" } });
  });
});

describe("GET /api/health/freshness", () => {
  it("reports live (200) with a recent successful fetch", async () => {
    await prisma.fetchLog.create({
      data: {
        source: "coincap",
        status: "SUCCEEDED",
        finishedAt: new Date(),
      },
    });

    const res = await request(createApp()).get("/api/health/freshness");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("live");
    expect(typeof res.body.lastSuccessfulFetchAt).toBe("string");
    expect(res.body.lastSuccessfulFetchAt).not.toBeNull();
  });

  it("reports error (200) with null timestamp when no fetch has ever succeeded", async () => {
    const res = await request(createApp()).get("/api/health/freshness");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "error", lastSuccessfulFetchAt: null });
  });
});
