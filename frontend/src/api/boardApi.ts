import { apiClient } from "./client";

// Mirrors server limits (Post.TITLE_MAX_LENGTH, Post.CONTENT_MAX_LENGTH, PostService.MAX_PAGE_SIZE).
export const TITLE_MAX_LENGTH = 200;
export const CONTENT_MAX_LENGTH = 10_000;
export const PAGE_SIZE = 20;

export interface PostSummary {
  id: number;
  title: string;
  authorLoginIdentifier: string;
  createdAt: string;
}

/**
 * {@code content} is plain text: render it as text only, never as HTML.
 */
export interface PostDetail {
  id: number;
  title: string;
  content: string;
  authorLoginIdentifier: string;
  createdAt: string;
  updatedAt: string;
  /** UX hint only; the server re-checks ownership on update/delete. */
  editable: boolean;
}

export interface PostPage {
  items: PostSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface PostInput {
  title: string;
  content: string;
}

export const boardApi = {
  list(page: number, signal?: AbortSignal): Promise<PostPage> {
    const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
    return apiClient.get<PostPage>(`/api/posts?${params.toString()}`, signal);
  },

  get(id: number, signal?: AbortSignal): Promise<PostDetail> {
    return apiClient.get<PostDetail>(`/api/posts/${id}`, signal);
  },

  create(input: PostInput): Promise<PostDetail> {
    return apiClient.post<PostDetail>("/api/posts", input);
  },

  update(id: number, input: PostInput): Promise<PostDetail> {
    return apiClient.put<PostDetail>(`/api/posts/${id}`, input);
  },

  remove(id: number): Promise<void> {
    return apiClient.delete<void>(`/api/posts/${id}`);
  },
};
