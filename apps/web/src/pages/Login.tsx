import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: api.login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/account");
    },
  });

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card">
        <h1 className="text-2xl font-bold">Вход</h1>
        <p className="mt-2 text-sm text-neutral-500">Войдите, чтобы продолжить подбор.</p>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate({ email, password });
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
              required
            />
          </div>
          {login.error ? <p className="text-sm text-red-600">{(login.error as Error).message}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={login.isPending}>
            {login.isPending ? "Входим…" : "Войти"}
          </button>
        </form>
        <p className="mt-4 text-sm text-neutral-500">
          Нет аккаунта?{" "}
          <Link to="/register" className="font-semibold text-brand">
            Зарегистрироваться
          </Link>
        </p>
      </div>
    </div>
  );
}
