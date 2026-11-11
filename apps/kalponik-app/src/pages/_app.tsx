import { withBasePath } from '@/utils/basePath';
import Head from 'next/head';
import { AppProps } from 'next/app';
import { EnvProvider } from '@/context/EnvContext';
import Providers from '@/components/Providers';

import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        {/*
         * `interactive-widget=resizes-content` is appended client-side
         * on Android only (Providers.tsx) so other browsers don't
         * warn about the unrecognized key on every page load.
         */}
        <meta
          name='viewport'
          content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover'
        />
        <meta name='application-name' content='Kalponik' />
        <meta name='apple-mobile-web-app-capable' content='yes' />
        <meta name='apple-mobile-web-app-status-bar-style' content='default' />
        <meta name='apple-mobile-web-app-title' content='Kalponik' />
        <meta
          name='description'
          content='Kalponik is a personal eBook reader, based on the open-source Kalponik, supporting EPUB, PDF, and sync across devices.'
        />
        <meta name='format-detection' content='telephone=no' />
        <meta name='mobile-web-app-capable' content='yes' />
        <meta name='theme-color' content='white' />
        <link rel='manifest' href={withBasePath('/manifest.json')} />
      </Head>
      <EnvProvider>
        <Providers>
          <Component {...pageProps} />
        </Providers>
      </EnvProvider>
    </>
  );
}

export default MyApp;
