import {signIn,signOut} from '@/auth';

export function AccountControls({enabled,signedIn,name}:{enabled:boolean;signedIn:boolean;name?:string|null}){
 if(!enabled)return <span className="account-note">Google sign-in setup pending</span>;
 if(!signedIn)return <form action={async()=>{'use server';await signIn('google',{redirectTo:'/'});}}><button className="account-button" type="submit">Sign in with Google</button></form>;
 return <div className="account-controls"><span className="account-note">{name||'Signed in'}</span><form action={async()=>{'use server';await signOut({redirectTo:'/'});}}><button className="account-button" type="submit">Sign out</button></form></div>;
}
