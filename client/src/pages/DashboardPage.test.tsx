// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import DashboardPage from "./DashboardPage";
import { makeCoin } from "../test/fixtures";

describe("DashboardPage", () => {
  it("renders an error message when error is set", () => {
    render(<DashboardPage coins={[]} isLoading={false} error="boom" />);

    expect(screen.getByText(/Couldn.t load data: boom/)).toBeInTheDocument();
  });

  it("renders a loading message when isLoading is true and there is no error", () => {
    render(<DashboardPage coins={[]} isLoading={true} error={null} />);

    expect(screen.getByText("Loading market data…")).toBeInTheDocument();
  });

  it("renders the coin table when coins is non-empty", () => {
    const coin = makeCoin();

    render(
      <MemoryRouter>
        <DashboardPage coins={[coin]} isLoading={false} error={null} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText(coin.name)).toBeInTheDocument();
    expect(screen.getByText(coin.symbol)).toBeInTheDocument();
  });

  it("renders an empty-state message when coins is empty, not loading, and no error", () => {
    render(<DashboardPage coins={[]} isLoading={false} error={null} />);

    expect(screen.getByText("No coins to display.")).toBeInTheDocument();
  });
});
