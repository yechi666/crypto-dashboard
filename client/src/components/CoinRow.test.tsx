// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import CoinRow from "./CoinRow";
import { makeCoin } from "../test/fixtures";
import { formatCompactCurrency, formatCurrency, formatPercent } from "../utils/format";

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderRow(coin = makeCoin()) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <LocationDisplay />
      <table>
        <tbody>
          <CoinRow coin={coin} />
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

describe("CoinRow", () => {
  it("renders formatted cells and identifying text", () => {
    const coin = makeCoin();
    renderRow(coin);

    expect(screen.getByText(coin.symbol)).toBeInTheDocument();
    expect(screen.getByText(coin.name)).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(coin.currentPrice))).toBeInTheDocument();
    expect(screen.getByText(formatPercent(coin.priceChangePercentage24h))).toBeInTheDocument();
    expect(screen.getByText(formatCompactCurrency(coin.marketCap))).toBeInTheDocument();
    expect(screen.getByText(formatCompactCurrency(coin.volume24h))).toBeInTheDocument();
  });

  it("navigates to the coin detail route when the row is clicked", async () => {
    const user = userEvent.setup();
    const coin = makeCoin();
    renderRow(coin);

    const row = screen.getByRole("link", { name: new RegExp(`View ${coin.name} history`) });
    await user.click(row);

    expect(screen.getByTestId("location")).toHaveTextContent(`/coins/${coin.id}`);
  });

  it("navigates when Enter is pressed while the row is focused", async () => {
    const user = userEvent.setup();
    const coin = makeCoin();
    renderRow(coin);

    const row = screen.getByRole("link", { name: new RegExp(`View ${coin.name} history`) });
    row.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("location")).toHaveTextContent(`/coins/${coin.id}`);
  });
});
