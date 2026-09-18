# Rulesets

A workflow that reports a failure does not by itself stop anyone merging; only the
platform can do that. `integration-branches-require-ci.json` is the ruleset that makes the
three PR checks required on `dev` and `main` (SPEC-0008/FR-008, AC-008).

It lives here because a ruleset is repository configuration that reviewers should be able
to read and change in a pull request, but GitHub has no way to load it from the tree. A
repository administrator applies it once:

```bash
gh api --method POST /repos/HASKI-RAK/NodeGrade/rulesets \
  --input .github/rulesets/integration-branches-require-ci.json
```

Update an existing ruleset instead of creating a second one:

```bash
gh api /repos/HASKI-RAK/NodeGrade/rulesets --jq '.[] | "\(.id)\t\(.name)"'
gh api --method PUT /repos/HASKI-RAK/NodeGrade/rulesets/<id> \
  --input .github/rulesets/integration-branches-require-ci.json
```

The `context` values are the `name:` of each job in `.github/workflows/pr.yml`. Renaming a
job renames its check, which silently stops satisfying the rule — change both together.
