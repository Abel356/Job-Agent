import Dashboard from './dashboard';
import {auth} from '@/auth';
import {AccountControls} from '@/components/account-controls';
import {createHmac} from 'node:crypto';

export const dynamic='force-dynamic';

export default async function Home(){
 const enabled=Boolean(process.env.AUTH_SECRET&&process.env.AUTH_GOOGLE_ID&&process.env.AUTH_GOOGLE_SECRET);
 const session=enabled?await auth():null;
 const owner=session?.user?.id||null;
 const profileId=owner?createHmac('sha256',process.env.AUTH_SECRET!).update(`earthwork-storage-v2:${owner}`).digest('base64url'):null;
 const profileKey=owner?createHmac('sha256',process.env.AUTH_SECRET!).update(`earthwork-profile-v2:${owner}`).digest('base64url'):null;
 return <Dashboard profileId={profileId} profileKey={profileKey} accountControls={<AccountControls enabled={enabled} signedIn={!!owner} name={session?.user?.name||null}/>}/>;
}
