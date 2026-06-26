# Skill: PR Description

## Description
Triggered when the user asks to write a PR description, create a pull request, or summarize changes. Generates a PR title + body following the project's PR standards.

## Trigger Patterns
- "write a PR description", "create a pull request", "PR for this", "summarize changes for PR"

## Process
1. Run `git diff main...HEAD --stat` to get the file list.
2. Run `git log main...HEAD --oneline` to get commit history.
3. Infer the intent from the diff — do not just list files changed.
4. Generate title (under 70 chars, `<type>: <what>` format).
5. Generate body using the template from `.claude/rules/pr.md`.

## Output
Ready-to-paste PR title and body. Include manual test steps specific to the change (e.g., "Upload a Jira CSV and verify customer names are deduplicated" not just "test the feature").
