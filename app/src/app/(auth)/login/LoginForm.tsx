'use client';

import { useActionState } from 'react';
import { login, setupFirstAdmin, type AuthState } from '@/modules/auth/actions';
import { Button, Card, Notice } from '@/components/ui';
import { useMessages } from '@/i18n/client';
import { common } from '@/i18n/messages/common';

export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const t = useMessages(common).login;
  const [state, action, pending] = useActionState<AuthState, FormData>(firstRun ? setupFirstAdmin : login, {});
  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        {firstRun && <Notice tone="info">{t.firstRun}</Notice>}
        {firstRun && (
          <div>
            <label className="label" htmlFor="name">{t.name}</label>
            <input id="name" name="name" className="field" autoComplete="name" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">{t.email}</label>
          <input id="email" name="email" type="email" className="field" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">{t.password}</label>
          <input
            id="password"
            name="password"
            type="password"
            className="field"
            autoComplete={firstRun ? 'new-password' : 'current-password'}
            minLength={firstRun ? 8 : undefined}
            required
          />
        </div>
        {state.error && <p className="text-sm text-accent" role="alert">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t.busy : firstRun ? t.createAdmin : t.submit}
        </Button>
      </form>
    </Card>
  );
}
