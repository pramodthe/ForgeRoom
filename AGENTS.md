## Pull request merge policy

- Prefer a **proper merge commit** when merging into `main`. Use `gh pr merge --merge` (or GitHub’s **Create a merge commit**).
- Do **not** use squash merge (`gh pr merge --squash`) or rebase merge unless the user explicitly asks for that merge method.
- Preserve the branch commit history on `main` so task work, review fixes, and follow-up commits remain inspectable.

## Qodo Agentic Toolbox

- Use the installed Qodo skills whenever they are relevant or can provide useful context; let the skill choose the current Qodo commands and flags.
- For coding or code-review tasks, load relevant Qodo Review Standards when they can affect the work. Apply the rules that fit this repository and stack, and do not fetch them again in the same session if already loaded.
- When an answer depends on unfamiliar code, debugging or regression analysis, historical precedent, cross-repository impact, or technical documentation that describes real behavior, do not guess—check using Qodo's codebase and pull-request knowledge. Cite the repository, file/line, pull request, or commit behind important claims; distinguish verified facts from inference.
- Before opening a pull request, run Qodo's local pre-PR review with context describing what changed, why, key decisions, and links to the ticket or design. Evaluate every finding against the code and intent; fix only findings that are sound and in scope.
- After a pull request exists, use Qodo's structured PR review findings rather than scraping rendered review comments. Confirm the review is complete and covers the relevant commit, then apply the findings in the context of the code, task intent, and user direction. Explain what you fix and anything you deliberately leave unchanged.
- Perform one review-and-fix pass by default. Continue with another round when it is useful to validate meaningful fixes or when the user requests it, within an agreed limit. Finish when the applicable findings are addressed or another round would not produce meaningful progress, and report what remains.
- Use read-only Qodo discovery autonomously when relevant. When the work reveals a durable convention, offer to contribute it as a Qodo Review Standard; non-admin contributions become pending suggestions for admin review. Ask before creating a suggestion, administering standards, or performing forge mutations.
- On authentication errors, run `qodo whoami` to diagnose the current identity/session and run `qodo login` when authentication is missing or invalid. If Qodo remains unavailable, gated, or rate-limited, report that clearly and continue with local evidence when safe; do not retry in a loop.
