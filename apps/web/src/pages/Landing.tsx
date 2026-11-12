import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";

const steps = [
  { title: "Фото помещения", text: "Загрузите одно фото — нейросеть проверит, что это помещение." },
  { title: "Размеры", text: "Подскажем диапазоны по фото, вы подтвердите точные значения." },
  { title: "Вопросы", text: "12 коротких вопросов о задачах, нагрузке и бюджете." },
  { title: "Варианты", text: "Подберём мебель, покажем 3 варианта расстановки и дадим править." },
  { title: "Заказ", text: "Финальное изображение в 4K и PDF с составом заказа." },
];

export function Landing() {
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const create = useMutation({
    mutationFn: api.createProject,
    onSuccess: (data) => navigate(`/project/${data.project.id}`),
  });

  function start() {
    if (!me.data?.user) {
      navigate("/register");
      return;
    }
    create.mutate();
  }

  return (
    <div>
      <section className="bg-brand text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/60">
              Верстакофф · AI-конструктор
            </p>
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">
              Подберите металлическую мебель по фото помещения
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              Загрузите фотографию — нейросеть уберёт лишнее, предложит расстановку стеллажей, верстаков и шкафов,
              покажет фотореалистичный вариант и сформирует заказ с PDF.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={start} className="btn-accent" disabled={create.isPending}>
                {create.isPending ? "Создаём проект…" : "Начать подбор"}
              </button>
              <Link to="/login" className="btn border border-white/30 text-white hover:bg-white/10">
                У меня есть аккаунт
              </Link>
            </div>
            {create.error ? <p className="mt-4 text-sm text-red-200">{(create.error as Error).message}</p> : null}
          </div>
          <div className="rounded-2xl bg-white/10 p-6 backdrop-blur">
            <div className="grid gap-4">
              {steps.map((step, index) => (
                <div key={step.title} className="flex gap-4 rounded-xl bg-white/10 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{step.title}</p>
                    <p className="text-sm text-white/70">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-bold">Что можно подобрать</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Стеллажи", "Архивные, складские, усиленные"],
            ["Верстаки", "Слесарные, модульные, с тумбами"],
            ["Шкафы и тумбы", "Инструментальные, архивные, для СИЗ"],
            ["Тележки", "Инструментальные, для оснастки"],
          ].map(([title, text]) => (
            <div key={title} className="card">
              <p className="font-semibold">{title}</p>
              <p className="mt-1 text-sm text-neutral-500">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
