## Pull request merge policy

- Prefer a **proper merge commit** when merging into `main`. Use `gh pr merge --merge` (or GitHub’s **Create a merge commit**).
- Do **not** use squash merge (`gh pr merge --squash`) or rebase merge unless the user explicitly asks for that merge method.
- Preserve the branch commit history on `main` so task work, review fixes, and follow-up commits remain inspectable.
