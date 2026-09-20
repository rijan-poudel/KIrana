#!/usr/bin/env bash
# Install Milan Grocery as a systemd **user** service so the shop app starts
# itself at login and restarts if it crashes — no terminal left open.
#
#   bash scripts/install-service.sh          # install + enable (start at boot)
#   bash scripts/install-service.sh --remove # remove the service
#
# After installing: `systemctl --user status milan-grocery` to see it, and the
# app is on http://<PC-IP>:3000 a few seconds after the PC boots. Enable
# lingering so it also starts BEFORE anyone logs in:
#   sudo loginctl enable-linger $USER
set -euo pipefail

UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_NAME="milan-grocery.service"
UNIT_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/${UNIT_NAME}"
UNIT_DST="${UNIT_DIR}/${UNIT_NAME}"

if [[ "${1:-}" == "--remove" ]]; then
  systemctl --user disable --now "$UNIT_NAME" 2>/dev/null || true
  rm -f "$UNIT_DST"
  systemctl --user daemon-reload
  echo "Removed ${UNIT_NAME}."
  exit 0
fi

if [[ ! -f "$UNIT_SRC" ]]; then
  echo "error: $UNIT_SRC not found (run from the project's scripts/ folder)" >&2
  exit 1
fi

echo "Building the production bundle once (next build)…"
(cd "$(dirname "$UNIT_SRC")/.." && npx next build)

mkdir -p "$UNIT_DIR"
cp "$UNIT_SRC" "$UNIT_DST"
systemctl --user daemon-reload
systemctl --user enable --now "$UNIT_NAME"

echo ""
echo "Installed and started. Check it:"
echo "  systemctl --user status milan-grocery"
echo "  curl -s -o /dev/null -w '%{http_code}\\n' http://localhost:3000"
echo ""
echo "One-time (so it starts at boot WITHOUT anyone logging in):"
echo "  sudo loginctl enable-linger \$USER"
echo ""
echo "Phone/counter access over WiFi: https proxy →  npm run start:phone"
