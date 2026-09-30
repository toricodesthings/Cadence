import type { LegalDoc } from "./types";

/*
 * Every claim here was checked against the code on 2026-09-30 (release 0.25.x). Where the code could not
 * settle something, the text says so in a `gap` block. Update this file in the same change as any
 * data-flow change (new provider, new stored field, new retention rule).
 */
export const PRIVACY: LegalDoc = {
  title: "Privacy Policy",
  description:
    "What Cadence stores, who else handles it, how the AI assistant uses your data, and what is still unfinished. Plain language, nothing hidden.",
  lede: "What Cadence holds about you, who else touches it, and where the honest gaps are. Where something is unfinished or could not be verified, it is written down instead of smoothed over.",
  updated: "2026-09-30",
  inShort: [
    "Cadence is run by one person with no company behind it. The apps contain no advertising or third-party analytics code, and your data is not sold.",
    "Your workspace lives in a Neon Postgres database, separated per account by row-level security. Cloudflare runs the servers.",
    "If you message the assistant, that message, related tasks and notes, and any photos you attach go to AI model providers through OpenRouter. Their retention and training terms are not something this project can verify.",
    "Usage diagnostics are on by default (you can switch them off) and record which actions you use, not your text. The Crash reports switch currently does nothing.",
    "You can delete your account yourself in Settings: it is permanent and cannot be undone. Automated data export is not built yet.",
    "Cadence sets only the cookies needed to keep you signed in. This website sets none.",
  ],
  sections: [
    {
      id: "who-is-responsible",
      title: "Who is responsible",
      blocks: [
        {
          kind: "p",
          text: "Cadence is built and run by one person, the maintainer (GitHub: [toricodesthings](https://github.com/toricodesthings)), based in Toronto, Ontario, Canada. The maintainer decides what data Cadence collects and why, so in privacy-law terms they are the party responsible for it.",
        },
        {
          kind: "p",
          text: "This policy covers the web app at dashboard.cadenceapp.cloud, the desktop app, the AI assistant (Emilie), the connected-assistant server at mcp.cadenceapp.cloud, and this website at cadenceapp.cloud. Cadence is pre-release software (version 0.x).",
        },
        {
          kind: "gap",
          title: "No legal entity",
          text: "Nothing in the project names a company, registered address or designated privacy officer. If one is created, this page will say so.",
        },
      ],
    },
    {
      id: "what-we-hold",
      title: "What Cadence holds",
      blocks: [
        {
          kind: "p",
          text: "Every kind of data Cadence keeps, why, where, who handles it, and for how long. The companies named here are described in the next section.",
        },
        { kind: "sub", title: "Your account and workspace" },
        {
          kind: "table",
          head: ["Data", "Why", "Where", "Handled by", "Kept"],
          rows: [
            [
              "Email, name, profile picture, password, linked Google or GitHub login, signed-in sessions",
              "Sign you in and keep you signed in",
              "Neon Auth",
              "Neon",
              "Until you delete your account",
            ],
            [
              "Tasks, subtasks, notes, lists, tags, captures, routines and their logs, events, saved views",
              "The planner itself",
              "Neon Postgres",
              "Neon, Cloudflare",
              "Until you delete it. Trash is not emptied automatically",
            ],
            [
              "Settings and profile: preferences, pronouns, birthday, assistant name and instructions, privacy switches, chosen location",
              "Make the app work your way",
              "Neon Postgres",
              "Neon, Cloudflare",
              "Until your account is deleted",
            ],
            [
              "Background photo and the colours read from it",
              "Draw your background",
              "Photo: Cloudflare R2. Colours: Postgres",
              "Cloudflare, Neon",
              "Until you replace or delete it",
            ],
            [
              "Workload signals: reschedule counts, completion ratio, overdue load, routine adherence, a 1 to 100 workload index",
              "Soften the assistant's tone when adaptive tone is on",
              "Neon Postgres",
              "Neon",
              "Life of the account; recalculated over time",
            ],
            [
              "Request keys that stop a retried change from saving twice",
              "Safe offline sync",
              "Neon Postgres",
              "Neon",
              "7 days",
            ],
          ],
        },
        { kind: "sub", title: "The assistant" },
        {
          kind: "table",
          head: ["Data", "Why", "Where", "Handled by", "Kept"],
          rows: [
            [
              "Conversations: your messages, replies, lookup results, titles",
              "Show history, continue a thread",
              "Neon Postgres",
              "Neon. AI providers while a reply is made",
              "Until you delete the conversation. No automatic expiry",
            ],
            [
              "Photos you send the assistant",
              "Let it read them",
              "Cloudflare R2, with a link row in Postgres",
              "Cloudflare, Neon. AI providers when sent",
              "30 days after last sent. Never-sent ones 1 day",
            ],
            [
              "Live copy of a reply in progress; usage counters",
              "Resume a reply after a reload; cap usage",
              "Upstash Redis",
              "Upstash",
              "Reply copy up to 1 hour while running, about 1 minute after it ends. Counters roll over within 5 hours, 24 hours, 7 days",
            ],
            [
              "Assistant memory",
              "Recall preferences across chats",
              "Neon Postgres",
              "Neon",
              "Nothing is written today. See the assistant section",
            ],
          ],
        },
        { kind: "sub", title: "Behind the scenes" },
        {
          kind: "table",
          head: ["Data", "Why", "Where", "Handled by", "Kept"],
          rows: [
            [
              "Usage diagnostics: an action name and a little context, no text you typed",
              "See which parts are confusing",
              "Neon Postgres",
              "Neon",
              "90 days. On by default",
            ],
            [
              "Connected-assistant records and sign-in tokens",
              "Let an outside assistant in, and cut it off",
              "Postgres; Cloudflare KV",
              "Neon, Cloudflare",
              "Record stays, marked revoked. Tokens lapse after 30 idle days",
            ],
            [
              "Server logs: request path, method, status, timing, request ID, a short hash of your user id, error details",
              "Keep the service working, find faults",
              "Cloudflare Workers Logs",
              "Cloudflare",
              "Cloudflare's default. Cadence sets no limit",
            ],
          ],
        },
        {
          kind: "gap",
          title: "Most data has no expiry",
          text: "Only the rows above with a stated period are cleaned up automatically (a daily job). Tasks, notes, trashed items, conversations and account records stay until you delete them or the account is deleted.",
        },
        {
          kind: "gap",
          title: "Backups not verified",
          text: "The database provider may keep backups or history of its own. This project has not configured or checked them, so deleted data may linger there for a period Cadence cannot state.",
        },
      ],
    },
    {
      id: "who-else-handles-data",
      title: "Who else handles your data",
      blocks: [
        {
          kind: "p",
          text: "These are the services the code actually uses. Weather, geocoding and holiday lookups are made by Cadence's server, not your device, so those services see Cadence's server, not your IP address or identity. Your browser's data requests go only to Cadence's own API and the sign-in service (the desktop app also contacts GitHub for updates).",
        },
        {
          kind: "table",
          head: ["Service", "Used for", "What it receives", "Where"],
          rows: [
            [
              "Cloudflare",
              "Runs the web app, API, connected-assistant server and this site. Private storage (R2), token storage (KV), database connection pooling, rate limiting, logs",
              "All traffic to Cadence, including your IP address. Stored photos and assistant tokens",
              "Global network. The API runs near the database in US East",
            ],
            [
              "Neon",
              "The Postgres database and Neon Auth (sign-in)",
              "Account details and all workspace data, settings and assistant conversations",
              "AWS US East (N. Virginia)",
            ],
            [
              "OpenRouter",
              "Gateway that passes assistant requests to AI model providers",
              "See the assistant section",
              "Not verified",
            ],
            [
              "AI model companies behind OpenRouter: DeepInfra (DeepSeek), Upstage (Solar) and Google (Gemini, and Gemma for titles)",
              "Run the AI models",
              "Whatever OpenRouter forwards for a request",
              "Not verified",
            ],
            [
              "Upstash",
              "Redis cache for reply resumption and usage limits",
              "Reply text while it streams; a hash of your user id in key names",
              "Not verified",
            ],
            [
              "Open-Meteo",
              "Weather, and city search by name",
              "Coordinates rounded to about 1 km, or the city text you typed",
              "Not verified",
            ],
            [
              "OpenStreetMap (Nominatim)",
              "Turns rounded coordinates into a region name",
              "Coordinates rounded to about 1 km",
              "Not verified",
            ],
            [
              "OpenHolidays API, Nager.Date",
              "Public holidays",
              "Country or region code, date range, language",
              "Not verified",
            ],
            [
              "GitHub",
              "Optional sign-in. Hosts the source code, issues and desktop update files",
              "Desktop app: your IP address and app version when it checks for updates",
              "United States, per GitHub",
            ],
            [
              "Google",
              "Optional sign-in",
              "Handles your login; its profile details reach Neon Auth",
              "Per Google",
            ],
          ],
        },
        {
          kind: "gap",
          title: "Regions and terms not checked",
          text: "Where OpenRouter, the model hosts, Upstash and the weather and holiday services keep data, and what their own policies say, was not verified for this page. Each service has its own privacy policy that applies to it.",
        },
        {
          kind: "gap",
          title: "Sign-in emails",
          text: "Some sign-in steps send email (for example a password-reset code). Cadence's own servers send no email. Which service delivers these messages on behalf of Neon Auth was not verifiable from the project.",
        },
      ],
    },
    {
      id: "ai-assistant",
      title: "The AI assistant",
      blocks: [
        {
          kind: "p",
          text: "Emilie is Cadence's AI assistant. Nothing is sent to an AI model unless you send the assistant a message. The assistant reads your data to answer, and every change it makes goes through the same permission checks as the app.",
        },
        { kind: "sub", title: "What is sent for each message" },
        {
          kind: "list",
          items: [
            "Your message and up to the last 40 turns of that conversation. Older lookup results are shrunk to counts and ids.",
            "Photos attached to your message and to the last 6 messages, sent as image data.",
            "A snapshot taken before each reply: today's schedule, up to 5 overdue tasks, today's routines, your 5 newest captures, and events in the next 7 days.",
            "Anything the assistant looks up while answering: tasks, notes (cut off after 1,000 characters), lists, tags, routines, events, saved views.",
            "Your assistant settings: its name, your nickname, voice, emoji and suggestion choices, your custom instructions, and your approval mode.",
            "Your time zone, language, week start, the current local time, and a high-workload flag when adaptive tone is on.",
            "A short fingerprint of your user id (the first 16 characters of a SHA-256 hash). Your email and account name are not sent.",
            "For a new conversation, the first 500 characters of your first message also go to a smaller model to write a title.",
          ],
        },
        { kind: "sub", title: "Who receives it" },
        {
          kind: "p",
          text: "Every assistant request goes through OpenRouter, which passes it to the company that runs the model. Today that is DeepInfra for the DeepSeek model (most requests), Upstage for the Solar model (short, simple requests), and Google for Gemini, the default fallback if the others are unavailable, and for Gemma, which writes conversation titles. The code also lists a Mistral model as a further fallback. These are settings and can change without notice.",
        },
        { kind: "sub", title: "What is stored" },
        {
          kind: "list",
          items: [
            "Conversations are saved in the database with replies, the lookups and changes made, which model answered, and token counts and cost. Delete one from History, or archive conversations and clear the archive. Deleting removes its messages and photos.",
            "Photos you attach are re-encoded in your browser (which drops camera data such as location), checked again by the server, and stored privately. They are deleted 30 days after last use, or when you delete the conversation.",
            "A temporary copy of a reply in progress sits in Redis so a reload can resume it, for up to an hour, and about a minute after it finishes.",
            "Logs record one line per reply: model, outcome, steps, token counts, cost, timing and a hashed user id. They do not record your message text. Shortened error details from the model provider can be logged when a request fails.",
          ],
        },
        { kind: "sub", title: "Memory" },
        {
          kind: "p",
          text: "Memory is off by default in your settings. It is also unfinished: the code that would save facts about you is a stub, so nothing is written today, and saved memories could only ever be used if a server-side switch were also turned on. If that ever changes, your message would additionally be sent to an embedding model to find related memories, and this page will be updated first.",
        },
        { kind: "sub", title: "Retention and training by AI providers" },
        {
          kind: "gap",
          title: "Cannot be verified from the code",
          text: "Cadence does not set OpenRouter's data-collection or zero-retention options on requests. Project notes say the AI providers are used with training opted out, but that would be an account-level setting at OpenRouter that the code cannot show. Whether any provider keeps or trains on your content is governed by their terms, not something this project can confirm. Do not put anything in the assistant you would not be comfortable sharing with them.",
        },
        {
          kind: "p",
          text: "Nothing in Cadence's own code uses your content to train or fine-tune any model.",
        },
        { kind: "sub", title: "Limits and safety" },
        {
          kind: "p",
          text: "Usage is capped per account (by default 150 replies per 5 hours and 1,500 per week, plus photo limits) using counters in Redis. You choose whether the assistant asks before each change, asks only for risky ones, or acts on its own. Approvals are cryptographically signed so a forged one fails.",
        },
      ],
    },
    {
      id: "connected-assistants",
      title: "Connected assistants",
      blocks: [
        {
          kind: "p",
          text: "You can let an outside assistant, such as Claude, work with your Cadence through the connected-assistant server (MCP). Nothing is connected unless you approve it on a consent page that shows what it may do.",
        },
        {
          kind: "list",
          items: [
            "You choose the access: read your data, add to Capture only, or change your data (including permanent deletes). It cannot change settings.",
            "Cadence stores the assistant's name, the access you granted, your browser's time zone at the time, and when it last connected, in the database. Its access tokens are kept by Cloudflare, expire after 30 idle days, and are checked against your Disconnect on every call.",
            "Disconnect in Settings stops new access immediately. It cannot take back what the assistant already read; from then on that assistant's own provider handles it under its own terms.",
            "A short-lived cookie on the connected-assistant domain ties a consent request to the browser that started it, for up to 10 minutes.",
          ],
        },
        {
          kind: "gap",
          title: "What the outside assistant does next is out of Cadence's hands",
          text: "Anything an outside assistant reads is processed under that provider's terms. Cadence cannot see or control that.",
        },
      ],
    },
    {
      id: "location",
      title: "Location, weather and holidays",
      blocks: [
        {
          kind: "p",
          text: "Location is used only for weather and public holidays. By default Cadence takes an approximate position from your network connection, worked out by Cloudflare at its edge, which needs no browser permission. You can instead allow precise location (your browser asks once), pick a place yourself, or turn location off.",
        },
        {
          kind: "list",
          items: [
            "Coordinates are rounded to about 1 km before they are stored, cached or sent anywhere.",
            "Rounded coordinates go to Open-Meteo for weather and to OpenStreetMap for a region name. A city you search for goes to Open-Meteo as text. Holiday lookups send only a country or region code.",
            "Your chosen mode, country, region and a city you pick (with its coordinates) are stored with your settings. A precise device position is not stored on the server.",
            "Precise positions are kept on your device for up to 7 days. Sign out or choose Forget saved location to clear them.",
            "Weather and holidays are on by default, and you can turn either off in Settings.",
          ],
        },
      ],
    },
    {
      id: "on-your-device",
      title: "On your device and cookies",
      blocks: [
        {
          kind: "p",
          text: "To load fast and work offline, Cadence keeps data on your device. The desktop app uses its own local store and the operating system's credential keyring instead of browser storage.",
        },
        {
          kind: "table",
          head: ["Where", "What"],
          rows: [
            [
              "Local storage",
              "A copy of your settings, appearance choices, view preferences, reminder state, up to 6 recent searches on the mobile search sheet, a cached location, and who was last signed in (id, email, name, picture, no passwords or tokens) so the app can open offline",
            ],
            [
              "IndexedDB",
              "A copy of your workspace data (kept up to 14 days), changes waiting to sync, and a copy of your background photo",
            ],
            [
              "Session storage",
              "Two one-tab flags: one avoids a reload loop after an update, one (on this website) skips the hero intro on a return visit",
            ],
            [
              "Service worker cache",
              "The app's own files, so it opens without a connection",
            ],
            [
              "Desktop app",
              "The same workspace copy in a native store, and your sign-in token in the OS keyring",
            ],
          ],
        },
        { kind: "sub", title: "Cookies" },
        {
          kind: "list",
          items: [
            "The web app sets first-party cookies whose names begin with `__Secure-neon-auth.`. They hold your sign-in session and the state of a sign-in in progress. Without them you cannot stay signed in.",
            "The connected-assistant server sets one short-lived `__Host-` cookie during a consent flow.",
            "No advertising, analytics or tracking cookies are set by any Cadence app or by this website.",
          ],
        },
        {
          kind: "gap",
          title: "Signing out does not wipe everything",
          text: "Signing out removes the saved identity, cached location, cached background photo and sign-in session. It does not remove the cached copy of your workspace from IndexedDB. The copy is tied to your account id and is discarded the next time another account signs in on that device, but until then it stays. To remove it at once, clear this site's data in your browser or uninstall the desktop app.",
        },
        {
          kind: "gap",
          title: "Cloudflare's own cookies",
          text: "Cadence's code sets no other cookies. Cloudflare can add security cookies or a web-analytics script at its network edge depending on dashboard settings that are not visible in the project. The apps' security policy allows the Cloudflare analytics script, and this was not verified either way.",
        },
      ],
    },
    {
      id: "diagnostics",
      title: "Diagnostics and crash reports",
      blocks: [
        {
          kind: "sub",
          title: "Usage diagnostics",
        },
        {
          kind: "p",
          text: "When on, the app sends short events such as task.complete, schedule.open or command_palette.opened, with small extras like the screen, input method (click or keyboard) and a confidence level. The event names are a fixed list and do not include what you typed. They are saved against your account in the database and deleted after 90 days.",
        },
        {
          kind: "gap",
          title: "On by default, and not anonymous",
          text: "This switch is on unless you turn it off in Settings, under Privacy and Data or Intelligence and Privacy. So it is opt-out, not opt-in. The app's own wording calls it anonymous, but events are stored with your account id, so they are linked to you. Turning it off stops the app from sending events and the server from saving them.",
        },
        { kind: "sub", title: "Crash reports" },
        {
          kind: "gap",
          title: "The Crash reports switch does nothing",
          text: "The app has a Crash reports switch, but no crash-reporting code exists in the web, desktop or website code, and nothing reads the setting. No crash reports are sent. Server errors are logged as described above.",
        },
        { kind: "sub", title: "Recent searches" },
        {
          kind: "gap",
          title: "The Store recent searches switch does nothing",
          text: "The mobile search sheet saves up to 6 recent searches in local storage on your device regardless of the switch, and turning it off does not clear them. They never leave your device. Clear site data to remove them.",
        },
      ],
    },
    {
      id: "this-website",
      title: "This website",
      blocks: [
        {
          kind: "p",
          text: "The site at cadenceapp.cloud is separate from the app. It never calls Cadence's API, sets no cookies, and includes no analytics, tracking or advertising scripts. Its fonts are served from the site itself. It uses one session-storage flag in your tab to skip the intro animation when you come back.",
        },
        {
          kind: "p",
          text: "The site runs on Cloudflare Workers, which records ordinary request logs. Following a link to the app, GitHub or elsewhere leaves this site, and those services' own policies apply.",
        },
      ],
    },
    {
      id: "not-collected",
      title: "What Cadence does not do",
      blocks: [
        {
          kind: "p",
          text: "Only things confirmed absent from the code are listed here.",
        },
        {
          kind: "list",
          items: [
            "No advertising, ad networks or ad identifiers.",
            "No third-party analytics, session-replay or crash-reporting libraries in the web app, desktop app or this website.",
            "No selling of data, and nothing shared for advertising.",
            "No access to your contacts, camera or microphone. Photos come only from the file picker when you choose one.",
            "No precise location unless you choose it.",
            "No email sent by Cadence's own servers, and no push-notification server. Reminders are raised by the app itself.",
            "No use of your content to train models by Cadence's own code.",
          ],
        },
      ],
    },
    {
      id: "keeping-and-deleting",
      title: "Keeping, deleting and getting a copy",
      blocks: [
        { kind: "sub", title: "What you can delete yourself" },
        {
          kind: "list",
          items: [
            "Tasks go to Trash first; Empty Trash deletes them permanently. Lists, routines, captures, events and saved views can be deleted in the app.",
            "Assistant conversations: delete one, or clear the archive. Their photos go with them.",
            "Your background photo: the bin button deletes it from storage.",
            "Connected assistants: Disconnect. Saved location: Forget saved location. Usage diagnostics and location: switch off in Settings.",
          ],
        },
        { kind: "sub", title: "Deleting your account" },
        {
          kind: "p",
          text: "Settings, under Data & Export, has a **Delete account** button. You must type a confirmation phrase before it works. It is permanent: nothing can be restored afterwards, not by you and not by the maintainer.",
        },
        {
          kind: "list",
          items: [
            "It deletes your photos (background and assistant photos) from storage and disconnects every connected assistant.",
            "It deletes your workspace in one step: tasks, notes, lists, routines, events, settings, assistant conversations, diagnostics events and connection records all hang off your account and go with it.",
            "It removes your sign-in account (email, name, profile picture, password or linked Google and GitHub login) from Neon Auth.",
            "It clears the copy kept on the device you deleted from. Other devices keep a cached copy until they sign out or another account signs in there.",
          ],
        },
        {
          kind: "gap",
          title: "What deletion does not reach",
          text: "Deletion is new and has had little real-world use. The database provider may keep backups or history of its own (see above), Cloudflare keeps request logs on its own schedule, and short-lived reply and rate-limit counters at Upstash expire by themselves within hours to days. An open tab on another device could briefly recreate an empty account record (an ID with no data) until its session ends. If the button reports that deletion is unavailable or fails, your data is left as it was and you can try again or ask in a GitHub issue.",
        },
        { kind: "sub", title: "Getting a copy of your data" },
        {
          kind: "gap",
          title: "Automated export is not built",
          text: "Settings has a Request data export button, but it only writes today's date into your own settings. It notifies no one and starts no export, despite what the screen says about being contacted. To get a copy, contact the maintainer as described under Contact.",
        },
      ],
    },
    {
      id: "security-and-transfers",
      title: "Security and where data travels",
      blocks: [
        { kind: "sub", title: "What is in place" },
        {
          kind: "list",
          items: [
            "Traffic uses HTTPS, with HSTS and a content-security policy on the web app and this site.",
            "Sign-in is handled by Neon Auth. Cadence's API checks a signed token against Neon's public keys on every request and never sees your password.",
            "The database enforces row-level security: each request runs as your account, so another account's rows are invisible to it.",
            "Per-IP and per-account rate limits, request size limits, input validation, and an allowlist for which websites may call the API.",
            "Photo storage is private with no public address. A photo can only be read back through an authenticated request from its owner. Uploads are re-encoded and stripped of metadata server-side.",
            "Cadence's own log lines use a short hash of your user id, not the id or email, and do not log successful requests. Cloudflare keeps its own request records.",
            "Desktop: your sign-in token is kept in the OS keyring, and updates are verified with a signature before they install.",
          ],
        },
        {
          kind: "p",
          text: "No system is perfectly secure, and Cadence is beta software. Row-level security separates users from each other; it does not hide data from the maintainer, who has administrative access to the database and storage as the operator.",
        },
        { kind: "sub", title: "International transfers" },
        {
          kind: "p",
          text: "Cadence's servers and database are in the United States (US East), run by a maintainer in Canada, and Cloudflare serves traffic globally. The AI providers and some other services above may process data in other countries. If you are in the EU, UK or elsewhere, using Cadence means your data is sent to Canada and the United States at least.",
        },
        {
          kind: "gap",
          title: "No transfer agreements reviewed",
          text: "The project holds no data processing agreements or transfer mechanisms of its own, and none were reviewed for this page. The providers' standard terms apply. There has also been no independent security audit or penetration test.",
        },
      ],
    },
    {
      id: "children",
      title: "Children",
      blocks: [
        {
          kind: "p",
          text: "Cadence is not for children. You should be 16 or older to have an account, or the age at which you can consent to an online service where you live if that is higher. Cadence does not knowingly collect a child's data, and if you learn a child has an account, tell the maintainer and it will be deleted.",
        },
        {
          kind: "gap",
          title: "No age check",
          text: "Sign-up has no age check, and the 16-year minimum is the maintainer's proposal that still needs confirming. Google and GitHub sign-in have their own age rules.",
        },
      ],
    },
    {
      id: "your-rights",
      title: "Your rights",
      blocks: [
        {
          kind: "p",
          text: "Depending on where you live, you may have these rights over your personal data, and Cadence will honour them for anyone, anywhere:",
        },
        {
          kind: "list",
          items: [
            "See the data Cadence holds about you, and get a copy in a usable format.",
            "Correct it. Most of it you can edit directly in the app.",
            "Delete it, or restrict or object to how it is used.",
            "Withdraw consent you gave, such as precise location, notifications or usage diagnostics.",
            "Take the data elsewhere (portability).",
          ],
        },
        { kind: "sub", title: "By region" },
        {
          kind: "list",
          items: [
            "EU and UK (GDPR, UK GDPR): all of the above, plus the right to complain to your data protection authority. The grounds for using your data are providing the service you asked for, your consent for optional features, and the maintainer's legitimate interest in keeping the service secure and working.",
            "California (CCPA and CPRA): to know, delete and correct. Cadence does not sell or share personal information for advertising, so there is nothing to opt out of, and you will not be treated worse for using your rights.",
            "Canada (PIPEDA): access, challenge accuracy, withdraw consent, and complain to the Office of the Privacy Commissioner of Canada.",
            "Quebec (Law 25): access, correction, portability and deletion. That law expects a named person responsible for personal information; here that is the maintainer.",
          ],
        },
        { kind: "sub", title: "How to use them" },
        {
          kind: "p",
          text: "Contact the maintainer as described under Contact. You may be asked to show the request really comes from you. The maintainer will try to answer within 30 days. Requests are free unless they are plainly abusive.",
        },
        {
          kind: "gap",
          title: "Deadlines and process are a proposal",
          text: "The 30-day response time is a target, not a measured service level. Export is manual today, as described above.",
        },
      ],
    },
    {
      id: "changes-and-contact",
      title: "Changes and contact",
      blocks: [
        {
          kind: "p",
          text: "When Cadence changes how it handles data, this page is updated in the same release. The date at the top is when it was last checked against the app. Material changes will also be listed in the in-app changelog.",
        },
        {
          kind: "p",
          text: "To reach the maintainer, open an issue at [github.com/toricodesthings/Cadence/issues](https://github.com/toricodesthings/Cadence/issues). Issues are public: do not put personal data, account details or a security vulnerability in one. Say only that you want to use a privacy right and how you would like to be contacted.",
        },
        {
          kind: "gap",
          title: "No private contact address yet",
          text: "There is no dedicated privacy or legal email address. Until one is set up, a public issue is the only listed channel, which is a poor fit for private requests.",
        },
      ],
    },
    {
      id: "whats-missing",
      title: "What's missing or unfinished",
      blocks: [
        {
          kind: "p",
          text: "The short list of things this policy cannot yet promise or that are not built.",
        },
        {
          kind: "list",
          items: [
            "This text has not been reviewed by a lawyer.",
            "No legal entity, privacy officer, or private contact email exists yet; the maintainer is researching whether to form an entity.",
            "Automated data export is not built (the Request data export button only records a date). Account deletion is self-service but new, and does not reach provider backups or logs.",
            "Most data has no automatic expiry: tasks, notes, Trash, conversations and accounts stay until deleted.",
            "AI providers' retention and training practices could not be verified from the code, and the region of several services is unknown.",
            "Usage diagnostics are on by default and tied to your account, even though the app calls them anonymous.",
            "The Crash reports and Store recent searches switches do not do anything.",
            "Signing out leaves a cached copy of your workspace on the device.",
            "Assistant memory is an unfinished stub and currently stores nothing.",
            "Whether Cloudflare's analytics or security cookies are active at the network edge could not be verified.",
            "No data processing agreements were reviewed, and there has been no independent security audit.",
            "The minimum age of 16 is a proposal, and sign-up does not check age.",
          ],
        },
      ],
    },
  ],
};
