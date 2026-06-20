#!/usr/bin/env bash
# prune-stale-branches.sh — one-time backlog-hygiene sweep (2026-06-20).
#
# Deletes the 16 stale remote branches that were reviewed and verified SUPERSEDED:
# every one's content is already on `develop` — merged, re-implemented under another
# branch, the engines.node lockfile one-liner now carried by #205, or a regenerable
# media-sync artifact. See docs/BRANCHING.md → "Backlog hygiene" for the routine.
#
# THROWAWAY: this hardcodes a point-in-time list, so it goes stale the instant it runs.
# Delete this script once the sweep is done — it does NOT generalise to future cleanups.
# For those, follow the generic, self-detecting routine in docs/BRANCHING.md step 5.
#
# Run from a LOCAL clone with push access — a Claude Code web session can't do this
# (its git proxy returns HTTP 403 on remote-ref deletion).
#
#   scripts/prune-stale-branches.sh            # list the branches, confirm, then delete
#   scripts/prune-stale-branches.sh --yes      # skip the confirmation prompt
#   scripts/prune-stale-branches.sh --archive  # tag archive/<branch> locally before deleting
#
# Fails safe: each delete is independent — a branch already gone (e.g. removed in the UI)
# is skipped with a note rather than aborting the rest; a real failure sets a non-zero exit.
set -uo pipefail

REMOTE="origin"

# The verified-superseded set. Trailing "# …" notes are bash comments, not part of the name.
BRANCHES=(
  # merged via a merged PR — the leftover head auto-delete missed
  claude/dropbox-tattoo-media-workflow-1NPa2        # PR #109 (+#105)
  claude/form-validation-ux-fHyE6                   # PR #104
  claude/ipad-loading-animations-I44I9              # PR #103
  # closed-unmerged, but the content is confirmed present on develop
  claude/injection-xss-vulnerability-review-U6QFS   # PR #57  → src/build/security.js
  claude/subscribe-button-alignment-qxFFT           # PR #92  → newsletter-band 52px fix
  claude/tile-image-deduplication-rFnEE             # PR #94  → specialisms exclude-set
  claude/go-live-review-docs-mg8wO                  # PR #85  → DATA-COMPLIANCE D1 Time Travel
  claude/youthful-meitner-wvtJs                     # PR #154 → docs/PAYMENTS.md + scope rules
  docs/media-image-pipeline-and-cms                 # PR #117 → MEDIA.md image pipeline
  claude/intelligent-franklin-OrUFM                 # PR #138 → superseded docs claim
  # engines.node lockfile one-liner — now on develop via #205
  claude/gracious-ptolemy-g3pspj                    # PR #203
  claude/serene-mayer-226csb                        # PR #202
  claude/hopeful-pasteur-y5njes                     # (no PR)
  # never-PR'd, unique commits confirmed superseded
  claude/website-launch-polish-3LtEc                # og-image placeholder already on develop
  claude/docs-project-readiness-review-Mv0fC        # stale June-5 doc reconciliation
  # stale automated media-sync run (regenerable from Dropbox)
  media/dropbox-sync-27239296620                    # (no PR)
)

ARCHIVE=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --archive)  ARCHIVE=1 ;;
    --yes|-y)   ASSUME_YES=1 ;;
    -h|--help)  sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

echo "Pruning ${#BRANCHES[@]} verified-stale branch(es) from '$REMOTE':"
printf '  %s\n' "${BRANCHES[@]}"
[ "$ARCHIVE" -eq 1 ] && echo "(--archive: tagging archive/<branch> locally before each delete)"

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Proceed? [y/N] '
  read -r reply
  case "$reply" in
    [yY] | [yY][eE][sS]) ;;
    *) echo "Aborted — nothing deleted."; exit 0 ;;
  esac
fi

git fetch --prune "$REMOTE"

fail=0
for b in "${BRANCHES[@]}"; do
  if ! git ls-remote --exit-code --heads "$REMOTE" "$b" >/dev/null 2>&1; then
    echo "skip   $b  (already gone)"
    continue
  fi
  if [ "$ARCHIVE" -eq 1 ]; then
    git tag -f "archive/$b" "$REMOTE/$b" >/dev/null && echo "tag    archive/$b"
  fi
  if git push "$REMOTE" --delete "$b"; then
    echo "delete $b  ✔"
  else
    echo "FAILED $b" >&2
    fail=1
  fi
done

echo
echo "Remaining branches on '$REMOTE' (excluding main/develop):"
remaining="$(git ls-remote --heads "$REMOTE" | sed 's#.*refs/heads/##' | grep -vxE 'main|develop' || true)"
if [ -n "$remaining" ]; then
  printf '  %s\n' "$remaining"
else
  echo "  (none — clean)"
fi
[ "$ARCHIVE" -eq 1 ] && echo "Archive tags are LOCAL; 'git push $REMOTE --tags' to keep them on the remote."

exit "$fail"
