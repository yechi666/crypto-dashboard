import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAssets, fetchHistory, UpstreamError } from "../src/services/coincap.js";

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("coincap service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchAssets", () => {
    it("maps a realistic assets payload correctly", async () => {
      const mockPayload = {
        timestamp: 1782892129623,
        data: [
          {
            id: "bitcoin",
            rank: "1",
            symbol: "BTC",
            name: "Bitcoin",
            supply: "19800000.0000000000000000",
            maxSupply: "21000000.0000000000000000",
            marketCapUsd: "1153456789012.3400000000000000",
            volumeUsd24Hr: "23456789012.1234567890000000",
            priceUsd: "58684.5012345678901234",
            changePercent24Hr: "1.2345678901234567",
            vwap24Hr: "58000.1234567890123456",
            explorer: "https://blockchain.info/",
            tokens: undefined,
          },
          {
            id: "some-coin",
            rank: "2",
            symbol: "SC",
            name: "Some Coin",
            supply: "1000000",
            maxSupply: null,
            marketCapUsd: "1000000.00",
            volumeUsd24Hr: "",
            priceUsd: "1.00",
            changePercent24Hr: "",
            vwap24Hr: null,
            explorer: null,
          },
          {
            id: "third-coin",
            rank: "3",
            symbol: "TC",
            name: "Third Coin",
            marketCapUsd: "500000.00",
            priceUsd: "2.00",
            // vwap24Hr intentionally omitted (absent, not just null)
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(mockPayload));

      const result = await fetchAssets(3);

      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBe(1782892129623);
      expect(result.coins).toHaveLength(3);

      const btc = result.coins[0];
      expect(btc).toBeDefined();
      expect(btc?.id).toBe("bitcoin");
      expect(btc?.symbol).toBe("BTC");
      expect(btc?.name).toBe("Bitcoin");
      // money fields remain the exact strings
      expect(btc?.currentPrice).toBe("58684.5012345678901234");
      expect(btc?.marketCap).toBe("1153456789012.3400000000000000");
      expect(btc?.volume24h).toBe("23456789012.1234567890000000");
      expect(btc?.marketCapRank).toBe(1);
      expect(typeof btc?.marketCapRank).toBe("number");
      expect(btc?.priceChangePercentage24h).toBeCloseTo(1.2345678901234567);
      expect(typeof btc?.priceChangePercentage24h).toBe("number");
      expect(btc?.vwapUsd24h).toBe("58000.1234567890123456");

      const secondCoin = result.coins[1];
      // missing/empty volume maps to null
      expect(secondCoin?.volume24h).toBeNull();
      expect(secondCoin?.priceChangePercentage24h).toBeNull();
      // null vwap24Hr maps to null
      expect(secondCoin?.vwapUsd24h).toBeNull();

      const thirdCoin = result.coins[2];
      // absent vwap24Hr key also maps to null
      expect(thirdCoin?.vwapUsd24h).toBeNull();
    });

    it("builds the request URL with limit and auth header", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ timestamp: 1, data: [] }));

      await fetchAssets(50);

      expect(fetch).toHaveBeenCalledTimes(1);
      const [urlArg, initArg] = vi.mocked(fetch).mock.calls[0] ?? [];
      expect(String(urlArg)).toContain("/assets");
      expect(String(urlArg)).toContain("limit=50");
      const headers = (initArg as RequestInit | undefined)?.headers as
        Record<string, string> | undefined;
      expect(headers?.Authorization).toMatch(/^Bearer /);
    });

    it.each([401, 429, 500])(
      "classifies HTTP %d as an UpstreamError with kind http",
      async (status) => {
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, { ok: false, status }));
        vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, { ok: false, status }));

        await expect(fetchAssets()).rejects.toMatchObject({
          kind: "http",
          status,
        });
        await expect(fetchAssets()).rejects.toBeInstanceOf(UpstreamError);
      },
    );

    it("classifies an AbortSignal timeout as kind timeout", async () => {
      const timeoutError = new Error("The operation timed out");
      timeoutError.name = "TimeoutError";
      vi.mocked(fetch).mockRejectedValueOnce(timeoutError);

      await expect(fetchAssets()).rejects.toMatchObject({ kind: "timeout" });
    });

    it("classifies an AbortError as kind timeout", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      vi.mocked(fetch).mockRejectedValueOnce(abortError);

      await expect(fetchAssets()).rejects.toMatchObject({ kind: "timeout" });
    });

    it("classifies a generic network failure as kind network", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));

      await expect(fetchAssets()).rejects.toMatchObject({ kind: "network" });
    });

    it("classifies a malformed body (missing data) as kind parse", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ timestamp: 123 }));

      await expect(fetchAssets()).rejects.toMatchObject({ kind: "parse" });
    });

    it("classifies a malformed body (data not an array) as kind parse", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ timestamp: 123, data: "oops" }));

      await expect(fetchAssets()).rejects.toMatchObject({ kind: "parse" });
    });

    it("classifies invalid JSON as kind parse", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected token")),
      } as Response);

      await expect(fetchAssets()).rejects.toMatchObject({ kind: "parse" });
    });
  });

  describe("fetchHistory", () => {
    it("maps history points to price/recordedAt", async () => {
      const mockPayload = {
        data: [
          {
            priceUsd: "58684.5",
            time: 1782892129623,
            date: "2026-07-01T07:48:49.623Z",
            circulatingSupply: 0,
          },
          {
            priceUsd: "58700.1",
            time: 1782892189623,
            date: "2026-07-01T07:49:49.623Z",
            circulatingSupply: 0,
          },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(mockPayload));

      const points = await fetchHistory("bitcoin", 1782892129623, 1782892189623);

      expect(points).toHaveLength(2);
      expect(points[0]?.price).toBe("58684.5");
      expect(points[0]?.recordedAt).toBeInstanceOf(Date);
      expect(points[0]?.recordedAt.getTime()).toBe(1782892129623);
      expect(points[1]?.price).toBe("58700.1");
      expect(points[1]?.recordedAt.getTime()).toBe(1782892189623);
    });

    it("builds the request URL with interval/start/end", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [] }));

      await fetchHistory("ethereum", 1000, 2000);

      const [urlArg] = vi.mocked(fetch).mock.calls[0] ?? [];
      const url = String(urlArg);
      expect(url).toContain("/assets/ethereum/history");
      expect(url).toContain("interval=m1");
      expect(url).toContain("start=1000");
      expect(url).toContain("end=2000");
    });

    it("classifies HTTP errors for history requests", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 404 }));

      await expect(fetchHistory("unknown-coin", 1000, 2000)).rejects.toMatchObject({
        kind: "http",
        status: 404,
      });
    });
  });
});
