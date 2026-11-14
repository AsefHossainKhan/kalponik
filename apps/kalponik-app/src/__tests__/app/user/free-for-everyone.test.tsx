// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountActions from '@/app/user/components/AccountActions';
import UserInfo from '@/app/user/components/UserInfo';
import { arePaidPlansOffered, shouldOfferUpgrade } from '@/utils/access';
import type { UserPlan } from '@/types/quota';

/**
 * Kalponik has one version, free, with every feature. A self-hosted build
 * (every Kalponik build) must not show Readest's plans, upgrade prompts or
 * subscription controls, even to an account whose token still names a plan.
 */

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { hasIAP: false } }),
}));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

const selfHosted = () => vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', 'true');

const renderActions = (userPlan: UserPlan) =>
  render(
    <AccountActions
      userEmail='reader@example.test'
      planName='Plus'
      userPlan={userPlan}
      customizationPurchased={userPlan !== 'free'}
      iapAvailable={false}
      onLogout={vi.fn()}
      onResetPassword={vi.fn()}
      onUpdateEmail={vi.fn()}
      onConfirmDelete={vi.fn()}
      onConfirmDeleteAllBooks={vi.fn()}
      onManageSubscription={vi.fn()}
    />,
  );

describe('paid plans on a self-hosted build', () => {
  it('offers no paid plans and no upgrade', () => {
    selfHosted();
    expect(arePaidPlansOffered()).toBe(false);
    expect(shouldOfferUpgrade('free')).toBe(false);
  });

  it('still offers them on a Readest-style hosted build', () => {
    vi.stubEnv('SELF_HOSTED', '');
    vi.stubEnv('NEXT_PUBLIC_SELF_HOSTED', '');
    expect(arePaidPlansOffered()).toBe(true);
    expect(shouldOfferUpgrade('free')).toBe(true);
    expect(shouldOfferUpgrade('pro')).toBe(false);
  });

  it('hides Manage Subscription and the plan in the delete confirmation', () => {
    selfHosted();
    renderActions('plus');
    expect(screen.queryByRole('button', { name: 'Manage Subscription' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    const dialog = screen.getByText('Delete Your Account?').parentElement!;
    expect(dialog.textContent).not.toContain('Plus');
    expect(dialog.textContent).not.toContain('This account has a paid plan or purchases.');
  });

  it('shows no plan badge on the profile', () => {
    render(<UserInfo userFullName='Reader' userEmail='reader@example.test' />);
    expect(screen.queryByText('Free Plan')).toBeNull();
    expect(document.querySelector('.rounded-full')).toBeNull();
  });
});
