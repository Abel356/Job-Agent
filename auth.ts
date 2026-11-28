import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const {handlers,auth,signIn,signOut}=NextAuth({
 providers:[Google],
 session:{strategy:'jwt',maxAge:7*24*60*60},
 callbacks:{
  signIn({account,profile}){return account?.provider==='google'&&profile?.email_verified===true;},
  session({session,token}){
   if(session.user&&typeof token.sub==='string')session.user.id=token.sub;
   return session;
  },
 },
});
