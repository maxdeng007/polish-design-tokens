# Security Policy

## Supported versions

Security fixes are provided for the latest published version on
[npm](https://www.npmjs.com/package/polish-design-tokens). Older versions are
not maintained — please upgrade before reporting an issue against them.

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
(Security tab → "Report a vulnerability") for this repository, or open a
private security advisory. Do **not** open a public issue for unpatched
vulnerabilities.

Include as much of the following as possible:

- A description of the issue and its impact.
- The version affected (`npm view polish-design-tokens version`).
- Steps to reproduce — ideally a minimal CSS file or project that triggers it.
- Any suggested remediation, if you have one.

You can expect an initial response within a few business days, and we will
coordinate a fix and disclosure timeline with you.

## Scope and safety model

polish is a static auditor for CSS custom properties in **local files**. Its
write path is deliberately conservative:

- **Only mechanical fixes are applied automatically** — currently just
  `duplicate-value` aliasing. All judgmental findings are surfaced for human
  or agent review; nothing is silently patched.
- **Path boundary enforcement.** `polish apply` (and the MCP `polish_apply`
  tool) resolve every patch path against an explicit `target` directory and
  reject anything outside it. Symbolic links are resolved physically
  (`fs.realpathSync`) so boundaries cannot be escaped lexically.
- **Backups.** Every file is backed up (`<file>.backup`) before the first
  modification, and backups are never overwritten by later runs.
- **Stale-delete protection.** `delete` patches must carry the original line
  text (`before`); it is verified against the file before deletion — if the
  file changed after the patch was generated, the delete is refused instead
  of removing the wrong line. A delete without `before` is rejected outright.
  Writes are atomic (temp file + rename).
- **No network access.** The tool reads local files only. It does not fetch
  URLs, and the MCP server only reads and writes within the directories you
  explicitly target.

Because the tool's whole purpose is to modify source files, treat its output
with the same care as any other code-modification tool: review patches and
reports before applying them, especially when handing `polish confirm`
decisions to an automated agent.

## Safe use with AI agents

When an AI agent drives polish through MCP, the same guarantees apply: the
agent must pass an explicit `target` for `polish_apply`, and patches outside
that directory are rejected. Agents should surface judgmental findings to a
human rather than inventing decisions.
