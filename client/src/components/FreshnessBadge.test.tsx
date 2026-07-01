// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import FreshnessBadge from "./FreshnessBadge";

const NOW = new Date("2026-07-01T12:00:00Z");

describe("FreshnessBadge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows Live + updated when status is live and last fetch was recent", () => {
    const threeSecondsAgo = new Date(NOW.getTime() - 3000).toISOString();

    render(
      <FreshnessBadge status="live" connection="connected" lastSuccessfulFetchAt={threeSecondsAgo} />,
    );

    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/Live/);
    expect(status).toHaveTextContent(/updated/);
  });

  it("downgrades to Stale when the last successful fetch is older than STALE_AFTER_MS", () => {
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();

    render(
      <FreshnessBadge status="live" connection="connected" lastSuccessfulFetchAt={fiveMinutesAgo} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/Stale/);
  });

  it("shows Offline when status is error", () => {
    const recentTs = new Date(NOW.getTime() - 1000).toISOString();

    render(<FreshnessBadge status="error" connection="connected" lastSuccessfulFetchAt={recentTs} />);

    expect(screen.getByRole("status")).toHaveTextContent(/Offline/);
  });

  it("shows Connecting… when there is no last fetch yet and the stream is connecting", () => {
    render(<FreshnessBadge status="live" connection="connecting" lastSuccessfulFetchAt={null} />);

    expect(screen.getByRole("status")).toHaveTextContent(/Connecting/);
  });

  it("appends reconnecting when the connection has fallen back to polling", () => {
    const recentTs = new Date(NOW.getTime() - 1000).toISOString();

    render(<FreshnessBadge status="live" connection="polling" lastSuccessfulFetchAt={recentTs} />);

    expect(screen.getByRole("status")).toHaveTextContent(/reconnecting/);
  });
});
