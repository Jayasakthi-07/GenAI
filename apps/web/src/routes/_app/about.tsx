import { APP_NAME, APP_TITLE, APP_VERSION, type Health } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Bot, Calculator, Database, HardDrive, ShieldCheck, UserCheck } from 'lucide-react';
import { BrandMark } from '@/components/layout/brand';
import { Page } from '@/components/layout/page-header';
import { StatusPill } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { api } from '@/lib/api';
import { systemInfoQueryOptions, useMe } from '@/lib/auth';

export const Route = createFileRoute('/_app/about')({
  staticData: { title: 'About' },
  component: AboutPage,
});

const PRINCIPLES = [
  {
    icon: Calculator,
    title: 'Numbers come from code',
    body: 'Forecasts, reorder points, anomaly scores and classifications are computed deterministically and tested.',
  },
  {
    icon: Bot,
    title: 'Judgment comes from the model',
    body: 'AI agents read those results through tools, then prioritise, decide and explain — citing the data they used.',
  },
  {
    icon: UserCheck,
    title: 'People stay in control',
    body: 'Consequential actions become proposals you approve, edit or reject. Every change is audited.',
  },
  {
    icon: HardDrive,
    title: 'Runs on this computer',
    body: 'The app, API and database are local. With a local model, everything works offline.',
  },
];

function AboutPage() {
  const { organization } = useMe();
  const info = useQuery(systemInfoQueryOptions);
  const health = useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => api.get<Health>('/health'),
    refetchInterval: 30_000,
  });

  return (
    <Page className="max-w-4xl">
      <div className="flex flex-col items-center py-6 text-center sm:py-10">
        <BrandMark className="size-14" />
        <h2 className="mt-5 text-3xl font-semibold tracking-tighter">{APP_NAME}</h2>
        <p className="mt-2 text-lg text-fg-secondary">{APP_TITLE}</p>
        <p className="mt-1 text-sm text-fg-tertiary">Version {APP_VERSION}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <Card key={p.title} className="p-5">
            <p.icon className="size-5 text-accent-text" strokeWidth={1.75} />
            <h3 className="mt-3 text-base font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-1 text-sm text-fg-secondary">{p.body}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>System</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-fg-secondary">Organization</dt>
              <dd className="font-medium">{organization.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-fg-secondary">Currency · locale · timezone</dt>
              <dd className="font-medium">
                {organization.currency} · {organization.locale} · {organization.timezone}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-1.5 text-fg-secondary">
                <Database className="size-4" strokeWidth={1.75} /> Database
              </dt>
              <dd>
                {health.data ? (
                  <StatusPill tone={health.data.database === 'up' ? 'success' : 'danger'}>
                    {health.data.database === 'up' ? 'Connected' : 'Unavailable'}
                  </StatusPill>
                ) : health.isError ? (
                  <StatusPill tone="danger">Server unreachable</StatusPill>
                ) : (
                  <Skeleton className="h-5 w-20" />
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-1.5 text-fg-secondary">
                <ShieldCheck className="size-4" strokeWidth={1.75} /> Server runtime
              </dt>
              <dd className="font-medium">
                {info.data ? `Node.js ${info.data.node}` : <Skeleton className="h-5 w-24" />}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </Page>
  );
}
