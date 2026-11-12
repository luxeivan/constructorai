import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  validating: "Проверяем фото",
  rejected: "Фото не подходит",
  cleaning: "Убираем лишнее",
  dimensions: "Размеры",
  wizard: "Вопросы",
  selecting: "Подбор",
  rendering: "Генерация",
  review: "Согласование",
  finalizing: "Финал",
  done: "Готово",
  failed: "Ошибка",
};

export function Account() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: (data) => navigate(`/project/${data.project.id}`),
  });
  const deleteMe = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate("/");
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Мои проекты</h1>
        <button type="button" className="btn-primary" onClick={() => create.mutate()} disabled={create.isPending}>
          Новый подбор
        </button>
      </div>

      {projects.isLoading ? <p className="mt-8 text-neutral-500">Загружаем…</p> : null}
      {projects.data?.projects.length === 0 ? (
        <div className="card mt-8 text-center">
          <p className="font-semibold">Пока нет проектов</p>
          <p className="mt-1 text-sm text-neutral-500">Загрузите фото помещения и начните подбор.</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.data?.projects.map((project) => (
          <Link key={project.id} to={`/project/${project.id}`} className="card group hover:border-brand">
            <div className="flex items-center justify-between">
              <span className="badge bg-neutral-100 text-neutral-700">{STATUS_LABELS[project.status] ?? project.status}</span>
              <span className="text-xs text-neutral-400">{new Date(project.createdAt).toLocaleDateString("ru-RU")}</span>
            </div>
            <div className="mt-4 aspect-[3/2] overflow-hidden rounded-xl bg-neutral-100">
              {project.previewUrl || project.coverUrl ? (
                <img
                  src={project.previewUrl ?? project.coverUrl ?? ""}
                  alt=""
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-neutral-400">Нет изображения</div>
              )}
            </div>
            <p className="mt-4 font-semibold">{project.title}</p>
            {project.error ? <p className="mt-1 text-xs text-red-600">{project.error}</p> : null}
          </Link>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-red-200 bg-red-50 p-6">
        <h2 className="font-semibold text-red-800">Удаление данных</h2>
        <p className="mt-1 text-sm text-red-700">
          Удалим фотографии, сгенерированные изображения и проекты. Заказы останутся обезличенными.
        </p>
        <button
          type="button"
          className="btn mt-4 bg-red-600 text-white hover:bg-red-700"
          onClick={() => {
            if (window.confirm("Удалить все данные? Действие необратимо.")) deleteMe.mutate();
          }}
          disabled={deleteMe.isPending}
        >
          {deleteMe.isPending ? "Удаляем…" : "Удалить мои данные"}
        </button>
      </div>
    </div>
  );
}
