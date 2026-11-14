import type { ElementType } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { FaApple, FaGithub, FaDiscord } from 'react-icons/fa';
import type { OAuthProvider } from './ProviderLogin';

export interface OAuthProviderButton {
  provider: OAuthProvider;
  name: string;
  Icon: ElementType;
}

// Every provider the sign-in page knows how to draw, in display order.
export const OAUTH_PROVIDER_BUTTONS: OAuthProviderButton[] = [
  { provider: 'google', name: 'Google', Icon: FcGoogle },
  { provider: 'apple', name: 'Apple', Icon: FaApple },
  { provider: 'github', name: 'GitHub', Icon: FaGithub },
  { provider: 'discord', name: 'Discord', Icon: FaDiscord },
];

// Kalponik: only the providers set up in our Supabase project. To bring one
// back, enable it in Supabase (Authentication > Providers) and add it here.
export const ENABLED_OAUTH_PROVIDERS: OAuthProvider[] = ['google'];
