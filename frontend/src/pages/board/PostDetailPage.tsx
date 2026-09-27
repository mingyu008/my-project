import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { boardApi, type PostDetail } from "../../api/boardApi";
import { BOARD_MESSAGES, boardErrorMessage, formatDateTime } from "./boardMessages";

type LoadState = { status: "loading" } | { status: "loaded"; post: PostDetail } | { status: "error"; message: string };

export function PostDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) {
      setLoad({ status: "error", message: BOARD_MESSAGES.notFound });
      return;
    }
    const controller = new AbortController();
    boardApi
      .get(id, controller.signal)
      .then((post) => setLoad({ status: "loaded", post }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = boardErrorMessage(e);
        if (message) setLoad({ status: "error", message });
      });
    return () => controller.abort();
  }, [id]);

  async function handleDelete() {
    if (!window.confirm("이 게시글을 삭제할까요?")) return;
    setDeleting(true);
    setActionError(null);
    try {
      await boardApi.remove(id);
      navigate("/posts", { replace: true });
    } catch (e) {
      setActionError(boardErrorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <main className="narrow">
      <nav>
        <Link to="/posts" className="back-link">
          목록으로
        </Link>
      </nav>
      {load.status === "loading" && <p role="status">{BOARD_MESSAGES.loading}</p>}
      {load.status === "error" && <p role="alert">{load.message}</p>}
      {load.status === "loaded" && (
        <article>
          <h1>{load.post.title}</h1>
          <p className="post-meta">
            {load.post.authorLoginIdentifier} · {formatDateTime(load.post.createdAt)}
            {load.post.updatedAt !== load.post.createdAt && ` (수정 ${formatDateTime(load.post.updatedAt)})`}
          </p>
          {/* Plain text only: React escapes it. Never render post content as HTML. */}
          <div data-testid="post-content" className="post-content">
            {load.post.content}
          </div>
          {actionError && <p role="alert">{actionError}</p>}
          {/* Shown to the author/ADMIN for UX; the server re-checks ownership. */}
          {load.post.editable && (
            <div className="post-actions">
              <Link to={`/posts/${load.post.id}/edit`} className="btn secondary">
                수정
              </Link>
              <button type="button" className="danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          )}
        </article>
      )}
    </main>
  );
}
