---
name: owasp-asvs-l2-checklist
description: Comprehensive, agent-friendly OWASP ASVS Level 2 assessment workflow for framework-agnostic web applications. Use when performing secure design reviews, code reviews, architecture reviews, release readiness checks, or producing a full ASVS L2 checklist report.
---

# OWASP ASVS L2 Checklist

Comprehensive, framework-agnostic skill for reviewing a web application against the full OWASP ASVS Level 2 control set.

This skill is designed for agents. It tells the agent what evidence to gather, how to evaluate each requirement, and how to produce a usable report rather than a loose set of observations.

Primary baseline:

- OWASP ASVS 4.0.3 Level 2

Modern overlay references to keep the review current:

- OWASP Cheat Sheet Series
- OWASP Session Management Cheat Sheet
- OWASP Authentication Cheat Sheet
- OWASP Access Control Cheat Sheet
- OWASP Cryptographic Storage Cheat Sheet
- OWASP Secrets Management Cheat Sheet
- OWASP CI/CD Security Cheat Sheet
- NIST SP 800-63 guidance for authentication and session strength

Use this skill for:

- Full ASVS L2 gap assessments
- Pre-release security reviews
- Architecture and design reviews
- Secure code reviews
- Security acceptance criteria creation
- Building a remediation backlog from ASVS findings

Do not use this skill for:

- Mobile-only reviews
- Network pentests without source/config access
- Non-web systems unless the system exposes a web app or web API surface

## Output Contract

When using this skill, produce results in this order:

1. Assessment scope
2. Assumptions and access level
3. Executive risk summary
4. Findings by severity
5. Full ASVS L2 checklist with status for every applicable control
6. Evidence for each failed or partial control
7. Concrete remediation backlog
8. Residual risks and unverified areas

Use these statuses only:

- `PASS`
- `FAIL`
- `PARTIAL`
- `NOT APPLICABLE`
- `NOT VERIFIED`

For every non-`PASS` result, include:

- control ID
- exact gap
- why it matters
- attack path or abuse case
- evidence location
- recommended remediation

## Assessment Workflow

### 1. Establish review boundaries

Identify:

- application type
- authentication model
- session model
- API types in use: REST, GraphQL, SOAP, serverless endpoints
- trust boundaries
- sensitive data classes
- admin surfaces
- file upload/download surfaces
- external integrations
- CI/CD and deployment model

### 2. Gather evidence

Prefer direct evidence over inference. Gather from:

- source code
- infrastructure and deployment config
- headers and runtime behavior
- authentication and session flows
- test suites
- dependency manifests
- CI/CD definitions
- environment and secret handling patterns
- architecture docs

### 3. Evaluate each control

For each ASVS item:

- verify implementation exists
- verify implementation is enforced in trusted layers
- verify the control is consistent across all paths
- verify edge cases and alternative flows
- verify the implementation matches modern guidance, not just nominal presence

### 4. Produce a remediation-ready report

Do not stop at naming controls. Convert failures into implementation work.

## Rating Guidance

- `PASS`: control is implemented correctly and consistently
- `PARTIAL`: control exists but has gaps, weak coverage, or inconsistent enforcement
- `FAIL`: control is absent or clearly ineffective
- `NOT APPLICABLE`: feature or technology is genuinely not present
- `NOT VERIFIED`: evidence is insufficient

Severity guidance:

- `Critical`: auth bypass, privilege escalation, mass data exposure, signing/key compromise, remote code execution
- `High`: broken authorization, weak session handling, exploitable injection, sensitive data leakage, insecure recovery flows
- `Medium`: incomplete hardening, limited monitoring, weak privacy defaults, inconsistent validation, incomplete CI/CD safeguards
- `Low`: defense-in-depth and operational hygiene gaps with limited standalone exploitability

## Modern Best-Practice Overlay

Apply these overlays while scoring ASVS L2:

- Prefer phishing-resistant MFA and passkeys/WebAuthn over SMS or email where practical.
- Prefer strict session cookies with `Secure`, `HttpOnly`, `SameSite`, and `__Host-` when browser sessions are used.
- Prefer short-lived signed tokens with revocation strategy over static API keys.
- Prefer centralized authorization and deny-by-default resource checks over UI-only protection.
- Prefer parameterized interpreters, schema validation, and safe framework defaults over sanitization-only approaches.
- Prefer CSP with meaningful script restrictions over token header presence without effective policy.
- Prefer vault-backed secret handling, rotation, and signed build provenance for deployment pipelines.
- Prefer SBOMs, dependency scanning, trusted registries, and signed or attestable build artifacts.

## Full OWASP ASVS 4.0.3 Level 2 Checklist

Deleted ASVS rows are intentionally omitted. Recommended-only items are marked separately and must not be treated as required failures.

### V1 Architecture, Design and Threat Modeling

- [ ] `1.1.1` Use a secure SDLC that addresses security in all development stages.
- [ ] `1.1.2` Perform threat modeling for every design change or sprint-planning change.
- [ ] `1.1.3` Ensure user stories and features include functional security constraints.
- [ ] `1.1.4` Document and justify trust boundaries, components, and major data flows.
- [ ] `1.1.5` Define and review the application's high-level architecture and connected remote services.
- [ ] `1.1.6` Use centralized, simple, vetted, reusable security controls.
- [ ] `1.1.7` Provide a secure coding checklist, requirements, guideline, or policy to developers and testers.
- [ ] `1.2.1` Use unique or special low-privilege OS accounts for application components and services.
- [ ] `1.2.2` Authenticate communication between components and enforce least privilege.
- [ ] `1.2.3` Use a single vetted authentication mechanism that supports strong auth and monitoring.
- [ ] `1.2.4` Ensure all authentication pathways and identity APIs have consistent security strength.
- [ ] `1.4.1` Enforce access control in trusted enforcement points, never on the client alone.
- [ ] `1.4.4` Use a single well-vetted access control mechanism for protected data and resources.
- [ ] `1.4.5` Use attribute or feature-based authorization checks, not role-only checks.
- [ ] `1.5.1` Define input and output handling requirements by type, content, and compliance obligations.
- [ ] `1.5.2` Avoid serialization to untrusted clients, or protect it with integrity and, where needed, encryption.
- [ ] `1.5.3` Enforce input validation on a trusted service layer.
- [ ] `1.5.4` Perform output encoding close to the target interpreter.
- [ ] `1.6.1` Maintain an explicit cryptographic key management policy and lifecycle.
- [ ] `1.6.2` Protect key material and secrets through vault or API-based secure services.
- [ ] `1.6.3` Make keys and passwords replaceable and support re-encryption processes.
- [ ] `1.6.4` Treat client-side secrets as insecure and never rely on them to protect sensitive data.
- [ ] `1.7.1` Use a common logging format and approach across the system.
- [ ] `1.7.2` Transmit logs securely to a preferably remote analysis and alerting system.
- [ ] `1.8.1` Identify and classify all sensitive data into protection levels.
- [ ] `1.8.2` Define and apply protection requirements for each data protection level.
- [ ] `1.9.1` Encrypt communication between components, especially across hosts, sites, clouds, or networks.
- [ ] `1.9.2` Verify authenticity on both sides of component communication links.
- [ ] `1.10.1` Use source control with traceable, access-controlled, user-attributable changes.
- [ ] `1.11.1` Define and document application components by business or security function.
- [ ] `1.11.2` Ensure high-value business logic flows do not share unsynchronized state.
- [ ] `1.12.2` Serve user-uploaded files via safe download handling or unrelated domains, with suitable CSP.
- [ ] `1.14.1` Segregate components of differing trust levels with explicit security controls.
- [ ] `1.14.2` Use binary signatures, trusted connections, and verified endpoints for remote deployment.
- [ ] `1.14.3` Make the build pipeline warn on outdated or insecure components and act on it.
- [ ] `1.14.4` Include automated secure deployment verification in the build pipeline.
- [ ] `1.14.5` Sandbox, containerize, or network-isolate deployments to limit lateral movement.
- [ ] `1.14.6` Avoid unsupported or deprecated client-side technologies.

Review focus:

- architecture docs
- auth and authz centralization
- deployment topology
- CI/CD controls
- component trust separation

### V2 Authentication

- [ ] `2.1.1` Require user-set passwords to be at least 12 characters.
- [ ] `2.1.2` Permit passwords up to at least 64 characters and reject above 128.
- [ ] `2.1.3` Do not truncate passwords.
- [ ] `2.1.4` Permit printable Unicode in passwords.
- [ ] `2.1.5` Allow users to change their password.
- [ ] `2.1.6` Require current and new password for password changes.
- [ ] `2.1.7` Check registration, login, and password-change submissions against breached-password datasets using a privacy-preserving approach.
- [ ] `2.1.8` Provide a password strength meter.
- [ ] `2.1.9` Do not enforce composition rules like mandatory uppercase, numbers, or symbols.
- [ ] `2.1.10` Do not require periodic rotation or password history as a blanket control.
- [ ] `2.1.11` Allow paste, password helpers, and password managers.
- [ ] `2.1.12` Allow temporary reveal of masked passwords where platform behavior does not already provide it.
- [ ] `2.2.1` Implement effective anti-automation controls and cap failed attempts on one account to no more than 100 per hour.
- [ ] `2.2.2` Restrict weak authenticators like SMS and email to weaker use cases and prefer stronger methods first.
- [ ] `2.2.3` Send secure notifications after auth-detail changes and risky logins.
- [ ] `2.3.1` Securely generate and expire system-generated initial passwords or activation codes; never allow them to become long-term passwords.
- [ ] `2.3.2` Support enrollment and use of user-provided authentication devices such as U2F or FIDO tokens.
- [ ] `2.3.3` Send timely renewal instructions for expiring authenticators.
- [ ] `2.4.1` Store passwords with salted approved password hashing or key derivation resistant to offline attack.
- [ ] `2.4.2` Use unique per-credential salts of at least 32 bits.
- [ ] `2.4.3` If using PBKDF2, use a high iteration count, typically at least 100,000.
- [ ] `2.4.4` If using bcrypt, use a work factor of at least 10 and as high as performance allows.
- [ ] `2.4.5` Add a secret verifier-side salt or pepper stored separately from password hashes.
- [ ] `2.5.1` Never send initial activation or recovery secrets in cleartext.
- [ ] `2.5.2` Do not use password hints or knowledge-based questions.
- [ ] `2.5.3` Never reveal the current password in recovery flows.
- [ ] `2.5.4` Eliminate shared or default accounts.
- [ ] `2.5.5` Notify users when an authentication factor is changed or replaced.
- [ ] `2.5.6` Use secure recovery mechanisms such as TOTP, mobile push, or offline recovery.
- [ ] `2.5.7` When MFA or OTP factors are lost, require identity proofing at the same strength as enrollment.
- [ ] `2.6.1` Ensure lookup secrets are one-time use.
- [ ] `2.6.2` Give lookup secrets sufficient randomness or hash them with unique salt if lower-entropy.
- [ ] `2.6.3` Make lookup secrets resistant to offline attacks and predictable-value attacks.
- [ ] `2.7.1` Do not offer SMS or PSTN out-of-band authenticators by default when stronger options exist.
- [ ] `2.7.2` Expire out-of-band requests, codes, or tokens after 10 minutes.
- [ ] `2.7.3` Make out-of-band requests, codes, and tokens single-use and bound to the original auth request.
- [ ] `2.7.4` Use a secure independent channel for out-of-band authenticator communication.
- [ ] `2.7.5` Retain only a hashed version of out-of-band authentication codes.
- [ ] `2.7.6` Generate initial out-of-band authentication codes with a secure RNG and at least 20 bits of entropy.
- [ ] `2.8.1` Define OTP lifetime before expiration.
- [ ] `2.8.2` Protect OTP verification keys with high-assurance storage.
- [ ] `2.8.3` Use approved cryptographic algorithms for OTP generation, seeding, and verification.
- [ ] `2.8.4` Ensure time-based OTPs are one-time use within their validity period.
- [ ] `2.8.5` Log and reject reused time-based MFA OTPs and notify the device holder.
- [ ] `2.8.6` Allow immediate revocation of stolen or lost physical OTP generators across sessions.
- [ ] `2.9.1` Store cryptographic verifier keys securely, using TPM, HSM, or OS-protected storage.
- [ ] `2.9.2` Use a challenge nonce at least 64 bits long and unique over device lifetime.
- [ ] `2.9.3` Use approved algorithms for cryptographic verifier generation, seeding, and verification.
- [ ] `2.10.1` For service auth, avoid unchanging credentials such as static passwords, shared accounts, or static API keys; L2 expects at least OS-assisted protection.
- [ ] `2.10.2` Ensure service-auth passwords are not default credentials; L2 expects at least OS-assisted protection.
- [ ] `2.10.3` Store service-auth passwords with protection against offline recovery; L2 expects at least OS-assisted protection.
- [ ] `2.10.4` Manage internal secrets, seeds, database credentials, and API keys securely outside source control; L2 expects at least OS-assisted protection.

Recommended but not required at L2:

- `2.8.7` Limit biometrics to use as a secondary factor with something-you-have and something-you-know.

Review focus:

- password policy and storage
- login throttling
- MFA enrollment and recovery
- recovery and factor replacement
- service-to-service secrets

### V3 Session Management

- [ ] `3.1.1` Never reveal session tokens in URL parameters.
- [ ] `3.2.1` Generate a new session token upon user authentication.
- [ ] `3.2.2` Ensure session tokens have at least 64 bits of entropy.
- [ ] `3.2.3` Store session tokens only via secure browser mechanisms such as secured cookies or session storage.
- [ ] `3.2.4` Generate session tokens using approved cryptographic algorithms.
- [ ] `3.3.1` Invalidate session tokens on logout and expiration so sessions cannot be resumed by back-button or downstream parties.
- [ ] `3.3.2` If persistent login is allowed, require periodic re-authentication within L2 bounds: 12 hours active use or 30 minutes idle, with 2FA optional.
- [ ] `3.3.3` After successful password change or reset, offer termination of all other sessions across the app and relying parties.
- [ ] `3.3.4` Let users view and terminate any or all active sessions and devices, with re-entry of credentials.
- [ ] `3.4.1` Set `Secure` on cookie-based session tokens.
- [ ] `3.4.2` Set `HttpOnly` on cookie-based session tokens.
- [ ] `3.4.3` Set `SameSite` on cookie-based session tokens.
- [ ] `3.4.4` Use the `__Host-` prefix for cookie-based session tokens.
- [ ] `3.4.5` Use the most precise cookie path if multiple apps share a parent domain.
- [ ] `3.5.1` Allow users to revoke OAuth tokens used for linked trust relationships.
- [ ] `3.5.2` Use session tokens rather than static API secrets except for legacy cases.
- [ ] `3.5.3` Protect stateless tokens against tampering, replay, null cipher, key substitution, and related attacks via signatures, encryption, and countermeasures.
- [ ] `3.7.1` Require a full valid login session, re-authentication, or secondary verification before sensitive transactions or account modifications.

Review focus:

- session issuance and rotation
- logout invalidation
- cookie attributes
- device/session management UX
- token revocation and replay resistance

### V4 Access Control

- [ ] `4.1.1` Enforce access control on a trusted service layer.
- [ ] `4.1.2` Prevent end users from manipulating attributes or policy data used by access controls.
- [ ] `4.1.3` Enforce least privilege for functions, data, URLs, services, and resources.
- [ ] `4.1.5` Make access control fail securely, including during exceptions.
- [ ] `4.2.1` Protect sensitive data and APIs against IDOR on create, read, update, and delete operations.
- [ ] `4.2.2` Protect authenticated functionality against CSRF and unauthenticated functionality against effective anti-automation or anti-CSRF where relevant.
- [ ] `4.3.1` Require appropriate MFA for administrative interfaces.
- [ ] `4.3.2` Disable directory browsing and protect metadata such as `.git`, `.svn`, `.DS_Store`, and similar artifacts.
- [ ] `4.3.3` Use step-up auth, adaptive auth, or segregation of duties for fraud-sensitive operations.

### V5 Validation, Sanitization and Encoding

- [ ] `5.1.1` Defend against HTTP parameter pollution.
- [ ] `5.1.2` Defend against mass assignment or unsafe parameter assignment.
- [ ] `5.1.3` Validate all input using positive allowlists.
- [ ] `5.1.4` Strongly type and schema-validate structured data, including allowed characters, formats, lengths, and patterns.
- [ ] `5.1.5` Restrict redirects and forwards to allowlisted destinations or warn on untrusted destinations.
- [ ] `5.2.1` Sanitize all untrusted HTML using a dedicated sanitizer.
- [ ] `5.2.2` Sanitize unstructured data with safety constraints such as length and allowed characters.
- [ ] `5.2.3` Sanitize user input before passing to mail systems to prevent SMTP or IMAP injection.
- [ ] `5.2.4` Avoid `eval()` and dynamic code execution; where unavoidable, sanitize or sandbox input.
- [ ] `5.2.5` Protect against template injection via sanitization or sandboxing.
- [ ] `5.2.6` Protect against SSRF via validation or sanitization plus allowlists for protocol, domain, path, and port.
- [ ] `5.2.7` Sanitize, disable, or sandbox user-supplied SVG scriptable content.
- [ ] `5.2.8` Sanitize, disable, or sandbox user-supplied scriptable template content such as Markdown, CSS, XSL, or BBCode.
- [ ] `5.3.1` Use output encoding appropriate to each target interpreter and context.
- [ ] `5.3.2` Preserve chosen character set and locale safely, including Unicode.
- [ ] `5.3.3` Use context-aware escaping to protect against reflected, stored, and DOM XSS.
- [ ] `5.3.4` Use parameterized queries, ORMs, or equivalent protections against database injection.
- [ ] `5.3.5` Where safer mechanisms are unavailable, use context-specific escaping against interpreter injection.
- [ ] `5.3.6` Protect against JSON injection, JSON eval, and JavaScript expression evaluation attacks.
- [ ] `5.3.7` Protect against LDAP injection.
- [ ] `5.3.8` Protect against OS command injection and use parameterized OS calls or context-aware escaping.
- [ ] `5.3.9` Protect against LFI and RFI.
- [ ] `5.3.10` Protect against XPath and XML injection.
- [ ] `5.4.1` If unmanaged code is used, use memory-safe string and memory operations.
- [ ] `5.4.2` If unmanaged code is used, keep format strings constant and free of hostile input.
- [ ] `5.4.3` If unmanaged code is used, validate sign, range, and input to prevent integer overflow.
- [ ] `5.5.1` Protect serialized objects with integrity checks or encryption.
- [ ] `5.5.2` Configure XML parsers with restrictive settings and disable external entity resolution.
- [ ] `5.5.3` Avoid deserialization of untrusted data or harden custom and third-party parsing.
- [ ] `5.5.4` In JavaScript environments, use `JSON.parse` rather than `eval` for JSON parsing.

### V6 Stored Cryptography

- [ ] `6.1.1` Encrypt regulated private data at rest.
- [ ] `6.1.2` Encrypt regulated health data at rest.
- [ ] `6.1.3` Encrypt regulated financial data at rest.
- [ ] `6.2.1` Ensure cryptographic modules fail securely and do not enable padding-oracle style attacks.
- [ ] `6.2.2` Use industry-proven or government-approved algorithms, modes, and libraries rather than custom crypto.
- [ ] `6.2.3` Configure IVs, cipher settings, and block modes securely.
- [ ] `6.2.4` Make algorithms, key lengths, rounds, ciphers, and modes replaceable.
- [ ] `6.2.5` Avoid insecure block modes, weak hashes, weak ciphers, and deprecated padding except for constrained backward compatibility.
- [ ] `6.2.6` Never reuse nonces, IVs, or other single-use numbers with the same key.
- [ ] `6.3.1` Use approved CSPRNGs for all security-sensitive random values.
- [ ] `6.3.2` Generate random GUIDs using GUID v4 with a CSPRNG.
- [ ] `6.4.1` Use a secrets-management solution such as a key vault to create, store, control, and destroy secrets.
- [ ] `6.4.2` Keep key material isolated from the application and prefer vault-backed cryptographic operations.

### V7 Error Handling and Logging

- [ ] `7.1.1` Do not log credentials or payment data; only hashed forms of session tokens where correlation is needed.
- [ ] `7.1.2` Do not log other sensitive data prohibited by policy or privacy law.
- [ ] `7.1.3` Log security-relevant events including auth success/failure, access control failures, deserialization failures, and input validation failures.
- [ ] `7.1.4` Include enough event context to reconstruct timelines during investigation.
- [ ] `7.2.1` Log all authentication decisions without storing sensitive tokens or passwords.
- [ ] `7.2.2` Log access control decisions where possible and always log failed decisions.
- [ ] `7.3.1` Encode log data to prevent log injection.
- [ ] `7.3.3` Protect security logs from unauthorized access and modification.
- [ ] `7.3.4` Synchronize time sources and use consistent time zones, preferably UTC for global systems.
- [ ] `7.4.1` Show generic messages for unexpected or security-sensitive errors, optionally with support IDs.
- [ ] `7.4.2` Use consistent exception handling or equivalent across the codebase.
- [ ] `7.4.3` Define a last-resort handler for otherwise unhandled exceptions or failures.

### V8 Data Protection

- [ ] `8.1.1` Prevent sensitive data from being cached in server-side intermediaries.
- [ ] `8.1.2` Protect or purge temporary or cached server-side copies of sensitive data after use.
- [ ] `8.1.3` Minimize request parameters such as hidden fields, AJAX variables, cookies, and header values.
- [ ] `8.1.4` Detect and alert on abnormal request volume by IP, user, or relevant dimension.
- [ ] `8.2.1` Set anti-caching headers so sensitive data is not cached in browsers.
- [ ] `8.2.2` Avoid storing sensitive data in browser storage mechanisms.
- [ ] `8.2.3` Clear authenticated data from client storage and DOM after logout or session termination.
- [ ] `8.3.1` Send sensitive data in headers or message bodies, not query strings.
- [ ] `8.3.2` Provide users a way to export or remove their data on demand.
- [ ] `8.3.3` Provide clear notice and obtain opt-in consent before using personal information.
- [ ] `8.3.4` Identify all sensitive data and maintain policy for handling it.
- [ ] `8.3.5` Audit access to sensitive data without logging the data itself.
- [ ] `8.3.6` Overwrite sensitive information in memory when no longer required.
- [ ] `8.3.7` Encrypt required sensitive information with approved confidentiality and integrity protections.
- [ ] `8.3.8` Apply data retention classification and delete old or stale sensitive data appropriately.

### V9 Communications

- [ ] `9.1.1` Use TLS for all client connectivity with no fallback to insecure transport.
- [ ] `9.1.2` Enable only strong cipher suites and prefer the strongest suites.
- [ ] `9.1.3` Enable only current recommended TLS versions such as TLS 1.2 and 1.3, preferring the latest.
- [ ] `9.2.1` Use trusted TLS certificates for server-to-server connections and restrict trust to specific internal CAs where needed.
- [ ] `9.2.2` Use encrypted communications for all inbound and outbound server connections without insecure fallback.
- [ ] `9.2.3` Authenticate encrypted connections to external systems that carry sensitive functions or data.
- [ ] `9.2.4` Enable and configure certificate revocation handling such as OCSP stapling where applicable.

### V10 Malicious Code

- [ ] `10.2.1` Verify source code and third-party libraries do not contain unauthorized phone-home or hidden data collection features.
- [ ] `10.2.2` Verify the application does not request unnecessary or excessive privacy-sensitive permissions.
- [ ] `10.3.1` Secure auto-updates over secure channels and verify digital signatures before install or execution.
- [ ] `10.3.2` Use integrity protections such as code signing or subresource integrity and avoid loading code from untrusted sources.
- [ ] `10.3.3` Protect against subdomain takeover for DNS names, CNAMEs, buckets, serverless resources, and related dependencies.

### V11 Business Logic

- [ ] `11.1.1` Enforce sequential business flows without skipped steps.
- [ ] `11.1.2` Enforce realistic human timing for business flows.
- [ ] `11.1.3` Enforce per-user limits for business actions and transactions.
- [ ] `11.1.4` Apply anti-automation controls against mass exfiltration, repeated logic abuse, file upload abuse, or DoS behavior.
- [ ] `11.1.5` Add business-logic-specific validation and limits based on threat modeling.
- [ ] `11.1.6` Prevent TOCTOU and race conditions in sensitive operations.
- [ ] `11.1.7` Monitor for unusual business-logic events such as out-of-order actions.
- [ ] `11.1.8` Provide configurable alerting for automated attacks and unusual activity.

### V12 Files and Resources

- [ ] `12.1.1` Reject oversized files that can exhaust storage or cause DoS.
- [ ] `12.1.2` Check compressed files against maximum uncompressed size and maximum file count before extraction.
- [ ] `12.1.3` Enforce per-user file quotas and count limits.
- [ ] `12.2.1` Validate untrusted files by actual content type, not just extension or metadata.
- [ ] `12.3.1` Do not use user-supplied filenames directly in filesystem APIs; use safe URL/path APIs.
- [ ] `12.3.2` Validate or ignore user-supplied filename metadata to prevent local file disclosure or modification.
- [ ] `12.3.3` Validate or ignore filename metadata to prevent RFI and SSRF.
- [ ] `12.3.4` Protect against reflective file download by validating filenames and using safe `Content-Type` and fixed `Content-Disposition` filenames.
- [ ] `12.3.5` Do not use untrusted file metadata directly with system APIs or libraries.
- [ ] `12.3.6` Do not include or execute functionality from untrusted CDNs, libraries, packages, or binaries.
- [ ] `12.4.1` Store untrusted files outside the web root with limited permissions.
- [ ] `12.4.2` Scan untrusted files with antivirus or equivalent malware detection before serving.
- [ ] `12.5.1` Configure the web tier to serve only explicit safe file extensions and block source, backup, and temporary artifacts.
- [ ] `12.5.2` Ensure direct requests to uploaded files are never executed as active HTML or JavaScript content.
- [ ] `12.6.1` Configure an allowlist of resources and systems that the server may contact or load.

### V13 API and Web Services

- [ ] `13.1.1` Use the same encodings and parsers across components to avoid parser differential attacks.
- [ ] `13.1.3` Do not expose sensitive information such as API keys or session tokens in API URLs.
- [ ] `13.1.4` Make authorization decisions both at routing/controller level and at resource/model level.
- [ ] `13.1.5` Reject requests with missing or unexpected content types using correct status and headers.
- [ ] `13.2.1` Limit REST methods so they are valid for the user and action.
- [ ] `13.2.2` Validate JSON input against schema before accepting it.
- [ ] `13.2.3` Protect cookie-based REST services against CSRF.
- [ ] `13.2.5` Explicitly check incoming `Content-Type` for REST services.
- [ ] `13.2.6` Ensure message headers and payload are trustworthy and protected in transit.
- [ ] `13.3.1` Validate SOAP/XML against schema, then validate every input field before processing.
- [ ] `13.3.2` Sign SOAP payloads using WS-Security where SOAP is used.
- [ ] `13.4.1` Protect GraphQL and similar data layers with allowlists, depth limits, amount limits, or query-cost analysis.
- [ ] `13.4.2` Implement GraphQL authorization in the business logic layer rather than the GraphQL layer alone.

### V14 Configuration

- [ ] `14.1.1` Use secure, repeatable build and deployment processes such as CI/CD and automated configuration management.
- [ ] `14.1.2` For native or memory-unsafe builds, enable compiler protections and fail builds on unsafe operations.
- [ ] `14.1.3` Harden server configuration according to the server and framework recommendations.
- [ ] `14.1.4` Ensure the app, configuration, and dependencies can be redeployed from automated scripts or restored from tested backups in reasonable time.
- [ ] `14.2.1` Keep all components up to date, ideally with dependency checking during build or compile time.
- [ ] `14.2.2` Remove unneeded features, samples, documentation, and default configs.
- [ ] `14.2.3` Use Subresource Integrity for externally hosted assets.
- [ ] `14.2.4` Source third-party components only from predefined trusted repositories.
- [ ] `14.2.5` Maintain an SBOM for third-party libraries.
- [ ] `14.2.6` Reduce attack surface by sandboxing or encapsulating third-party libraries.
- [ ] `14.3.2` Disable debug modes in production.
- [ ] `14.3.3` Avoid exposing detailed version information in HTTP responses.
- [ ] `14.4.1` Include correct `Content-Type` headers and match response content to declared type.
- [ ] `14.4.2` Include `Content-Disposition: attachment` or equivalent on API responses.
- [ ] `14.4.3` Use a meaningful Content Security Policy.
- [ ] `14.4.4` Include `X-Content-Type-Options: nosniff`.
- [ ] `14.4.5` Include `Strict-Transport-Security` on all responses and subdomains where appropriate.
- [ ] `14.4.6` Include a suitable `Referrer-Policy`.
- [ ] `14.4.7` Prevent third-party framing by default with `frame-ancestors` and `X-Frame-Options` where appropriate.
- [ ] `14.5.1` Accept only HTTP methods actually used by the application and log or alert on invalid methods.
- [ ] `14.5.2` Never use `Origin` as an authentication or authorization decision source.
- [ ] `14.5.3` Use a strict allowlist for CORS origins and never allow the `null` origin.
- [ ] `14.5.4` Authenticate trusted-proxy or SSO-added headers before using them.

## Evidence Expectations

For each control, prefer evidence such as:

- file and symbol references
- config snippets
- request and response headers
- route middleware or policy handlers
- schema definitions
- auth flow behavior
- unit or integration tests
- CI/CD pipeline steps

If evidence is missing, mark `NOT VERIFIED` instead of guessing.

## Final Reporting Template

Use this structure when answering the user:

```md
# ASVS L2 Assessment

## Scope

## Assumptions

## Executive Summary

## Findings By Severity

## Full Checklist
- 1.1.1 - PASS - evidence
- 1.1.2 - PARTIAL - evidence - gap - remediation

## Priority Remediation Plan
1. Immediate
2. Near-term
3. Hardening

## Not Verified / Out of Scope
```

## Notes for Agents

- Do not mark a control `PASS` because a framework claims to handle it. Verify the application's actual use of the framework.
- Do not accept client-side checks as sufficient for auth, authz, validation, or sensitive-flow protection.
- Do not treat headers alone as proof of secure behavior if the backend logic is weak.
- Do not collapse multiple control failures into one vague note. Keep findings traceable to control IDs.
- If the system uses serverless, SPAs, edge functions, BFFs, or microservices, map the same control intent across the actual trust boundaries.
- If the app mixes browser sessions and token APIs, assess both models independently where relevant.