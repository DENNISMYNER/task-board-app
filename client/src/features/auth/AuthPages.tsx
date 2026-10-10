import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Button } from "../../components/ui/Button";
import { TextField } from "../../components/ui/Field";
import { StatusRing } from "../../components/ui/StatusRing";
import { ApiError } from "../../lib/api";
import type { StatusCategory } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { useAuth } from "./useAuth";

const LADDER: Array<{ category: StatusCategory; name: string }> = [
  { category: "BACKLOG", name: "Backlog" },
  { category: "UNSTARTED", name: "Todo" },
  { category: "STARTED", name: "In progress" },
  { category: "COMPLETED", name: "Done" },
];

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className="grid flex-1 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* The status ladder: the one idea the product is built on, shown before you sign in. */}
      <aside className="hidden flex-col justify-between border-r border-line bg-surface p-12 md:flex">
        <p className="font-display text-xl font-semibold">Task Board</p>
        <ol className="flex flex-col gap-5" aria-label="How work moves through a board">
          {LADDER.map(({ category, name }) => (
            <li key={category} className="flex items-center gap-4 font-display text-5xl leading-none font-semibold tracking-tight">
              <StatusRing category={category} className="size-9" />
              {name}
            </li>
          ))}
        </ol>
        <p className="max-w-xs text-sm text-muted">Every task has a place on the board. Drag it across as the work moves.</p>
      </aside>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-semibold">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-sm text-muted">{footer}</p>
        </div>
      </section>
    </main>
  );
}

function useAfterAuth() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return from && from.startsWith("/") ? from : "/";
}

export function LoginPage() {
  const { state, login } = useAuth();
  const navigate = useNavigate();
  const destination = useAfterAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "authenticated") return <Navigate to={destination} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email, password });
      void navigate(destination, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "That email and password don't match." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Pick up where your team left off."
      footer={<>New here? <Link to="/register" className="font-medium text-accent underline-offset-2 hover:underline">Create an account</Link></>}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-sm text-signal">{error}</p>}
        <Button type="submit" variant="primary" loading={busy} className="mt-1 h-10">Sign in</Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { state, register } = useAuth();
  const navigate = useNavigate();
  const destination = useAfterAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "authenticated") return <Navigate to={destination} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await register({ name, email, password });
      void navigate(destination, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") setErrors({ email: "An account with this email already exists." });
      else if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Set up a workspace for your team in a minute."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-accent underline-offset-2 hover:underline">Sign in</Link></>}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField label="Name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint="At least 8 characters."
        />
        {formError && <p role="alert" className="text-sm text-signal">{formError}</p>}
        <Button type="submit" variant="primary" loading={busy} className="mt-1 h-10">Create account</Button>
      </form>
    </AuthLayout>
  );
}
