import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { boardApi, type PostPage } from "../../api/boardApi";
import { BOARD_MESSAGES, boardErrorMessage, formatDateTime } from "./boardMessages";

type LoadState = { status: "loading" } | { status: "loaded"; page: PostPage } | { status: "error"; message: string };

function pageFromParams(params: URLSearchParams): number {
  const value = Number(params.get("page") ?? "1");
  return Number.isInteger(value) && value >= 1 ? value - 1 : 0;
}

export function PostListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = pageFromParams(searchParams);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    boardApi
      .list(page, controller.signal)
      .then((result) => setLoad({ status: "loaded", page: result }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = boardErrorMessage(e);
        if (message) setLoad({ status: "error", message });
      });
    return () => controller.abort();
  }, [page]);

  const goTo = (target: number) => setSearchParams(target === 0 ? {} : { page: String(target + 1) });

  return (
    <main>
      <div className="page-header">
        <h1>게시판</h1>
        <nav className="actions">
          <Link to="/" className="btn secondary">
            홈으로
          </Link>
          <Link to="/posts/new" className="btn">
            글쓰기
          </Link>
        </nav>
      </div>

      {load.status === "loading" && <p role="status">{BOARD_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {load.status === "loaded" && load.page.items.length === 0 && <p className="empty">{BOARD_MESSAGES.empty}</p>}
      {load.status === "loaded" && load.page.items.length > 0 && (
        <>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">번호</th>
                <th>제목</th>
                <th>작성자</th>
                <th>작성일</th>
              </tr>
            </thead>
            <tbody>
              {load.page.items.map((post) => (
                <tr key={post.id}>
                  <td className="num">{post.id}</td>
                  <td className="grow">
                    <Link to={`/posts/${post.id}`}>{post.title}</Link>
                  </td>
                  <td>{post.authorLoginIdentifier}</td>
                  <td className="muted">{formatDateTime(post.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <nav aria-label="페이지" className="pagination">
            <button type="button" className="secondary small" onClick={() => goTo(page - 1)} disabled={page === 0}>
              이전
            </button>
            <span>
              {page + 1} / {Math.max(load.page.totalPages, 1)}
            </span>
            <button type="button" className="secondary small" onClick={() => goTo(page + 1)} disabled={page + 1 >= load.page.totalPages}>
              다음
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
