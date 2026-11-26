// Cadence UI conventions as Oxlint rules (jsPlugins, ESLint-plugin format). Registered in .oxlintrc.json.
// shortcut: jsPlugins is alpha in oxlint 1.x; if an upgrade breaks it, port these visitors to scripts/check-ui.mjs.

const CLASS_HELPERS = new Set(["cn", "clsx", "cva", "twMerge"]);
const COPY_ATTRS = new Set(["label", "title", "placeholder", "aria-label", "description"]);
const TOAST_FNS = new Set(["toast", "toastUndo", "toastError"]);

const calleeName = (callee) =>
    callee.type === "Identifier"
        ? callee.name
        : callee.type === "MemberExpression" && callee.object.type === "Identifier"
          ? callee.object.name
          : null;

const isComparison = (n) => n.type === "BinaryExpression" && /^[!=]==?$/.test(n.operator);

function strings(node, out = []) {
    if (!node || typeof node !== "object" || isComparison(node)) return out;
    if (node.type === "Literal" && typeof node.value === "string") out.push({ node, text: node.value });
    else if (node.type === "TemplateElement") out.push({ node, text: node.value.cooked ?? node.value.raw });
    else if (node.type === "JSXText") out.push({ node, text: node.value });
    for (const key in node) {
        if (key === "parent" || key === "loc" || key === "range") continue;
        if (node.type === "Property" && key === "key") continue;
        const child = node[key];
        if (Array.isArray(child)) for (const c of child) strings(c, out);
        else if (child && typeof child.type === "string") strings(child, out);
    }
    return out;
}

function classContexts(check) {
    let depth = 0;
    const isClassAttr = (n) => n.name.type === "JSXIdentifier" && n.name.name === "className" && n.value;
    const isHelper = (n) => n.callee.type === "Identifier" && CLASS_HELPERS.has(n.callee.name);
    return {
        JSXAttribute(n) {
            if (!isClassAttr(n)) return;
            if (depth++ === 0) check(strings(n.value), n);
        },
        "JSXAttribute:exit"(n) {
            if (isClassAttr(n)) depth--;
        },
        CallExpression(n) {
            if (!isHelper(n)) return;
            if (depth++ === 0) check(strings({ type: "Args", args: n.arguments }), n);
        },
        "CallExpression:exit"(n) {
            if (isHelper(n)) depth--;
        },
    };
}

const tokens = (text) => text.split(/\s+/).filter(Boolean);
const utility = (token) => token.slice(token.lastIndexOf(":") + 1).replace(/^!/, "");

const tokenRule = (messages, bans) => ({
    meta: { type: "suggestion", messages },
    create(context) {
        return classContexts((parts) => {
            for (const { node, text } of parts) {
                for (const token of tokens(text)) {
                    const ban = bans.find(([re]) => re.test(utility(token)));
                    if (ban) context.report({ node, messageId: ban[1], data: { token } });
                }
            }
        });
    },
});

const UI_WORD = /\b(projects?|habits?)\b/i;

const uiWords = {
    meta: {
        type: "suggestion",
        messages: { word: 'Say "List(s)" / "Routine(s)" in UI copy, not "{{word}}": the user\'s words (law 7).' },
    },
    create(context) {
        const check = (node) => {
            for (const part of strings(node)) {
                const match = UI_WORD.exec(part.text);
                if (match) context.report({ node: part.node, messageId: "word", data: { word: match[0] } });
            }
        };
        return {
            JSXText(n) {
                check(n);
            },
            JSXAttribute(n) {
                if (n.name.type === "JSXIdentifier" && COPY_ATTRS.has(n.name.name) && n.value) check(n.value);
            },
            CallExpression(n) {
                if (!TOAST_FNS.has(calleeName(n.callee))) return;
                for (const arg of n.arguments) {
                    if (arg.type !== "ObjectExpression") check(arg);
                    else
                        for (const p of arg.properties)
                            if (p.type === "Property" && p.key.type === "Identifier" && p.key.name === "description")
                                check(p.value);
                }
            },
        };
    },
};

const noDomTitle = {
    meta: {
        type: "suggestion",
        messages: { title: "Use <Tip> (components/primitives/Tooltip.tsx), not a native title tooltip." },
    },
    create(context) {
        return {
            JSXAttribute(n) {
                if (n.name.type !== "JSXIdentifier" || n.name.name !== "title") return;
                const el = n.parent?.name;
                if (el?.type === "JSXIdentifier" && /^[a-z]/.test(el.name) && el.name !== "iframe")
                    context.report({ node: n, messageId: "title" });
            },
        };
    },
};

const showsFocus = (t) =>
    /(^|:)(focus|focus-visible|focus-within|data-\[highlighted\]):/.test(t) && !t.endsWith("outline-none");

const focusVisible = {
    meta: {
        type: "problem",
        messages: {
            ring: "outline-none removes the focus ring: add a focus-visible: (or focus:) style in the same className / cn().",
        },
    },
    create(context) {
        return classContexts((parts, root) => {
            const all = parts.flatMap((p) => tokens(p.text));
            if (all.some((t) => utility(t) === "outline-none") && !all.some(showsFocus))
                context.report({ node: root, messageId: "ring" });
        });
    },
};

const PALETTE =
    "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const LADDER =
    "surface-shell | surface-card | surface-item | surface-row | surface-control | surface-dialog | surface-floating, or a panel / app.css token";

const surfaceTokens = tokenRule(
    {
        mono: `"{{token}}": use the surface ladder (${LADDER}).`,
        palette: `"{{token}}": Tailwind palette colour; use an app.css token (${LADDER}).`,
        arbitrary: `"{{token}}": one-off colour; use an app.css token.`,
    },
    [
        [/^(bg|from|to|via|border|ring)-(white|black)(\/|$)/, "mono"],
        [new RegExp(`^(bg|text|border|ring|from|to|via|fill|stroke|shadow)-(${PALETTE})-\\d{2,3}(\\/|$)`), "palette"],
        [/-\[(#|rgba?\(|hsla?\()/, "arbitrary"],
    ],
);

const noZIndex = tokenRule(
    { z: '"{{token}}": use a .layer-* utility (app.css); only z-0 / z-10 for stacking inside one component.' },
    [[/^-?z-(?!0$|10$)(\d+|\[)/, "z"]],
);

export default {
    meta: { name: "cadence" },
    rules: {
        "ui-words": uiWords,
        "no-dom-title": noDomTitle,
        "focus-visible": focusVisible,
        "surface-tokens": surfaceTokens,
        "no-z-index": noZIndex,
    },
};
