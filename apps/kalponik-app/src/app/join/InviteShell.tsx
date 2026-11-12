'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { withBasePath } from '@/utils/basePath';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';

// The frame shared by the invite pages (join, request access, admin, sign-in
// error): app icon, a title, a line of explanation, then the page's content.

export const INPUT_CLASS =
  'input input-bordered eink-bordered bg-base-100 h-11 w-full rounded-lg text-base';
export const PRIMARY_BUTTON_CLASS = 'btn btn-primary h-11 min-h-11 w-full rounded-lg';
export const SECONDARY_BUTTON_CLASS =
  'btn btn-ghost eink-bordered border-base-300 h-11 min-h-11 w-full rounded-lg';
export const LINK_CLASS =
  'text-base-content/70 hover:text-base-content underline underline-offset-2 transition-colors duration-150';

export function Notice({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={
        tone === 'error'
          ? 'eink-bordered border-error/30 bg-error/5 text-error rounded-lg border px-3 py-2.5 text-center text-sm leading-relaxed'
          : 'eink-bordered border-base-300 bg-base-200/60 rounded-lg border px-3 py-2.5 text-center text-sm leading-relaxed'
      }
    >
      {children}
    </div>
  );
}

export default function InviteShell({
  title,
  subtitle,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  useTheme({ systemUIVisible: false });
  const { safeAreaInsets } = useThemeStore();

  return (
    <div
      className='bg-base-100 text-base-content flex min-h-screen w-full justify-center overflow-y-auto px-4'
      style={{
        paddingTop: `${(safeAreaInsets?.top ?? 0) + 48}px`,
        paddingBottom: `${(safeAreaInsets?.bottom ?? 0) + 32}px`,
      }}
    >
      <div className={`flex w-full flex-col gap-6 ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
        <div className='flex flex-col items-center gap-3 text-center'>
          <Image
            src={withBasePath('/icon.png')}
            alt=''
            width={56}
            height={56}
            className='eink-bordered rounded-xl'
          />
          <div>
            <h1 className='text-xl font-semibold tracking-tight'>{title}</h1>
            {subtitle && (
              <p className='text-base-content/70 mt-1.5 text-sm leading-relaxed'>{subtitle}</p>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
