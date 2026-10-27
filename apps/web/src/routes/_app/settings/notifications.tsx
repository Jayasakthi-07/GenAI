import {
  NOTIFICATION_TYPE_DESCRIPTIONS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
  type NotificationType,
  type Permission,
} from '@stockroom/shared';
import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { useCan } from '@/lib/auth';
import { usePreferences } from '@/lib/preferences';

export const Route = createFileRoute('/_app/settings/notifications')({
  staticData: { title: 'Notifications' },
  component: NotificationSettings,
});

/** Who receives each kind; people without the permission never get it, so it isn't offered. */
const NEEDS: Record<NotificationType, Permission> = {
  alert: 'inventory.view',
  approval: 'actions.approve',
  run_failed: 'agents.configure',
  po_received: 'purchase_orders.create',
  report_ready: 'inventory.view',
};

function NotificationSettings() {
  const can = useCan();
  const { preferences, setPreference } = usePreferences();
  const types = NOTIFICATION_TYPES.filter((t) => can(NEEDS[t]));
  const set = (type: NotificationType, channel: 'inApp' | 'toast', value: boolean) =>
    setPreference('notifications', {
      ...preferences.notifications,
      [type]: { ...preferences.notifications[type], [channel]: value },
    });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>What you’re notified about</CardTitle>
            <CardDescription>
              Notifications collect under the bell in the top bar. Pop-ups appear briefly while you work.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-hairline text-xs text-fg-tertiary">
                <th scope="col" className="px-5 py-2 text-left font-medium">
                  Notify me about
                </th>
                <th scope="col" className="w-24 px-3 py-2 text-center font-medium">
                  Bell
                </th>
                <th scope="col" className="w-24 px-5 py-2 text-center font-medium">
                  Pop-up
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {types.map((t) => {
                const channel = preferences.notifications[t];
                return (
                  <tr key={t}>
                    <th scope="row" className="px-5 py-3 text-left font-normal">
                      <span className="block font-medium">{NOTIFICATION_TYPE_LABELS[t]}</span>
                      <span className="block text-fg-secondary">{NOTIFICATION_TYPE_DESCRIPTIONS[t]}</span>
                    </th>
                    <td className="px-3 py-3 text-center">
                      <Switch
                        aria-label={`${NOTIFICATION_TYPE_LABELS[t]} under the bell`}
                        checked={channel.inApp}
                        onCheckedChange={(v) => set(t, 'inApp', v)}
                      />
                    </td>
                    <td className="px-5 py-3 text-center">
                      <Switch
                        aria-label={`${NOTIFICATION_TYPE_LABELS[t]} as a pop-up`}
                        checked={channel.toast}
                        onCheckedChange={(v) => set(t, 'toast', v)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <p className="px-1 text-sm text-fg-tertiary">
        Several alerts or proposals from one agent run arrive as a single notification. The bell keeps your
        latest 200.
      </p>
    </div>
  );
}
