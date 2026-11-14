import { useCallback, useEffect, useState } from 'react';
import type { Book } from '@/types/book';
import Alert from '@/components/Alert';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useLibraryStore } from '@/store/libraryStore';
import { usePublicShelfStore } from '@/store/publicShelfStore';
import { useThemeStore } from '@/store/themeStore';
import { eventDispatcher } from '@/utils/event';

// Kalponik: confirms putting a book on the public shelf, or taking it off.
// Opened from the book menu through the 'public-shelf-share' and
// 'public-shelf-unshare' events.

type Pending = { kind: 'share' | 'unshare'; book: Book } | null;

interface PublicShelfAlertProps {
  /** Uploads a book that isn't in the cloud yet; true when it is now. */
  handleBookUpload: (book: Book) => Promise<boolean>;
}

export default function PublicShelfAlert({ handleBookUpload }: PublicShelfAlertProps) {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { safeAreaInsets } = useThemeStore();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const publicBooks = usePublicShelfStore((s) => s.books);

  useEffect(() => {
    const onShare = (event: CustomEvent) => setPending({ kind: 'share', book: event.detail.book });
    const onUnshare = (event: CustomEvent) =>
      setPending({ kind: 'unshare', book: event.detail.book });
    eventDispatcher.on('public-shelf-share', onShare);
    eventDispatcher.on('public-shelf-unshare', onUnshare);
    return () => {
      eventDispatcher.off('public-shelf-share', onShare);
      eventDispatcher.off('public-shelf-unshare', onUnshare);
    };
  }, []);

  const errorMessage = useCallback(
    (code: string) => {
      switch (code) {
        case 'too_large':
          return _('This book is too large for the public shelf.');
        case 'shelf_full':
          return _('The public shelf is full. Ask an admin to make room.');
        case 'not_uploaded':
          return _('Upload the book first, then share it.');
        case 'forbidden':
          return _('Only the person who shared this book, or an admin, can take it off.');
        case 'not_found':
          return _('This book is no longer in your library or on the public shelf.');
        default:
          return _('Something went wrong. Check your connection and try again.');
      }
    },
    [_],
  );

  const setLocalShelf = async (hash: string, shelf: 'public' | undefined) => {
    const current = useLibraryStore.getState().getBookByHash(hash);
    if (!current) return;
    await useLibraryStore.getState().updateBook(envConfig, { ...current, shelf });
  };

  const confirm = async () => {
    if (!pending || busy) return;
    const { kind, book } = pending;
    setBusy(true);
    try {
      if (kind === 'share') {
        if (!book.uploadedAt && !(await handleBookUpload(book))) {
          throw new Error('not_uploaded');
        }
        await usePublicShelfStore.getState().share(book.hash);
        await setLocalShelf(book.hash, 'public');
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('"{{title}}" is on the public shelf', { title: book.title }),
        });
      } else {
        const { returnedToSharer } = await usePublicShelfStore.getState().unshare(book.hash);
        const entry = publicBooks.find((b) => b.hash === book.hash);
        if (returnedToSharer && entry?.sharedByMe) await setLocalShelf(book.hash, undefined);
        eventDispatcher.dispatch('toast', {
          type: 'info',
          message: _('"{{title}}" was taken off the public shelf', { title: book.title }),
        });
      }
      setPending(null);
    } catch (error) {
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: errorMessage(error instanceof Error ? error.message : ''),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!pending) return null;
  const { kind, book } = pending;
  const entry = publicBooks.find((b) => b.hash === book.hash);
  const readers = entry ? Math.max(0, entry.readers - (entry.sharedByMe ? 1 : 0)) : 0;

  return (
    <div
      className='fixed bottom-0 left-0 right-0 z-50 flex justify-center'
      style={{ paddingBottom: `${(safeAreaInsets?.bottom || 0) + 16}px` }}
    >
      {kind === 'share' ? (
        <Alert
          title={_('Share "{{title}}" on the public shelf?', { title: book.title })}
          confirmLabel={busy ? _('Sharing…') : _('Share')}
          confirmButtonClassName='btn-primary'
          onCancel={() => !busy && setPending(null)}
          onConfirm={confirm}
        >
          <ul className='text-base-content/80 list-disc space-y-1 ps-5 text-start text-sm'>
            <li>{_('Everyone signed in to Kalponik can find it and read it.')}</li>
            <li>{_('Your reading progress, highlights and notes stay private.')}</li>
            <li>{_('It moves from My books to Public books. You can take it off later.')}</li>
            <li>{_('Only share books you have the right to share.')}</li>
          </ul>
        </Alert>
      ) : (
        <Alert
          title={_('Take "{{title}}" off the public shelf?', { title: book.title })}
          message={
            readers > 0
              ? _(
                  '{{count}} other people have started it. They keep their progress and notes, but the book leaves their library until someone shares it again.',
                  { count: readers },
                )
              : _('Nobody else has started it yet.')
          }
          confirmLabel={busy ? _('Taking it off…') : _('Take it off')}
          confirmButtonClassName='btn-warning'
          onCancel={() => !busy && setPending(null)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}
