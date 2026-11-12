import { Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ProjectPage } from "./pages/Project";
import { Account } from "./pages/Account";
import { Admin } from "./pages/Admin";

function Header() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const user = me.data?.user ?? null;

  async function logout() {
    await api.logout();
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate("/");
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.svg" alt="Верстакофф" className="h-8" />
          <span className="hidden text-sm font-semibold text-neutral-500 sm:block">AI-конструктор</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <NavLink to="/account" className="text-neutral-700 hover:text-brand">
                Мои проекты
              </NavLink>
              <span className="hidden text-neutral-400 sm:block">{user.email}</span>
              <button type="button" onClick={logout} className="btn-ghost">
                Выйти
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="text-neutral-700 hover:text-brand">
                Войти
              </NavLink>
              <Link to="/register" className="btn-primary">
                Начать
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function App() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/project/:id" element={<ProjectPage />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>
      <footer className="border-t border-neutral-200 bg-white py-6 text-center text-xs text-neutral-500">
        Верстакофф · металлическая мебель для производства ·{" "}
        <a href="https://werstakoff.ru" className="hover:text-brand" target="_blank" rel="noreferrer">
          werstakoff.ru
        </a>
      </footer>
    </div>
  );
}
