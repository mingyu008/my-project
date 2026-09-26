import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL, clearCsrfToken } from "../api/client";
import { jsonResponse, mockFetch, requestAt } from "../test/http";
import { GRID_ERROR_MESSAGES, GridPage } from "./GridPage";

const BLOCK = {
  rows: [
    { id: 1, name: "Item 001", category: "Book", price: 1.37, quantity: 7 },
    { id: 2, name: "Item 002", category: "Toy", price: 2.74, quantity: 14 },
  ],
  lastRow: 2,
};

function renderGrid() {
  render(
    <MemoryRouter>
      <GridPage />
    </MemoryRouter>,
  );
}

describe("GridPage", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  it("loads the first block through the common API client and renders rows", async () => {
    const consoleError = vi.spyOn(console, "error");
    const consoleWarn = vi.spyOn(console, "warn");
    const fetchMock = mockFetch(() => jsonResponse(200, BLOCK));

    renderGrid();

    expect(await screen.findByText("Item 001")).toBeInTheDocument();
    const { url, init } = requestAt(fetchMock, 0);
    expect(url).toBe(`${API_BASE_URL}/api/grid/data?startRow=0&endRow=100`);
    expect(init.credentials).toBe("include");
    // AG Grid reports missing modules / invalid options through the console.
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("sends sorting to the server when a header is clicked", async () => {
    const consoleError = vi.spyOn(console, "error");
    const fetchMock = mockFetch(() => jsonResponse(200, BLOCK), () => jsonResponse(200, BLOCK));
    renderGrid();
    await screen.findByText("Item 001");

    await userEvent.setup().click(screen.getByText("이름"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestAt(fetchMock, 1).url).toBe(
      `${API_BASE_URL}/api/grid/data?startRow=0&endRow=100&sortField=name&sortDirection=asc`,
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("shows an error message when the server refuses the data", async () => {
    mockFetch(() => jsonResponse(403, { code: "FORBIDDEN", message: "Access denied" }));

    renderGrid();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(GRID_ERROR_MESSAGES.forbidden));
  });
});
