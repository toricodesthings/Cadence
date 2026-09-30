import type { LegalDoc } from "./types";

/*
 * Checked against the code on 2026-09-30 (release 0.25.x). Anything the repository could not settle is a `gap`
 * block, not a guess. Keep this in step with privacy.ts.
 */
export const TERMS: LegalDoc = {
  title: "Terms of Service",
  description:
    "The plain-language rules for using Cadence: a free, pre-release planner run by one maintainer, with an honest list of what is still undecided.",
  lede: "The rules for using Cadence, written to be read. Cadence is free, pre-release and run by one person, so some things are simply not promised, and this page says which.",
  updated: "2026-09-30",
  inShort: [
    "Cadence is free, in beta, and run by one person. It can change, break or go away, so keep your own copies of anything that matters.",
    "Your tasks, notes and other content stay yours. You give Cadence only the permission it needs to store, sync and show them.",
    "The AI assistant can be wrong. It makes changes only as you allow, and you are responsible for what you approve.",
    "An outside assistant you connect acts as you, within the access you gave. Disconnect any time.",
    "Use Cadence lawfully and without attacking or overloading it. Either side can end the relationship.",
    "You can delete your account yourself in Settings, permanently and with no way to restore it. Automated data export is not built yet.",
  ],
  sections: [
    {
      id: "agreeing",
      title: "Agreeing to these terms",
      blocks: [
        {
          kind: "p",
          text: "By creating an account or using Cadence (the web app at dashboard.cadenceapp.cloud, the desktop app, the assistant, the connected-assistant server and this website), you agree to these terms and to the [Privacy Policy](https://cadenceapp.cloud/privacy). If you do not agree, do not use Cadence.",
        },
        {
          kind: "p",
          text: "\"Cadence\" and \"the maintainer\" mean the individual who builds and runs it (GitHub: [toricodesthings](https://github.com/toricodesthings)), based in Toronto, Ontario, Canada. No company or other legal entity stands behind it yet; the maintainer is researching whether and how to form one, and these terms will say so when that changes.",
        },
        {
          kind: "sub",
          title: "Who can use it",
        },
        {
          kind: "p",
          text: "You must be 16 or older, or the age at which you can agree to an online service where you live if that is higher. You must also be able to form a binding agreement, and not be barred from using the service under the law that applies to you.",
        },
        {
          kind: "gap",
          title: "Undecided: minimum age, and how you accept",
          text: "The 16-year minimum is the maintainer's proposal to be confirmed, and sign-up does not check age. Sign-up also does not currently ask you to tick or link these terms, so acceptance rests on using Cadence.",
        },
      ],
    },
    {
      id: "the-service",
      title: "The service and its beta status",
      blocks: [
        {
          kind: "p",
          text: "Cadence is a planner: tasks, routines, a calendar, captures, and an AI assistant, available on the web and as a desktop app. It is pre-release software (version 0.x). Features may be unfinished, renamed, changed or removed, and some screens say \"coming soon\". Bugs happen.",
        },
        {
          kind: "p",
          text: "Cadence is for everyday planning. It is not built for emergencies, medical, legal, financial or other safety-critical uses, so do not rely on it as the only place a critical deadline or commitment lives.",
        },
      ],
    },
    {
      id: "accounts",
      title: "Your account",
      blocks: [
        {
          kind: "list",
          items: [
            "Give accurate sign-up details and keep them reasonably current.",
            "Keep your password, your linked Google or GitHub login, and your devices secure. You are responsible for activity under your account unless you tell the maintainer promptly that it was not you.",
            "One person per account. Do not share or sell access to it.",
            "Tell the maintainer as soon as you suspect unauthorised access. Settings lets you see your signed-in devices and end other sessions.",
          ],
        },
      ],
    },
    {
      id: "your-content",
      title: "Your content",
      blocks: [
        {
          kind: "p",
          text: "What you put into Cadence (tasks, notes, lists, routines, captures, events, settings, photos, what you tell the assistant) is your content, and you keep all rights in it. Cadence claims no ownership of it.",
        },
        {
          kind: "p",
          text: "To run the service you give the maintainer a limited, non-exclusive, worldwide, royalty-free permission to store, copy, transmit, process and display your content, only as needed to provide Cadence to you: syncing it across your devices, showing it back to you, running the assistant you ask to use, and keeping the service secure and working. That permission ends when your content or account is deleted, apart from the short delays described in the Privacy Policy.",
        },
        {
          kind: "p",
          text: "You promise you have the right to put the content you add into Cadence and that it does not break someone else's rights or the law. Cadence does not use your content to advertise, and does not sell it. Cadence does not review your content as a matter of course, but may look at it where needed to fix a fault, keep the service secure, or act on a report or legal requirement.",
        },
      ],
    },
    {
      id: "ai-assistant",
      title: "The AI assistant",
      blocks: [
        {
          kind: "p",
          text: "Emilie, the assistant, uses AI models run by third parties. When you message it, your message and the parts of your Cadence it needs are sent to them, as set out in the Privacy Policy.",
        },
        {
          kind: "list",
          items: [
            "It can be wrong. It may misread you, invent details, miss tasks, get dates or time zones wrong, or be confidently mistaken. Check what it says and does.",
            "It changes your data only in the way you allow. In Ask mode you confirm each change; in Auto mode it confirms only risky ones; in Full mode it acts without asking, including permanent deletes. Choose the mode you are comfortable with.",
            "You are responsible for what you approve, and for changes made in a mode you chose. Trash and Undo help, but permanent deletes cannot be undone.",
            "It is not professional advice of any kind, and is no substitute for your own judgement.",
            "Do not send it anything you would not be comfortable sharing with its AI providers. Photos and text you send can contain other people's information, so only share what you are entitled to share.",
            "Use is capped per account (by default 150 replies per 5 hours and 1,500 per week, plus photo limits). These limits can change, and the assistant can be paused, changed or removed at any time.",
          ],
        },
      ],
    },
    {
      id: "connected-assistants",
      title: "Connected and third-party assistants",
      blocks: [
        {
          kind: "p",
          text: "You can connect an outside assistant, such as Claude, to your Cadence. When you approve it, it can act as you within the access you granted: read your data, add to Capture, or change your data including permanent deletes. It cannot change your settings.",
        },
        {
          kind: "list",
          items: [
            "You are responsible for what you connect and approve. Only connect assistants you trust, and pick the smallest access you need.",
            "Actions it takes count as yours. Its provider, not Cadence, decides how it behaves and what it does with what it reads, under that provider's terms.",
            "You can Disconnect at any time in Settings. That stops new access straight away but cannot take back what was already read.",
            "Cadence may block or disconnect an assistant that is unsafe, abusive or overloading the service.",
          ],
        },
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      blocks: [
        { kind: "p", text: "Use Cadence lawfully and considerately. Do not:" },
        {
          kind: "list",
          items: [
            "break the law, or use Cadence to harass, threaten, defraud or harm others;",
            "upload or store content that is illegal, or that exploits or endangers children;",
            "attack, probe for weaknesses in, overload, or disrupt Cadence or the services it relies on, or get around rate limits, usage limits or access controls;",
            "access another person's account or data, or use an account that is not yours;",
            "use scripts or bots to sign up in bulk, or to resell or redistribute the service;",
            "use the assistant to produce malware, or to attempt to make it ignore its safety limits or leak its instructions;",
            "misuse the connected-assistant server with clients that impersonate others or hide what they do.",
          ],
        },
        {
          kind: "p",
          text: "Looking for security problems in good faith is welcome, but do not exploit what you find or publish details first. There is no private security channel yet (see Contact), so ask for one in a public issue without describing the problem.",
        },
      ],
    },
    {
      id: "open-source",
      title: "Open source and the hosted service",
      blocks: [
        {
          kind: "p",
          text: "Cadence's source code is public at [github.com/toricodesthings/Cadence](https://github.com/toricodesthings/Cadence), and the project describes itself as open source and self-hostable. The code is one thing and the hosted service at cadenceapp.cloud is another: these terms govern your use of the hosted service and the apps the maintainer distributes, not your rights in the code.",
        },
        {
          kind: "p",
          text: "Cadence's name, logo and artwork are not licensed for use in a way that suggests you are the official service. If you run your own copy, you are the one responsible for your users' data and for your own terms.",
        },
        {
          kind: "p",
          text: "The code is licensed under the [GNU Affero General Public License v3.0](https://github.com/toricodesthings/Cadence/blob/main/LICENSE). You may run, study, change and share it under that licence, including hosting your own instance. If you run a modified version as a network service, the AGPL requires you to offer its users the source of your changes.",
        },
      ],
    },
    {
      id: "free-service",
      title: "Free service, and if that changes",
      blocks: [
        {
          kind: "p",
          text: "Cadence has no paid plan today, and the project states it intends to stay free. It contains no billing or payment code. There are no ads.",
        },
        {
          kind: "p",
          text: "If paid features or plans are ever added, they will be described separately before you are asked to pay anything, and nothing you already have will start costing money without your agreement. Because the service is free, it comes with fewer promises, as described below.",
        },
      ],
    },
    {
      id: "availability-and-third-parties",
      title: "Availability, backups and third parties",
      blocks: [
        {
          kind: "p",
          text: "Cadence is offered on a best-effort basis by one person. It may be slow, down for maintenance or unavailable, and may lose data through a bug, outage, provider failure or mistake. No uptime or recovery time is promised.",
        },
        {
          kind: "list",
          items: [
            "No backup guarantee. Keep your own copies of anything important.",
            "Cadence works offline and catches up later, but unsynced changes are kept only on your device and can be lost, for example if you sign out and choose to discard them.",
            "Cadence depends on third parties, including Cloudflare, Neon, OpenRouter and the AI model hosts, Upstash, Open-Meteo, OpenStreetMap, the public-holiday services, GitHub, and Google and GitHub for optional sign-in. Their outages or changes can affect Cadence, and their own terms apply to what they do. Weather and holiday data are provided as is.",
            "The desktop app checks GitHub for signed updates and may ask you to install them.",
          ],
        },
        {
          kind: "gap",
          title: "Getting your data out is manual",
          text: "The app's Request data export button only records a date in your own settings and does not start an export or notify anyone. To get a copy of your data, ask the maintainer (see Contact). Do not count on a fast answer; there is no promised turnaround.",
        },
      ],
    },
    {
      id: "ending",
      title: "Ending your use",
      blocks: [
        {
          kind: "sub",
          title: "You can stop at any time",
        },
        {
          kind: "p",
          text: "You can sign out and stop using Cadence whenever you like. You can delete your account yourself in Settings, under Data & Export: type a confirmation phrase and everything in it is erased. Deletion is permanent. Nothing can be restored afterwards, not by you and not by the maintainer.",
        },
        {
          kind: "sub",
          title: "Suspension or closure by Cadence",
        },
        {
          kind: "p",
          text: "The maintainer may limit, suspend or end your access without notice if you seriously or repeatedly break these terms, if your use is unlawful, unsafe or harms the service or other people, or if needed to protect the service. In other cases, such as retiring a feature or shutting Cadence down, the maintainer will try to give reasonable notice and a chance to get your data out, but cannot promise it.",
        },
        {
          kind: "p",
          text: "When your access ends, your right to use Cadence ends. Sections that by their nature should continue (your content ownership, disclaimers, liability, governing law) continue.",
        },
        {
          kind: "gap",
          title: "No appeal process",
          text: "There is no formal process to appeal a suspension. If you think it was a mistake, contact the maintainer and explain.",
        },
      ],
    },
    {
      id: "disclaimers-and-liability",
      title: "Disclaimers and liability",
      blocks: [
        {
          kind: "p",
          text: "Cadence is provided \"as is\" and \"as available\", without warranties of any kind, express or implied, including that it will be uninterrupted, error-free, secure, fit for a particular purpose, or that AI output or weather, holiday or other third-party data will be accurate. This is a free, pre-release service.",
        },
        {
          kind: "p",
          text: "To the fullest extent the law allows, the maintainer is not liable for indirect, incidental, special or consequential losses, or for lost data, lost profits, missed deadlines or appointments, or anything that follows from the assistant's output or an outside assistant's actions. Total liability for any claim is limited to what you paid to use Cadence in the 12 months before the claim, which for a free service is nothing.",
        },
        {
          kind: "p",
          text: "Nothing in these terms limits liability that cannot lawfully be limited (such as for fraud, wilful misconduct or gross negligence, or for death or personal injury), or takes away rights you have under consumer or privacy law that cannot be waived. Where your local law does not allow part of this section, that part applies only as far as it lawfully can.",
        },
        {
          kind: "sub",
          title: "Your responsibility for harm you cause",
        },
        {
          kind: "p",
          text: "If you knowingly break these terms or the law in a way that leads to a third party bringing a claim against the maintainer, you agree to cover the reasonable costs that result. This does not apply to ordinary use of Cadence, or to mistakes made in good faith.",
        },
        {
          kind: "gap",
          title: "Limits need a lawyer's check",
          text: "How far a liability limit and an indemnity can be enforced differs by place, especially for consumers. These clauses are drafted to be modest, but have not been reviewed by a lawyer.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to these terms",
      blocks: [
        {
          kind: "p",
          text: "Cadence changes, and these terms may need to as well. When they change, this page is updated and the date at the top moves. Material changes will be listed in the in-app changelog, and the new terms apply from then. If you keep using Cadence after a change you accept it; if you do not, stop using it and delete your account.",
        },
        {
          kind: "gap",
          title: "No direct notice",
          text: "Cadence does not send email, so there is no email notice of changes. The in-app changelog and this page are the places to look.",
        },
      ],
    },
    {
      id: "governing-law",
      title: "Governing law and disputes",
      blocks: [
        {
          kind: "p",
          text: "These terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there. Courts in Ontario have jurisdiction over disputes, unless a mandatory consumer law where you live gives you the right to bring a claim in your own home courts, in which case that right is kept.",
        },
        {
          kind: "p",
          text: "Before anyone goes to court, please contact the maintainer and try to sort it out informally.",
        },
        {
          kind: "gap",
          title: "Owner decision: governing law",
          text: "Ontario and Canada are proposed because the maintainer is based in Toronto. This choice is still to be confirmed, along with whether to add arbitration or a forum clause.",
        },
      ],
    },
    {
      id: "general-and-contact",
      title: "General terms and contact",
      blocks: [
        {
          kind: "list",
          items: [
            "Entire agreement: these terms and the Privacy Policy are the whole agreement between you and the maintainer about Cadence.",
            "If part of these terms is found unenforceable, the rest still applies.",
            "Not insisting on a right now does not give it up later.",
            "You may not transfer your rights under these terms. The maintainer may transfer Cadence, and these terms with it, to a successor, with notice through the changelog.",
            "These terms do not create a partnership, employment or agency between you and the maintainer.",
          ],
        },
        {
          kind: "p",
          text: "To contact the maintainer, open an issue at [github.com/toricodesthings/Cadence/issues](https://github.com/toricodesthings/Cadence/issues). Issues are public, so do not post personal data, account details or security vulnerabilities there. Ask for a private way to continue and say only what you need.",
        },
        {
          kind: "gap",
          title: "No private contact address yet",
          text: "There is no dedicated legal, support or security email address, so a public issue is the only listed channel. A proper address is still to be set up.",
        },
      ],
    },
    {
      id: "whats-missing",
      title: "What's missing or unfinished",
      blocks: [
        {
          kind: "p",
          text: "Things that are undecided, unbuilt or unchecked at the time of writing.",
        },
        {
          kind: "list",
          items: [
            "This text has not been reviewed by a lawyer.",
            "No legal entity exists yet; the maintainer is an individual and is looking into whether to form one.",
            "Governing law (Ontario, Canada) and the minimum age (16) are proposals awaiting confirmation; sign-up has no age check and does not ask you to accept these terms.",
            "Automated data export is not built: the Request data export button records only a date. Account deletion is self-service but new.",
            "No private contact address, no appeal process, and no promised response time.",
            "No uptime, backup or recovery promise of any kind.",
            "AI providers' data retention and training could not be verified from the code; see the Privacy Policy.",
          ],
        },
      ],
    },
  ],
};
