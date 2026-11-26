export const RL_NS = "cadence:ai:rl";

export const WINDOW_5H_S = 5 * 60 * 60;
export const WINDOW_7D_S = 7 * 24 * 60 * 60;
export const WINDOW_24H_S = 24 * 60 * 60;

export const INFLIGHT_TTL_S = 90;

export type Window = "5h" | "7d" | "24h";
export type Dimension = "req" | "tok" | "img";

export type RlKeys = {
    req5h: string;
    tok5h: string;
    req7d: string;
    tok7d: string;
    inflight: string;
    img24h: string;
};

export const rlKeys = (userKey: string): RlKeys => {
    const base = `${RL_NS}:${userKey}`;
    return {
        req5h: `${base}:5h:req`,
        tok5h: `${base}:5h:tok`,
        req7d: `${base}:7d:req`,
        tok7d: `${base}:7d:tok`,
        inflight: `${base}:inflight`,
        img24h: `${base}:24h:img`,
    };
};
