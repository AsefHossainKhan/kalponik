import { useTranslation } from '@/hooks/useTranslation';
import { getBaseUrl, isTauriAppPlatform } from '@/services/environment';
import { privacyPolicyUrl, SOURCE_CODE_URL } from '@/utils/legal';
import Link from './Link';

// Kalponik has its own privacy policy (/privacy) and no terms of service of its
// own, so Readest's terms and policy links are gone. The source code link is
// the AGPL-3.0 offer of source to everyone who uses the app.
const LegalLinks = () => {
  const _ = useTranslation();

  return (
    <div className='my-2 flex flex-wrap justify-center gap-4 text-sm sm:text-xs'>
      <Link
        href={privacyPolicyUrl(isTauriAppPlatform(), getBaseUrl())}
        className='text-blue-500 underline hover:text-blue-600'
      >
        {_('Privacy Policy')}
      </Link>
      <Link href={SOURCE_CODE_URL} className='text-blue-500 underline hover:text-blue-600'>
        {_('Source code')}
      </Link>
    </div>
  );
};

export default LegalLinks;
