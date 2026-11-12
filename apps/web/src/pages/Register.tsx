import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function Register() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);

  const register = useMutation({
    mutationFn: api.register,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/account");
    },
  });

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card">
        <h1 className="text-2xl font-bold">Регистрация</h1>
        <p className="mt-2 text-sm text-neutral-500">Один аккаунт — все ваши проекты и заказы.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate({ email, password, consent });
          }}
        >
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
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
              minLength={8}
              required
            />
            <p className="mt-1 text-xs text-neutral-500">Минимум 8 символов.</p>
          </div>
          <label className="flex items-start gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              required
            />
            <span>Согласен на обработку персональных данных и хранение фотографий.</span>
          </label>
          {register.error ? <p className="text-sm text-red-600">{(register.error as Error).message}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={register.isPending}>
            {register.isPending ? "Создаём аккаунт…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className="mt-4 text-sm text-neutral-500">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="font-semibold text-brand">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}
