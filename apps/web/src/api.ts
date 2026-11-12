export type ApiErrorPayload = { error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "INTERNAL", status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `Ошибка ${response.status}`;
    let code = "INTERNAL";
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      message = payload.error?.message ?? message;
      code = payload.error?.code ?? code;
    } catch {
      // ignore
    }
    throw new ApiError(message, code, response.status);
  }

  return (await response.json()) as T;
}

export type User = { id: string; email: string };

export type ProjectListItem = {
  id: string;
  title: string;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  coverUrl: string | null;
  previewUrl: string | null;
  orderId: string | null;
};

export type ProjectDetails = {
  project: { id: string; title: string; status: string; error: string | null; createdAt: string; updatedAt: string };
  photos: Array<{ id: string; kind: string; url: string | null; width: number | null; height: number | null }>;
  room: {
    roomType: string | null;
    wallLengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    hasWindow: boolean;
    hasDoor: boolean;
    featuresJson: { ranges?: Record<string, string>; features?: Record<string, unknown> } | null;
    confirmedByUser: boolean;
  } | null;
  answers: Record<string, unknown>;
  selection: {
    id: string;
    version: number;
    totalRub: number;
    layout: { hint?: string; fillRatio?: number; warnings?: string[] } | null;
    items: Array<{
      id: string;
      variantId: string;
      qty: number;
      unitPriceRub: number;
      totalRub: number;
      name: string;
      article: string;
      category: string;
      widthMm: number | null;
      depthMm: number | null;
      heightMm: number | null;
      imageUrl: string | null;
    }>;
  } | null;
  renders: Array<{ id: string; kind: string; variantIndex: number; url: string | null; approved: boolean; createdAt: string }>;
  corrections: Array<{ id: string; text: string; createdAt: string }>;
  order: {
    id: string;
    number: string;
    totalRub: number;
    pdfUrl: string | null;
    items: Array<{ id: string; name: string; article: string; qty: number; priceRub: number }>;
  } | null;
};

export const api = {
  me: () => request<{ user: User | null }>("/api/auth/me"),
  register: (body: { email: string; password: string; consent: boolean }) =>
    request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  deleteMe: () => request<{ ok: boolean }>("/api/auth/me", { method: "DELETE" }),

  projects: () => request<{ projects: ProjectListItem[] }>("/api/projects"),
  createProject: () => request<{ project: { id: string; status: string } }>("/api/projects", { method: "POST" }),
  project: (id: string) => request<ProjectDetails>(`/api/projects/${id}`),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return request<{ status: string }>(`/api/projects/${id}/photo`, { method: "POST", body: form });
  },
  dimensions: (id: string, body: Record<string, unknown>) =>
    request<{ status: string }>(`/api/projects/${id}/dimensions`, { method: "POST", body: JSON.stringify(body) }),
  wizard: (id: string, answers: Record<string, unknown>) =>
    request<{ status: string }>(`/api/projects/${id}/wizard`, { method: "POST", body: JSON.stringify(answers) }),
  render: (id: string) => request<{ status: string }>(`/api/projects/${id}/render`, { method: "POST" }),
  correct: (id: string, text: string) =>
    request<{ status: string }>(`/api/projects/${id}/corrections`, { method: "POST", body: JSON.stringify({ text }) }),
  approve: (id: string, renderId: string) =>
    request<{ status: string }>(`/api/projects/${id}/approve`, { method: "POST", body: JSON.stringify({ renderId }) }),

  orders: () => request<{ orders: Array<Record<string, unknown>> }>("/api/orders"),

  admin: {
    me: () => request<{ admin: { id: string; login: string } | null }>("/api/admin/me"),
    login: (body: { login: string; password: string }) =>
      request<{ admin: { id: string; login: string } }>("/api/admin/login", { method: "POST", body: JSON.stringify(body) }),
    logout: () => request<{ ok: boolean }>("/api/admin/logout", { method: "POST" }),
    stats: () => request<{ stats: Record<string, unknown> }>("/api/admin/stats"),
    projects: (page = 1) => request<{ total: number; projects: Array<Record<string, unknown>> }>(`/api/admin/projects?page=${page}`),
    project: (id: string) => request<{ project: Record<string, unknown> }>(`/api/admin/projects/${id}`),
    orders: (page = 1) => request<{ total: number; orders: Array<Record<string, unknown>> }>(`/api/admin/orders?page=${page}`),
    categories: () => request<{ categories: Array<Record<string, unknown>> }>("/api/admin/catalog/categories"),
    variants: (search = "", page = 1) =>
      request<{ total: number; variants: Array<Record<string, unknown>> }>(
        `/api/admin/catalog/variants?search=${encodeURIComponent(search)}&page=${page}`,
      ),
    updateVariant: (id: string, body: Record<string, unknown>) =>
      request<{ variant: Record<string, unknown> }>(`/api/admin/catalog/variants/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    settings: () => request<{ settings: Record<string, unknown> }>("/api/admin/settings"),
    saveSettings: (body: Record<string, unknown>) =>
      request<{ settings: Record<string, unknown> }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }),
    importCatalog: (body: { scrape: boolean; images: boolean }) =>
      request<{ status: string }>("/api/admin/catalog/import", { method: "POST", body: JSON.stringify(body) }),
    runRetention: () => request<{ status: string }>("/api/admin/retention/run", { method: "POST" }),
  },
};
