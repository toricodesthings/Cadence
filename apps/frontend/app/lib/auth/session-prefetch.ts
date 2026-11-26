import { WORKSPACE_PREFIXES } from "./workspace-path";

export type PrefetchedSession = { user: { id: string }; session: { token?: string } } | null;

declare global {
    interface Window {
        __cadenceSession?: Promise<PrefetchedSession>;
    }
}

const paths = WORKSPACE_PREFIXES.filter((prefix) => prefix !== "/")
    .map((prefix) => prefix.slice(1))
    .join("|");

export const SESSION_PREFETCH_SCRIPT = `(function(){if(!/^\\/($|(${paths})(\\/|$))/.test(location.pathname))return;try{window.__cadenceSession=fetch('/api/auth/get-session',{credentials:'include',cache:'no-store'}).then(function(r){if(!r.ok)return null;var j=r.headers.get('set-auth-jwt');return r.json().then(function(d){if(d&&d.session&&j)d.session.token=j;return d&&d.user?d:null})}).catch(function(){return null})}catch(e){}})()`;

export function takePrefetchedSession(): Promise<PrefetchedSession> | null {
    if (!window.__cadenceSession) return null;
    const session = window.__cadenceSession;
    delete window.__cadenceSession;
    return session;
}
