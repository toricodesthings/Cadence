export type Season = "spring" | "summer" | "autumn" | "winter";
export type LoadingMode = "twilight" | "daylight";

const MONTH_SEASONS: readonly Season[] = [
    "winter",
    "winter",
    "spring",
    "spring",
    "spring",
    "summer",
    "summer",
    "summer",
    "autumn",
    "autumn",
    "autumn",
    "winter",
];

const SOUTHERN_ZONES =
    "^(Australia|Antarctica|NZ|Chile)/|^Pacific/(Auckland|Chatham|Easter|Fiji|Tongatapu|Noumea|Efate|Norfolk)$|^America/(Argentina/|Santiago$|Punta_Arenas$|Montevideo$|Asuncion$|Sao_Paulo$|Campo_Grande$|Cuiaba$)|^Africa/(Johannesburg|Maputo|Windhoek|Harare|Lusaka|Gaborone|Maseru|Mbabane|Blantyre|Lubumbashi)$|^Indian/(Mauritius|Reunion|Antananarivo)$|^Atlantic/(Stanley|South_Georgia)$";

function getCurrentSeason(date: Date = new Date()): Season {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const shift = new RegExp(SOUTHERN_ZONES).test(zone) ? 6 : 0;
    return MONTH_SEASONS[(date.getMonth() + shift) % 12] ?? "autumn";
}

const SEASONS: readonly string[] = ["spring", "summer", "autumn", "winter"];

export function resolveLoadingSeason(preference?: string): Season {
    return preference && SEASONS.includes(preference) ? (preference as Season) : getCurrentSeason();
}

export const LOADING_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s={};try{s=JSON.parse(localStorage.getItem('cadence-appearance')||'{}')||{}}catch(e){}if(s.motion==='reduced'||s.motion==='full')d.setAttribute('data-motion',s.motion);var S=${JSON.stringify(SEASONS)},M=${JSON.stringify(MONTH_SEASONS)},z=Intl.DateTimeFormat().resolvedOptions().timeZone||'',h=new RegExp(${JSON.stringify(SOUTHERN_ZONES)}).test(z)?6:0;d.setAttribute('data-loading-season',S.indexOf(s.loadingSeason)>-1?s.loadingSeason:M[(new Date().getMonth()+h)%12]);d.setAttribute('data-loading-mode',d.getAttribute('data-theme')==='daylight'?'daylight':'twilight');setTimeout(function(){d.setAttribute('data-loading-awake','')},600);requestAnimationFrame(function(){d.setAttribute('data-loading-painted','')})}catch(e){}})()`;
