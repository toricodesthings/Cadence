export const INTRO_KEY = "cadence-intro";

const HOLD = "data-hero-hold";

const HOLD_MAX_MS = 3000;

export const HEAD_SCRIPT = `try{var d=document.documentElement;d.setAttribute("${HOLD}","");setTimeout(function(){d.removeAttribute("${HOLD}")},${HOLD_MAX_MS});if(sessionStorage.getItem("${INTRO_KEY}"))d.setAttribute("data-hero-return","")}catch(e){}`;

const root = () => document.documentElement;

export function startIntro() {
    root().removeAttribute(HOLD);
}

export function releaseIntro(): () => void {
    let cancelled = false;
    const release = () => {
        if (!cancelled) requestAnimationFrame(startIntro);
    };
    document.fonts.ready.then(() => {
        if (cancelled) return;
        if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(release, { timeout: 600 });
        else window.setTimeout(release, 50);
    });
    return () => {
        cancelled = true;
    };
}

export function onIntroStart(fn: () => void): () => void {
    if (!root().hasAttribute(HOLD)) {
        fn();
        return () => {};
    }
    const mo = new MutationObserver(() => {
        if (root().hasAttribute(HOLD)) return;
        mo.disconnect();
        fn();
    });
    mo.observe(root(), { attributes: true, attributeFilter: [HOLD] });
    return () => mo.disconnect();
}
