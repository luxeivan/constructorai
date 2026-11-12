import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WIZARD_QUESTIONS } from "@werstakoff/core";
import { api, type ProjectDetails } from "../api";

const STATUS_LABELS: Record<string, string> = {
  draft: "Загрузите фотографию помещения",
  validating: "Проверяем фотографию",
  rejected: "Фотография не подходит",
  cleaning: "Убираем лишнее с фотографии",
  dimensions: "Уточните размеры помещения",
  wizard: "Ответьте на вопросы",
  selecting: "Подбираем мебель",
  rendering: "Готовим варианты",
  review: "Согласуйте вариант",
  finalizing: "Готовим 4K и заказ",
  done: "Заказ готов",
  failed: "Ошибка",
};

function Progress({ status }: { status: string }) {
  const steps = ["validating", "cleaning", "dimensions", "wizard", "selecting", "rendering", "review", "finalizing", "done"];
  const index = steps.indexOf(status);
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((step, stepIndex) => (
        <span
          key={step}
          className={`badge ${
            stepIndex < index
              ? "bg-green-100 text-green-700"
              : stepIndex === index
                ? "bg-brand text-white"
                : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {STATUS_LABELS[step] ?? step}
        </span>
      ))}
    </div>
  );
}

function PhotoUpload({ projectId, rejected }: { projectId: string; rejected: boolean }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (selected: File) => api.uploadPhoto(projectId, selected),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  return (
    <div className="card">
      <h2 className="text-lg font-bold">{rejected ? "Загрузите другую фотографию" : "Фотография помещения"}</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Одно фото, сделанное с уровня глаз. Нужно видеть пол и хотя бы одну стену длиной от 2 метров.
      </p>

      <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center hover:border-brand">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setPreview(selected ? URL.createObjectURL(selected) : null);
          }}
        />
        {preview ? (
          <img src={preview} alt="" className="max-h-64 rounded-lg object-contain" />
        ) : (
          <>
            <span className="text-3xl">📷</span>
            <span className="mt-2 text-sm font-medium">Выберите фото или сделайте снимок</span>
            <span className="mt-1 text-xs text-neutral-400">JPG, PNG, HEIC · до 15 МБ</span>
          </>
        )}
      </label>

      {upload.error ? <p className="mt-3 text-sm text-red-600">{(upload.error as Error).message}</p> : null}

      <button
        type="button"
        className="btn-primary mt-5 w-full"
        disabled={!file || upload.isPending}
        onClick={() => file && upload.mutate(file)}
      >
        {upload.isPending ? "Загружаем…" : "Отправить фото"}
      </button>
    </div>
  );
}

function DimensionsForm({ project, details }: { project: ProjectDetails; details: ProjectDetails }) {
  const queryClient = useQueryClient();
  const ranges = (project.room?.featuresJson?.ranges ?? {}) as Record<string, string>;
  const [form, setForm] = useState({
    wallLengthMm: project.room?.wallLengthMm ?? 4000,
    widthMm: project.room?.widthMm ?? 3000,
    heightMm: project.room?.heightMm ?? 3000,
    hasWindow: project.room?.hasWindow ?? false,
    hasDoor: project.room?.hasDoor ?? false,
    features: "",
  });

  const save = useMutation({
    mutationFn: () => api.dimensions(project.project.id, form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", project.project.id] }),
  });

  const cleaned = details.photos.find((photo) => photo.kind === "cleaned");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card">
        <h2 className="text-lg font-bold">Размеры помещения</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Нейросеть оценила габариты по фото. Проверьте и введите точные значения в миллиметрах.
        </p>
        {Object.keys(ranges).length > 0 ? (
          <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">
            <p className="font-medium">Подсказка по фото:</p>
            <p>Ширина: {ranges.width ?? "—"}</p>
            <p>Глубина: {ranges.depth ?? "—"}</p>
            <p>Высота: {ranges.height ?? "—"}</p>
          </div>
        ) : null}

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="wall">
                Длина стены, мм
              </label>
              <input
                id="wall"
                type="number"
                min={2000}
                max={30000}
                className="input"
                value={form.wallLengthMm}
                onChange={(event) => setForm({ ...form, wallLengthMm: Number(event.target.value) })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="width">
                Ширина, мм
              </label>
              <input
                id="width"
                type="number"
                min={1000}
                max={30000}
                className="input"
                value={form.widthMm}
                onChange={(event) => setForm({ ...form, widthMm: Number(event.target.value) })}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="height">
                Высота, мм
              </label>
              <input
                id="height"
                type="number"
                min={2000}
                max={30000}
                className="input"
                value={form.heightMm}
                onChange={(event) => setForm({ ...form, heightMm: Number(event.target.value) })}
                required
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hasWindow}
                onChange={(event) => setForm({ ...form, hasWindow: event.target.checked })}
              />
              Есть окно
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.hasDoor}
                onChange={(event) => setForm({ ...form, hasDoor: event.target.checked })}
              />
              Есть дверь
            </label>
          </div>

          <div>
            <label className="label" htmlFor="features">
              Особенности
            </label>
            <textarea
              id="features"
              className="input"
              rows={3}
              placeholder="Выступы, колонны, ниши, ограничения по проходу"
              value={form.features}
              onChange={(event) => setForm({ ...form, features: event.target.value })}
            />
          </div>

          {save.error ? <p className="text-sm text-red-600">{(save.error as Error).message}</p> : null}
          <button type="submit" className="btn-primary" disabled={save.isPending}>
            {save.isPending ? "Сохраняем…" : "Подтвердить размеры"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="font-semibold">Помещение без лишнего</h3>
        {cleaned?.url ? (
          <img src={cleaned.url} alt="Очищенное помещение" className="mt-3 w-full rounded-xl object-cover" />
        ) : (
          <p className="mt-3 text-sm text-neutral-500">Изображение готовится…</p>
        )}
      </div>
    </div>
  );
}

function WizardForm({ projectId, initial }: { projectId: string; initial: Record<string, unknown> }) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial);

  const save = useMutation({
    mutationFn: () => api.wizard(projectId, answers),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  function setValue(key: string, value: unknown) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="card">
      <h2 className="text-lg font-bold">Несколько вопросов</h2>
      <p className="mt-1 text-sm text-neutral-500">Ответы помогут подобрать подходящие серии и нагрузки.</p>

      <div className="mt-6 space-y-6">
        {WIZARD_QUESTIONS.map((question) => {
          const value = answers[question.key];
          return (
            <div key={question.key}>
              <p className="font-medium">{question.title}</p>
              {question.hint ? <p className="text-xs text-neutral-500">{question.hint}</p> : null}

              {question.type === "boolean" ? (
                <div className="mt-2 flex gap-4">
                  {[
                    { label: "Да", value: true },
                    { label: "Нет", value: false },
                  ].map((option) => (
                    <label key={option.label} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={question.key}
                        checked={value === option.value}
                        onChange={() => setValue(question.key, option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              ) : question.type === "multi" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {question.options?.map((option) => {
                    const selected = Array.isArray(value) && value.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          const current = Array.isArray(value) ? [...value] : [];
                          setValue(
                            question.key,
                            selected ? current.filter((item) => item !== option.value) : [...current, option.value],
                          );
                        }}
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          selected ? "border-brand bg-brand text-white" : "border-neutral-300 bg-white text-neutral-700"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {question.options?.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        value === option.value ? "border-brand bg-brand/5" : "border-neutral-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name={question.key}
                        checked={value === option.value}
                        onChange={() => setValue(question.key, option.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {save.error ? <p className="mt-4 text-sm text-red-600">{(save.error as Error).message}</p> : null}
      <button type="button" className="btn-primary mt-6" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Сохраняем…" : "Подобрать мебель"}
      </button>
    </div>
  );
}

function SelectionTable({ selection }: { selection: NonNullable<ProjectDetails["selection"]> }) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">Состав заказа</h3>
        <span className="text-lg font-bold">{selection.totalRub.toLocaleString("ru-RU")} ₽</span>
      </div>
      {selection.layout?.hint ? <p className="mt-1 text-sm text-neutral-500">{selection.layout.hint}</p> : null}
      <div className="mt-4 divide-y divide-neutral-100">
        {selection.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-xs text-neutral-500">
                {item.category} · арт. {item.article} ·{" "}
                {item.widthMm && item.depthMm && item.heightMm
                  ? `${item.widthMm}×${item.depthMm}×${item.heightMm} мм`
                  : "размеры по запросу"}
              </p>
            </div>
            <div className="text-right text-sm">
              <p>{item.qty} шт.</p>
              <p className="text-neutral-500">{item.totalRub.toLocaleString("ru-RU")} ₽</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewBlock({ details }: { details: ProjectDetails }) {
  const queryClient = useQueryClient();
  const projectId = details.project.id;
  const previews = details.renders.filter((render) => render.kind === "preview");
  const [selected, setSelected] = useState<string | null>(previews.find((render) => render.approved)?.id ?? previews[0]?.id ?? null);
  const [correction, setCorrection] = useState("");

  useEffect(() => {
    if (!selected && previews[0]) setSelected(previews[0].id);
  }, [previews, selected]);

  const correct = useMutation({
    mutationFn: () => api.correct(projectId, correction),
    onSuccess: () => {
      setCorrection("");
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });
  const approve = useMutation({
    mutationFn: () => api.approve(projectId, selected!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
  });

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Варианты расстановки</h2>
          <span className="text-sm text-neutral-500">Выберите вариант и согласуйте</span>
        </div>
        {previews.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">Генерируем первый вариант…</p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {previews.map((render) => (
              <button
                key={render.id}
                type="button"
                onClick={() => setSelected(render.id)}
                className={`overflow-hidden rounded-xl border-2 text-left ${
                  selected === render.id ? "border-brand" : "border-transparent"
                }`}
              >
                {render.url ? <img src={render.url} alt="" className="aspect-[3/2] w-full object-cover" /> : null}
                <span className="block px-3 py-2 text-sm font-medium">Вариант {render.variantIndex + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {details.selection ? <SelectionTable selection={details.selection} /> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="font-bold">Что изменить?</h3>
          <p className="mt-1 text-sm text-neutral-500">
            Напишите правку: «убери дальний стеллаж», «добавь шкаф», «поменяй цвет на синий».
          </p>
          <textarea
            className="input mt-4"
            rows={4}
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            placeholder="Опишите, что скорректировать"
          />
          {correct.error ? <p className="mt-2 text-sm text-red-600">{(correct.error as Error).message}</p> : null}
          <button
            type="button"
            className="btn-ghost mt-3"
            disabled={!correction.trim() || correct.isPending}
            onClick={() => correct.mutate()}
          >
            {correct.isPending ? "Применяем…" : "Применить правку"}
          </button>
          {details.corrections.length > 0 ? (
            <div className="mt-4 space-y-1 text-xs text-neutral-500">
              {details.corrections.slice(0, 5).map((item) => (
                <p key={item.id}>• {item.text}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="card flex flex-col justify-between">
          <div>
            <h3 className="font-bold">Всё устраивает?</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Сгенерируем изображение в 4K и PDF с составом заказа.
            </p>
          </div>
          {approve.error ? <p className="mt-2 text-sm text-red-600">{(approve.error as Error).message}</p> : null}
          <button
            type="button"
            className="btn-accent mt-4 w-full"
            disabled={!selected || approve.isPending}
            onClick={() => approve.mutate()}
          >
            {approve.isPending ? "Запускаем…" : "Согласовать и получить заказ"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DoneBlock({ details }: { details: ProjectDetails }) {
  const final = details.renders.find((render) => render.kind === "final");
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Заказ {details.order?.number ?? "готов"}</h2>
            <p className="text-sm text-neutral-500">Изображение в 4K и PDF доступны для скачивания.</p>
          </div>
          <div className="flex gap-2">
            {final?.url ? (
              <a href={final.url} download className="btn-ghost">
                Скачать 4K
              </a>
            ) : null}
            {details.order?.pdfUrl ? (
              <a href={details.order.pdfUrl} target="_blank" rel="noreferrer" className="btn-primary">
                Скачать PDF
              </a>
            ) : null}
          </div>
        </div>
        {final?.url ? <img src={final.url} alt="Финальный вариант" className="mt-5 w-full rounded-xl" /> : null}
      </div>
      {details.selection ? <SelectionTable selection={details.selection} /> : null}
    </div>
  );
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const project = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.project(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.project.status;
      return status && ["validating", "cleaning", "selecting", "rendering", "finalizing"].includes(status) ? 2500 : false;
    },
  });

  useEffect(() => {
    if (!id) return;
    const source = new EventSource(`/api/projects/${id}/events`);
    source.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ["project", id] });
    };
    return () => source.close();
  }, [id, queryClient]);

  if (project.isLoading) return <div className="mx-auto max-w-6xl px-4 py-16 text-neutral-500">Загружаем проект…</div>;
  if (project.error) return <div className="mx-auto max-w-6xl px-4 py-16 text-red-600">{(project.error as Error).message}</div>;
  if (!project.data) return null;

  const details = project.data;
  const status = details.project.status;
  const cleaned = details.photos.find((photo) => photo.kind === "cleaned");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/account" className="text-sm text-neutral-500 hover:text-brand">
            ← Мои проекты
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{details.project.title}</h1>
        </div>
        <Progress status={status} />
      </div>

      {status === "failed" ? (
        <div className="card border-red-200 bg-red-50">
          <h2 className="font-bold text-red-800">Не получилось</h2>
          <p className="mt-1 text-sm text-red-700">{details.project.error ?? "Попробуйте ещё раз."}</p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["project", id] })}
            >
              Обновить
            </button>
            <Link to="/account" className="btn-primary">
              К проектам
            </Link>
          </div>
        </div>
      ) : null}

      {(status === "draft" || status === "rejected") && (
        <div className="space-y-4">
          {status === "rejected" ? (
            <div className="card border-amber-200 bg-amber-50">
              <p className="font-semibold text-amber-900">Перезагрузите фотографию</p>
              <p className="mt-1 text-sm text-amber-800">{details.project.error}</p>
            </div>
          ) : null}
          <PhotoUpload projectId={details.project.id} rejected={status === "rejected"} />
        </div>
      )}

      {status === "validating" || status === "cleaning" ? (
        <div className="card">
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <div>
              <p className="font-semibold">{STATUS_LABELS[status]}</p>
              <p className="text-sm text-neutral-500">Обычно занимает 20–60 секунд.</p>
            </div>
          </div>
          {details.photos.find((photo) => photo.kind === "original")?.url ? (
            <img
              src={details.photos.find((photo) => photo.kind === "original")?.url ?? ""}
              alt=""
              className="mt-5 max-h-80 rounded-xl object-contain"
            />
          ) : null}
        </div>
      ) : null}

      {status === "dimensions" ? <DimensionsForm project={details} details={details} /> : null}

      {status === "wizard" ? <WizardForm projectId={details.project.id} initial={details.answers} /> : null}

      {status === "selecting" ? (
        <div className="card flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <div>
            <p className="font-semibold">Подбираем мебель</p>
            <p className="text-sm text-neutral-500">Проверяем габариты и помещаем позиции в помещение.</p>
          </div>
        </div>
      ) : null}

      {status === "rendering" ? (
        <div className="space-y-6">
          <div className="card flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <div>
              <p className="font-semibold">Готовим варианты расстановки</p>
              <p className="text-sm text-neutral-500">Это занимает до минуты на вариант.</p>
            </div>
          </div>
          {details.selection ? <SelectionTable selection={details.selection} /> : null}
          {details.renders.filter((render) => render.kind === "preview").length > 0 ? (
            <div className="grid gap-4 md:grid-cols-3">
              {details.renders
                .filter((render) => render.kind === "preview")
                .map((render) => (
                  <div key={render.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    {render.url ? <img src={render.url} alt="" className="aspect-[3/2] w-full object-cover" /> : null}
                    <p className="px-3 py-2 text-sm">Вариант {render.variantIndex + 1}</p>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "review" ? <ReviewBlock details={details} /> : null}

      {status === "finalizing" ? (
        <div className="card flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <div>
            <p className="font-semibold">Готовим изображение 4K и PDF</p>
            <p className="text-sm text-neutral-500">Обычно занимает до минуты.</p>
          </div>
        </div>
      ) : null}

      {status === "done" ? <DoneBlock details={details} /> : null}

      {cleaned?.url && ["wizard", "selecting", "rendering", "review"].includes(status) ? (
        <p className="mt-6 text-xs text-neutral-400">Фото очищено нейросетью для визуализации.</p>
      ) : null}
    </div>
  );
}
