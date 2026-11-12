import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

const TABS = ["Статистика", "Проекты", "Заказы", "Каталог", "Настройки"] as const;
type Tab = (typeof TABS)[number];

function AdminLogin() {
  const queryClient = useQueryClient();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: api.admin.login,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "me"] }),
  });

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card">
        <h1 className="text-2xl font-bold">Админка</h1>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ login, password });
          }}
        >
          <div>
            <label className="label" htmlFor="login">
              Логин
            </label>
            <input id="login" className="input" value={login} onChange={(event) => setLogin(event.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {mutation.error ? <p className="text-sm text-red-600">{(mutation.error as Error).message}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={mutation.isPending}>
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}

function Stats() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: api.admin.stats });
  if (stats.isLoading) return <p className="text-neutral-500">Загружаем…</p>;
  const data = (stats.data?.stats ?? {}) as Record<string, unknown>;
  const byStep = (data.byStep ?? []) as Array<{ step: string; costRub: number; calls: number }>;

  const cards = [
    ["Проектов", data.projectsTotal],
    ["Заказов", data.ordersTotal],
    ["Пользователей", data.usersTotal],
    ["Расход AI, ₽", Number(data.spendTotalRub ?? 0).toFixed(2)],
    ["Конверсия", `${Math.round(Number(data.conversion ?? 0) * 100)}%`],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="card">
            <p className="text-sm text-neutral-500">{String(label)}</p>
            <p className="mt-1 text-2xl font-bold">{String(value)}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 className="font-bold">Расход по шагам</h3>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">Шаг</th>
              <th>Вызовов</th>
              <th>Стоимость, ₽</th>
            </tr>
          </thead>
          <tbody>
            {byStep.map((row) => (
              <tr key={row.step} className="border-t border-neutral-100">
                <td className="py-2">{row.step}</td>
                <td>{row.calls}</td>
                <td>{row.costRub.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Projects() {
  const projects = useQuery({ queryKey: ["admin", "projects"], queryFn: () => api.admin.projects() });
  return (
    <div className="card overflow-x-auto">
      <h3 className="font-bold">Проекты</h3>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="py-2">Дата</th>
            <th>Клиент</th>
            <th>Статус</th>
            <th>Расход, ₽</th>
            <th>Заказ</th>
          </tr>
        </thead>
        <tbody>
          {projects.data?.projects.map((project) => (
            <tr key={String(project.id)} className="border-t border-neutral-100">
              <td className="py-2">{new Date(String(project.createdAt)).toLocaleString("ru-RU")}</td>
              <td>{String(project.userEmail)}</td>
              <td>{String(project.status)}</td>
              <td>{Number(project.spendRub ?? 0).toFixed(2)}</td>
              <td>{project.order ? String((project.order as { number: string }).number) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Orders() {
  const orders = useQuery({ queryKey: ["admin", "orders"], queryFn: () => api.admin.orders() });
  return (
    <div className="card overflow-x-auto">
      <h3 className="font-bold">Заказы</h3>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="py-2">Номер</th>
            <th>Дата</th>
            <th>Клиент</th>
            <th>Сумма, ₽</th>
          </tr>
        </thead>
        <tbody>
          {orders.data?.orders.map((order) => (
            <tr key={String(order.id)} className="border-t border-neutral-100">
              <td className="py-2">{String(order.number)}</td>
              <td>{new Date(String(order.createdAt)).toLocaleString("ru-RU")}</td>
              <td>{String((order.user as { email?: string } | undefined)?.email ?? "")}</td>
              <td>{Number(order.totalRub ?? 0).toLocaleString("ru-RU")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Catalog() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const variants = useQuery({
    queryKey: ["admin", "variants", search, page],
    queryFn: () => api.admin.variants(search, page),
  });
  const importCatalog = useMutation({
    mutationFn: (body: { scrape: boolean; images: boolean }) => api.admin.importCatalog(body),
  });

  async function update(id: string, body: Record<string, unknown>) {
    await api.admin.updateVariant(id, body);
    await queryClient.invalidateQueries({ queryKey: ["admin", "variants"] });
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <input
          className="input max-w-sm"
          placeholder="Поиск по названию или артикулу"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <button type="button" className="btn-ghost" onClick={() => importCatalog.mutate({ scrape: false, images: false })}>
          Импорт items.json
        </button>
        <button type="button" className="btn-ghost" onClick={() => importCatalog.mutate({ scrape: true, images: true })}>
          Импорт + категории + картинки
        </button>
        {importCatalog.isSuccess ? <span className="text-sm text-green-600">Задача поставлена в очередь</span> : null}
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Каталог</h3>
          <span className="text-sm text-neutral-500">Всего: {variants.data?.total ?? 0}</span>
        </div>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-2">ID</th>
              <th>Название</th>
              <th>Категория</th>
              <th>Цена, ₽</th>
              <th>Габариты</th>
              <th>Активен</th>
            </tr>
          </thead>
          <tbody>
            {variants.data?.variants.map((variant) => (
              <tr key={String(variant.id)} className="border-t border-neutral-100">
                <td className="py-2">{String(variant.externalId)}</td>
                <td className="max-w-xs truncate">{String(variant.name)}</td>
                <td>{String(variant.category)}</td>
                <td>
                  <input
                    type="number"
                    className="input w-28 py-1"
                    defaultValue={Number(variant.priceRub)}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (value !== Number(variant.priceRub)) void update(String(variant.id), { priceRub: value });
                    }}
                  />
                </td>
                <td>
                  <div className="flex gap-1">
                    {(["widthMm", "depthMm", "heightMm"] as const).map((key) => (
                      <input
                        key={key}
                        type="number"
                        title={key === "widthMm" ? "Ширина, мм" : key === "depthMm" ? "Глубина, мм" : "Высота, мм"}
                        className="input w-20 py-1"
                        defaultValue={variant[key] === null || variant[key] === undefined ? "" : Number(variant[key])}
                        onBlur={(event) => {
                          const raw = event.target.value.trim();
                          const value = raw === "" ? null : Number(raw);
                          if (value !== (variant[key] ?? null)) void update(String(variant.id), { [key]: value });
                        }}
                      />
                    ))}
                  </div>
                </td>
                <td>
                  <input
                    type="checkbox"
                    defaultChecked={Boolean(variant.isActive)}
                    onChange={(event) => void update(String(variant.id), { isActive: event.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Назад
          </button>
          <span className="text-sm text-neutral-500">Страница {page}</span>
          <button
            type="button"
            className="btn-ghost"
            disabled={(variants.data?.total ?? 0) <= page * 50}
            onClick={() => setPage(page + 1)}
          >
            Вперёд
          </button>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["admin", "settings"], queryFn: api.admin.settings });
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const value = form ?? (settings.data?.settings as Record<string, unknown> | undefined) ?? {};

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.admin.saveSettings(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }),
  });

  const fields: Array<[string, string, "text" | "number" | "textarea"]> = [
    ["companyName", "Название компании", "text"],
    ["inn", "ИНН", "text"],
    ["kpp", "КПП", "text"],
    ["address", "Адрес", "text"],
    ["phone", "Телефон", "text"],
    ["email", "Email", "text"],
    ["site", "Сайт", "text"],
    ["managerName", "Менеджер", "text"],
    ["offerValidityDays", "Срок действия, дней", "number"],
    ["paymentTerms", "Условия оплаты", "textarea"],
    ["deliveryTerms", "Условия доставки", "textarea"],
    ["disclaimer", "Дисклеймер", "textarea"],
  ];

  return (
    <div className="card">
      <h3 className="font-bold">Реквизиты и тексты PDF</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label, type]) => (
          <div key={key} className={type === "textarea" ? "sm:col-span-2" : ""}>
            <label className="label" htmlFor={key}>
              {label}
            </label>
            {type === "textarea" ? (
              <textarea
                id={key}
                className="input"
                rows={2}
                value={String(value[key] ?? "")}
                onChange={(event) => setForm({ ...value, [key]: event.target.value })}
              />
            ) : (
              <input
                id={key}
                type={type}
                className="input"
                value={String(value[key] ?? "")}
                onChange={(event) =>
                  setForm({ ...value, [key]: type === "number" ? Number(event.target.value) : event.target.value })
                }
              />
            )}
          </div>
        ))}
      </div>
      {save.error ? <p className="mt-3 text-sm text-red-600">{(save.error as Error).message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => save.mutate(value)} disabled={save.isPending}>
          {save.isPending ? "Сохраняем…" : "Сохранить"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            if (window.confirm("Удалить фото и рендеры проектов старше 365 дней? Заказы сохранятся.")) {
              void api.admin.runRetention();
            }
          }}
        >
          Запустить retention (365 дней)
        </button>
      </div>
    </div>
  );
}

export function Admin() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["admin", "me"], queryFn: api.admin.me });
  const [tab, setTab] = useState<Tab>("Статистика");

  if (me.isLoading) return <div className="mx-auto max-w-6xl px-4 py-16 text-neutral-500">Загружаем…</div>;
  if (!me.data?.admin) return <AdminLogin />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Админка</h1>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            await api.admin.logout();
            await queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
          }}
        >
          Выйти
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === item ? "bg-brand text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "Статистика" ? <Stats /> : null}
        {tab === "Проекты" ? <Projects /> : null}
        {tab === "Заказы" ? <Orders /> : null}
        {tab === "Каталог" ? <Catalog /> : null}
        {tab === "Настройки" ? <Settings /> : null}
      </div>
    </div>
  );
}
