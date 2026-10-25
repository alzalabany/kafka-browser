'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { initializeApp, getApps, type FirebaseOptions } from '@firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, inMemoryPersistence } from '@firebase/auth';
import { Activity, LogOut } from 'lucide-react';

type Session = {mode:'local'|'hosted';user:{uid:string;email:string}|null;config?:FirebaseOptions;csrfToken?:string;company?:string};
const HostedContext=createContext(false);
export const useHostedWorkspace=()=>useContext(HostedContext);
export default function AuthGate({children}:{children:React.ReactNode}) {
  const [session,setSession]=useState<Session|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=async () => {
    const response=await fetch('/api/auth',{cache:'no-store'}); const result=await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign-in is unavailable');
    setSession(result);
  };
  useEffect(() => {
    let cancelled=false;
    void fetch('/api/auth',{cache:'no-store'}).then(async response => {
      const result=await response.json();if (!response.ok) throw new Error(result.error || 'Sign-in is unavailable');
      if (!cancelled) setSession(result);
    }).catch(error=>{if (!cancelled) setError(error.message);});
    return () => {cancelled=true;};
  },[]);
  const login=async () => {
    if (!session?.config) return;
    setBusy(true);setError('');
    const app=getApps()[0] || initializeApp(session.config); const auth=getAuth(app);
    try {
      await setPersistence(auth,inMemoryPersistence);
      const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account',...(session.company?{hd:session.company.split(',')[0]}:{})});
      const credential=await signInWithPopup(auth,provider);
      const response=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken || ''},body:JSON.stringify({idToken:await credential.user.getIdToken()})});
      const result=await response.json();if (!response.ok) throw new Error(result.error || 'Sign-in failed');
      await load();
    } catch(error) {setError((error as Error).message);} finally {await signOut(auth);setBusy(false);}
  };
  const logout=async () => {
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/auth',{method:'DELETE',headers:{'X-CSRF-Token':session?.csrfToken || ''}});
      if (!response.ok) throw new Error('Could not sign out. Refresh the page and try again.');
      // Reload clears all topic buffers and any in-flight requests from this account.
      window.location.reload();
    } catch(error) {setError((error as Error).message);setBusy(false);}
  };
  if (session?.mode === 'local') return children;
  if (session?.user) return <HostedContext.Provider value={true}><div className="hosted-shell"><div className="account-bar"><span>{session.user.email} · Company connections</span>{error&&<span role="alert">{error}</span>}<button className="secondary" disabled={busy} onClick={()=>void logout()}><LogOut size={13}/> Sign out</button></div>{children}</div></HostedContext.Provider>;
  return <main className="login-shell"><section className="login-card"><span className="brand-icon"><Activity size={28}/></span><h1>Kafka Browser</h1><p>Sign in with your {session?.company || 'company'} Google account to open your workspace.</p>{error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={!session||busy} onClick={()=>void login()}>{busy?'Signing in…':session?'Continue with Google':'Loading…'}</button><p className="editor-help">Connections are shared with your company. Filters, transformers, and view settings can be personal or shared.</p></section></main>;
}
