import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCsrfToken } from "../../api/client";
import { CSRF_BODY, jsonResponse, mockFetch, requestAt } from "../../test/http";
import { BOARD_MESSAGES } from "./boardMessages";
import { PostDetailPage } from "./PostDetailPage";
import { PostFormPage } from "./PostFormPage";
import { PostListPage } from "./PostListPage";

const POST = {
  id: 5,
  title: "Hello",
  content: "line 1\nline 2",
  authorLoginIdentifier: "alice",
  createdAt: "2026-09-26T00:00:00Z",
  updatedAt: "2026-09-26T00:00:00Z",
  editable: true,
};

function page(items: object[], pageIndex: number, totalPages: number) {
  return { items, page: pageIndex, size: 20, totalElements: items.length, totalPages };
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/posts" element={<PostListPage />} />
        <Route path="/posts/new" element={<PostFormPage key="new" />} />
        <Route path="/posts/:id" element={<PostDetailPage />} />
        <Route path="/posts/:id/edit" element={<PostFormPage key="edit" />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe("board", () => {
  beforeEach(() => clearCsrfToken());
  afterEach(() => vi.unstubAllGlobals());

  describe("list", () => {
    it("loads the page from the URL (1-based) and pages forward", async () => {
      const fetchMock = mockFetch(
        () => jsonResponse(200, page([{ id: 30, title: "Second page post", authorLoginIdentifier: "bob", createdAt: POST.createdAt }], 1, 3)),
        () => jsonResponse(200, page([{ id: 10, title: "Third page post", authorLoginIdentifier: "bob", createdAt: POST.createdAt }], 2, 3)),
      );
      const user = renderAt("/posts?page=2");

      expect(await screen.findByRole("link", { name: "Second page post" })).toHaveAttribute("href", "/posts/30");
      expect(requestAt(fetchMock, 0).url).toMatch(/\/api\/posts\?page=1&size=20$/);
      expect(requestAt(fetchMock, 0).init.credentials).toBe("include");

      await user.click(screen.getByRole("button", { name: "다음" }));

      expect(await screen.findByText("Third page post")).toBeInTheDocument();
      expect(requestAt(fetchMock, 1).url).toMatch(/page=2&size=20$/);
      expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    });

    it("shows an empty state", async () => {
      mockFetch(() => jsonResponse(200, page([], 0, 0)));
      renderAt("/posts");

      expect(await screen.findByText(BOARD_MESSAGES.empty)).toBeInTheDocument();
    });
  });

  describe("detail", () => {
    it("renders content as plain text, never as HTML", async () => {
      const html = "<script>window.__xss = 1</script><img src=x onerror=\"window.__xss=2\">";
      mockFetch(() => jsonResponse(200, { ...POST, content: html }));
      renderAt("/posts/5");

      const content = await screen.findByTestId("post-content");
      expect(content.textContent).toBe(html);
      expect(content.querySelector("script, img")).toBeNull();
      expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
    });

    it("shows edit/delete only when editable", async () => {
      mockFetch(() => jsonResponse(200, { ...POST, editable: false }));
      renderAt("/posts/5");

      await screen.findByRole("heading", { name: "Hello" });
      expect(screen.queryByRole("link", { name: "수정" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
    });

    it("deletes with DELETE + CSRF after confirmation and returns to the list", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const fetchMock = mockFetch(
        () => jsonResponse(200, POST),
        () => jsonResponse(200, CSRF_BODY),
        () => new Response(null, { status: 204 }),
        () => jsonResponse(200, page([], 0, 0)),
      );
      const user = renderAt("/posts/5");

      await user.click(await screen.findByRole("button", { name: "삭제" }));

      expect(await screen.findByRole("heading", { name: "게시판" })).toBeInTheDocument();
      const request = requestAt(fetchMock, 2);
      expect(request.url).toMatch(/\/api\/posts\/5$/);
      expect(request.init.method).toBe("DELETE");
      expect(request.headers["X-XSRF-TOKEN"]).toBe(CSRF_BODY.token);
    });

    it("shows the server's 403 on delete", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      mockFetch(
        () => jsonResponse(200, POST),
        () => jsonResponse(200, CSRF_BODY),
        () => jsonResponse(403, { code: "FORBIDDEN", message: "Access denied" }),
      );
      const user = renderAt("/posts/5");

      await user.click(await screen.findByRole("button", { name: "삭제" }));

      expect(await screen.findByText(BOARD_MESSAGES.forbidden)).toBeInTheDocument();
    });

    it("shows not found", async () => {
      mockFetch(() => jsonResponse(404, { code: "NOT_FOUND", message: "Not found" }));
      renderAt("/posts/999");

      expect(await screen.findByText(BOARD_MESSAGES.notFound)).toBeInTheDocument();
    });
  });

  describe("form", () => {
    it("validates required fields", async () => {
      const fetchMock = mockFetch();
      const user = renderAt("/posts/new");

      await user.click(screen.getByRole("button", { name: "저장" }));

      expect(screen.getByText(BOARD_MESSAGES.titleRequired)).toBeInTheDocument();
      expect(screen.getByText(BOARD_MESSAGES.contentRequired)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("creates a post and opens it", async () => {
      const fetchMock = mockFetch(
        () => jsonResponse(200, CSRF_BODY),
        () => jsonResponse(201, POST),
        () => jsonResponse(200, POST),
      );
      const user = renderAt("/posts/new");

      await user.type(screen.getByLabelText("제목"), "  Hello ");
      await user.type(screen.getByLabelText("내용"), "line 1{enter}line 2");
      await user.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByRole("heading", { name: "Hello" })).toBeInTheDocument();
      const request = requestAt(fetchMock, 1);
      expect(request.url).toMatch(/\/api\/posts$/);
      expect(request.init.method).toBe("POST");
      expect(request.headers["X-XSRF-TOKEN"]).toBe(CSRF_BODY.token);
      expect(JSON.parse(request.init.body as string)).toEqual({ title: "Hello", content: "line 1\nline 2" });
    });

    it("edits an existing post with PUT", async () => {
      const fetchMock = mockFetch(
        () => jsonResponse(200, POST),
        () => jsonResponse(200, CSRF_BODY),
        () => jsonResponse(200, { ...POST, title: "Changed" }),
        () => jsonResponse(200, { ...POST, title: "Changed" }),
      );
      const user = renderAt("/posts/5/edit");

      const title = await screen.findByLabelText("제목");
      expect(title).toHaveValue("Hello");
      await user.clear(title);
      await user.type(title, "Changed");
      await user.click(screen.getByRole("button", { name: "저장" }));

      expect(await screen.findByRole("heading", { name: "Changed" })).toBeInTheDocument();
      expect(requestAt(fetchMock, 2).init.method).toBe("PUT");
      expect(requestAt(fetchMock, 2).url).toMatch(/\/api\/posts\/5$/);
    });

    it("does not offer editing a post the user cannot change", async () => {
      mockFetch(() => jsonResponse(200, { ...POST, editable: false }));
      renderAt("/posts/5/edit");

      expect(await screen.findByText(BOARD_MESSAGES.forbidden)).toBeInTheDocument();
      expect(screen.queryByLabelText("제목")).not.toBeInTheDocument();
    });

    it("shows the server's 403 on save", async () => {
      mockFetch(
        () => jsonResponse(200, POST),
        () => jsonResponse(200, CSRF_BODY),
        () => jsonResponse(403, { code: "FORBIDDEN", message: "Access denied" }),
      );
      const user = renderAt("/posts/5/edit");

      await user.click(await screen.findByRole("button", { name: "저장" }));

      expect(await screen.findByText(BOARD_MESSAGES.forbidden)).toBeInTheDocument();
    });
  });
});
