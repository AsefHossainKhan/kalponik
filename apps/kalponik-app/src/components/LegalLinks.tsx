import { useTranslation } from '@/hooks/useTranslation';
import { getBaseUrl, isTauriAppPlatform } from '@/services/environment';
import { privacyPolicyUrl } from '@/utils/legal';
import Link from './Link';

// Kalponik has its own privacy policy (/privacy) and no terms of service of its
// own, so Readest's terms and policy links are gone.
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
    </div>
  );
};

export default LegalLinks;
