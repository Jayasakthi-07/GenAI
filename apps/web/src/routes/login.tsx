import { zodResolver } from '@hookform/resolvers/zod';
import {
  APP_NAME,
  APP_TITLE,
  APP_VERSION,
  type LoginRequest,
  loginRequestSchema,
  ROLE_LABELS,
} from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { CircleAlert, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { meQueryOptions, systemInfoQueryOptions, useLogin } from '@/lib/auth';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions).catch(() => null);
    if (me) throw redirect({ to: '/' });
  },
  staticData: { title: 'Sign in' },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { redirect: redirectTo } = Route.useSearch();
  const login = useLogin();
  const info = useQuery(systemInfoQueryOptions);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, {
      onSuccess: () => {
        // Only follow same-site relative redirects.
        const target = redirectTo?.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/';
        router.history.push(target);
      },
    }),
  );

  const fillDemo = (email: string, password: string) => {
    form.setValue('email', email, { shouldValidate: true });
    form.setValue('password', password, { shouldValidate: true });
    form.setFocus('password');
  };

  const serverError =
    login.error instanceof ApiError
      ? login.error.message
      : login.error
        ? 'Couldn’t sign in. Please try again.'
        : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">
          <div className="flex flex-col items-center text-center">
            <BrandMark className="size-11" />
            <h1 className="mt-5 text-2xl font-semibold tracking-tighter">Sign in to {APP_NAME}</h1>
            <p className="mt-1.5 text-sm text-fg-secondary">{APP_TITLE}</p>
          </div>

          <Card className="mt-8 p-6">
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <Field label="Email" error={form.formState.errors.email?.message}>
                <Input
                  type="email"
                  autoComplete="username"
                  autoFocus
                  leading={<Mail strokeWidth={1.75} />}
                  placeholder="you@company.com"
                  {...form.register('email')}
                />
              </Field>
              <Field label="Password" error={form.formState.errors.password?.message}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  leading={<Lock strokeWidth={1.75} />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="rounded p-1 text-fg-tertiary hover:text-fg focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" strokeWidth={1.75} />
                      ) : (
                        <Eye className="size-4" strokeWidth={1.75} />
                      )}
                    </button>
                  }
                  {...form.register('password')}
                />
              </Field>

              {serverError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger"
                >
                  <CircleAlert className="mt-px size-4 shrink-0" strokeWidth={2} />
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={login.isPending}
                className="mt-1 w-full"
              >
                Sign in
              </Button>
            </form>
          </Card>

          {info.data?.demo && (
            <section className="mt-6" aria-labelledby="demo-accounts">
              <h2 id="demo-accounts" className="px-1 text-xs font-medium text-fg-tertiary">
                Demo accounts · password{' '}
                <span className="font-mono text-fg-secondary">{info.data.demo.password}</span>
              </h2>
              <ul className="mt-2 divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface">
                {info.data.demo.accounts.map((account) => (
                  <li key={account.email} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {account.name}{' '}
                        <span className="font-normal text-fg-tertiary">· {ROLE_LABELS[account.role]}</span>
                      </p>
                      <p className="truncate text-xs text-fg-tertiary">{account.email}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => fillDemo(account.email, info.data.demo?.password ?? '')}
                    >
                      Use
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <footer className="pb-6 text-center text-xs text-fg-tertiary">
        Runs entirely on this computer · Version {APP_VERSION}
      </footer>
    </div>
  );
}
