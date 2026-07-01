// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import CoinDetailPage from "./index";
import { makeCoin } from "../../test/fixtures";
import type { CoinDto, CoinHistoryResponse } from "../../api/types";
import { formatCurrency } from "../../utils/format";
import { HttpError } from "../../utils/http";

vi.mock("../../api/client", () => ({
  fetchCoinHistory: vi.fn(),
}));

import { fetchCoinHistory } from "../../api/client";

const mockedFetchCoinHistory = vi.mocked(fetchCoinHistory);

function makeHistory(overrides: Partial<CoinHistoryResponse> = {}): CoinHistoryResponse {
  return {
    coin: makeCoin(),
    points: [
      { price: "59000", recordedAt: "2026-07-01T11:30:00.000Z" },
      { price: "59500", recordedAt: "2026-07-01T11:45:00.000Z" },
      { price: "59750.42", recordedAt: "2026-07-01T11:59:00.000Z" },
    ],
    ...overrides,
  };
}

/** Finds the "Latest" stat's value span by walking up from its label. */
function getLatestStatValue() {
  const label = screen.getByText("Latest");
  const stat = label.parentElement;
  if (!stat) throw new Error("Latest stat label has no parent");
  const value = stat.querySelector("span:last-child");
  if (!value) throw new Error("Latest stat value not found");
  return value;
}

function Harness({
  coins,
  ts,
}: {
  coins: CoinDto[];
  ts: string | null;
}) {
  return (
    <MemoryRouter initialEntries={["/coins/bitcoin"]}>
      <Routes>
        <Route
          path="/coins/:id"
          element={<CoinDetailPage coins={coins} lastSuccessfulFetchAt={ts} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function renderHarness(qc: QueryClient, coins: CoinDto[], ts: string | null) {
  return render(
    <QueryClientProvider client={qc}>
      <Harness coins={coins} ts={ts} />
    </QueryClientProvider>,
  );
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("CoinDetailPage", () => {
  afterEach(() => {
    mockedFetchCoinHistory.mockReset();
  });

  it("shows loading then renders history data (stats + sparkline)", async () => {
    const history = makeHistory();
    mockedFetchCoinHistory.mockResolvedValueOnce(history);
    const qc = makeQueryClient();

    renderHarness(qc, [], null);

    expect(screen.getByText("Loading history…")).toBeInTheDocument();

    const lastPoint = history.points[history.points.length - 1];
    await waitFor(() => {
      expect(getLatestStatValue()).toHaveTextContent(formatCurrency(lastPoint.price));
    });

    expect(screen.getByRole("img", { name: /Price sparkline/ })).toBeInTheDocument();
  });

  it("shows a generic error message and a Retry button on a non-404 failure", async () => {
    const user = userEvent.setup();
    mockedFetchCoinHistory.mockRejectedValueOnce(new Error("network down"));
    mockedFetchCoinHistory.mockResolvedValueOnce(makeHistory());
    const qc = makeQueryClient();

    renderHarness(qc, [], null);

    await screen.findByText(/Couldn.t load history: network down/);
    const retryButton = screen.getByRole("button", { name: "Retry" });

    await user.click(retryButton);

    const lastPoint = makeHistory().points.at(-1)!;
    await waitFor(() => {
      expect(getLatestStatValue()).toHaveTextContent(formatCurrency(lastPoint.price));
    });
    expect(mockedFetchCoinHistory).toHaveBeenCalledTimes(2);
  });

  it("shows a Coin not found message on a 404", async () => {
    mockedFetchCoinHistory.mockRejectedValueOnce(new HttpError(404, "Request failed: 404"));
    const qc = makeQueryClient();

    renderHarness(qc, [], null);

    await screen.findByText(/Coin not found/);
  });

  it("merges a live SSE snapshot into the cached history and updates the Latest stat", async () => {
    const oldPrice = "60123.45";
    const newPrice = "61234.56";

    const history = makeHistory({
      points: [
        { price: "59000", recordedAt: "2026-07-01T11:30:00.000Z" },
        { price: oldPrice, recordedAt: "2026-07-01T11:59:00.000Z" },
      ],
    });
    mockedFetchCoinHistory.mockResolvedValueOnce(history);
    const qc = makeQueryClient();

    const { rerender } = renderHarness(qc, [], null);

    await waitFor(() => {
      expect(getLatestStatValue()).toHaveTextContent(formatCurrency(oldPrice));
    });

    const liveCoin = makeCoin({ id: "bitcoin", currentPrice: newPrice });

    rerender(
      <QueryClientProvider client={qc}>
        <Harness coins={[liveCoin]} ts="2026-07-01T12:00:00.000Z" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(getLatestStatValue()).toHaveTextContent(formatCurrency(newPrice));
    });
  });
});
