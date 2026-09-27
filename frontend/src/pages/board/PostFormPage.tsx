import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { boardApi, CONTENT_MAX_LENGTH, TITLE_MAX_LENGTH } from "../../api/boardApi";
import { BOARD_MESSAGES, boardErrorMessage } from "./boardMessages";

interface FieldErrors {
  title?: string;
  content?: string;
}

function validate(title: string, content: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!title.trim()) errors.title = BOARD_MESSAGES.titleRequired;
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `제목은 ${TITLE_MAX_LENGTH}자 이하로 입력해 주세요.`;
  if (!content.trim()) errors.content = BOARD_MESSAGES.contentRequired;
  else if (content.length > CONTENT_MAX_LENGTH) errors.content = `내용은 ${CONTENT_MAX_LENGTH}자 이하로 입력해 주세요.`;
  return errors;
}

/**
 * Create (/posts/new) and edit (/posts/:id/edit).
 */
export function PostFormPage() {
  const params = useParams();
  const editId = params.id === undefined ? null : Number(params.id);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(editId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editId === null) return;
    if (!Number.isInteger(editId) || editId < 1) {
      setLoadError(BOARD_MESSAGES.notFound);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    boardApi
      .get(editId, controller.signal)
      .then((post) => {
        if (!post.editable) {
          setLoadError(BOARD_MESSAGES.forbidden);
        } else {
          setTitle(post.title);
          setContent(post.content);
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(boardErrorMessage(e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [editId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const errors = validate(title, content);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.title || errors.content) return;

    setSubmitting(true);
    try {
      const input = { title: title.trim(), content };
      const saved = editId === null ? await boardApi.create(input) : await boardApi.update(editId, input);
      navigate(`/posts/${saved.id}`, { replace: true });
    } catch (e) {
      setFormError(boardErrorMessage(e));
      setSubmitting(false);
    }
  }

  const heading = editId === null ? "글쓰기" : "글 수정";

  if (loading) {
    return (
      <main className="narrow">
        <h1>{heading}</h1>
        <p role="status">{BOARD_MESSAGES.loading}</p>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="narrow">
        <h1>{heading}</h1>
        <p role="alert">{loadError}</p>
        <Link to="/posts">목록으로</Link>
      </main>
    );
  }

  return (
    <main className="narrow">
      <h1>{heading}</h1>
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <div className="field">
          <label htmlFor="title">제목</label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX_LENGTH}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.title)}
          />
          {fieldErrors.title && <p role="alert">{fieldErrors.title}</p>}
        </div>
        <div className="field">
          <label htmlFor="content">내용</label>
          <textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={CONTENT_MAX_LENGTH}
            rows={12}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.content)}
          />
          {fieldErrors.content && <p role="alert">{fieldErrors.content}</p>}
        </div>
        {formError && <p role="alert">{formError}</p>}
        <div className="actions">
          <button type="submit" disabled={submitting}>
            {submitting ? "저장 중..." : "저장"}
          </button>
          <Link to={editId === null ? "/posts" : `/posts/${editId}`} className="btn secondary">
            취소
          </Link>
        </div>
      </form>
    </main>
  );
}
