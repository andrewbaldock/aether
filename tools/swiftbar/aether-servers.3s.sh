#!/bin/bash
#
# SwiftBar plugin: Aether / website dev-server control panel.
#
# Renders a menu-bar status glyph (𑁍 teal = all up / red = something down) with a
# dropdown row per server showing up/down + a Start or Stop action, plus
# Start all / Stop all / Open logs / manual deploys.
#
# The SAME script handles rendering (invoked with no args by SwiftBar every 3s)
# and actions (invoked with args via `bash=... param0=...` menu lines).
#
# GUI apps do NOT inherit the login-shell PATH, so every external tool is called
# by absolute path. Paths are derived from $HOME so this works under any username.
# Adjust CODE_DIR / the SERVERS registry if your checkout lives elsewhere.
#
# Install: see tools/swiftbar/README.md.

# <xbar.title>Aether Dev Servers</xbar.title>
# <xbar.version>1.0</xbar.version>
# <xbar.author>Andrew Baldock</xbar.author>
# <xbar.desc>Start/stop website + Aether dev servers with live up/down status.</xbar.desc>

BUN="$HOME/.bun/bin/bun"
FLY="$HOME/.fly/bin/fly"
LSOF="/usr/sbin/lsof"
CURL="/usr/bin/curl"
SELF="$0"

# Where your repos live. Override CODE_DIR if your checkouts aren't under ~/Code.
CODE_DIR="$HOME/Code"
AETHER_FE="${CODE_DIR}/aether/frontend"
AETHER_BE="${CODE_DIR}/aether/backend"

# Orion (job-hunt app): Vite web on :5176, Bun API on :3000. Browser at orion.hunt.
ORION_URL="https://orion.hunt"

# GitHub base for the Docs submenu (links open in the browser).
GH_BASE="https://github.com/andrewbaldock/aether/blob/main"

# Run a command in a new Terminal window, holding it open at the end so output is
# readable. Used for the test actions and deploys (all too long/loud for inline).
run_in_terminal() {
  local cmd="$1"
  osascript \
    -e "tell application \"Terminal\" to do script \"${cmd}; echo; echo '— done. Press any key to close. —'; read -n 1; exit\"" \
    -e 'tell application "Terminal" to activate'
}

# server registry: name|port|dir|uptype|cmd
#   uptype: http = any HTTP response on / | health = /api/health ok | stats = /api/stats 200
#   cmd:    optional start command (default "run dev"); args passed to bun
SERVERS=(
  "website|5173|${CODE_DIR}/website|http|"
  "aether-frontend|5174|${CODE_DIR}/aether/frontend|http|"
  "aether-backend|8000|${CODE_DIR}/aether/backend|health|"
  "orion-web|5176|${CODE_DIR}/orion/web|http|"
  "orion-api|3000|${CODE_DIR}/orion|stats|server/index.js"
)

# --- helpers ---------------------------------------------------------------

# is_up <port> <uptype> -> 0 if up, 1 if down
is_up() {
  local port="$1" uptype="$2"
  # Probe via `localhost` (resolves to BOTH ::1 and 127.0.0.1) so an IPv6-only
  # Vite bind isn't mis-read as down by an IPv4-only probe. --max-time keeps the
  # 3s render snappy.
  if [ "$uptype" = "health" ]; then
    "$CURL" -fsS --max-time 2 "http://localhost:${port}/api/health" 2>/dev/null | grep -q '"ok":true'
    return $?
  fi
  if [ "$uptype" = "stats" ]; then
    # Orion API has no /; probe /api/stats which returns 200 + JSON when up.
    "$CURL" -fsS --max-time 2 "http://localhost:${port}/api/stats" 2>/dev/null | grep -q '"total"'
    return $?
  fi
  # http: any HTTP response (200/3xx/4xx) means something is listening & serving
  local code
  code=$("$CURL" -s -o /dev/null -w '%{http_code}' --max-time 2 "http://localhost:${port}/" 2>/dev/null)
  [ -n "$code" ] && [ "$code" != "000" ]
}

start_server() {
  local port="$1"
  for s in "${SERVERS[@]}"; do
    IFS='|' read -r name p dir uptype cmd <<< "$s"
    if [ "$p" = "$port" ]; then
      cd "$dir" || exit 1
      # Default is `bun run dev`; a registry cmd (e.g. orion-api) runs `bun <cmd>`.
      if [ -n "$cmd" ]; then
        PATH="$HOME/.bun/bin:$PATH" nohup "$BUN" $cmd > "/tmp/${name}.log" 2>&1 &
      else
        PATH="$HOME/.bun/bin:$PATH" nohup "$BUN" run dev > "/tmp/${name}.log" 2>&1 &
      fi
      disown
      return 0
    fi
  done
}

stop_server() {
  local port="$1"
  local pids
  pids=$("$LSOF" -ti:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "$pids" | xargs kill 2>/dev/null
    sleep 1
    pids=$("$LSOF" -ti:"$port" 2>/dev/null)
    [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null
  fi
}

# --- action dispatch -------------------------------------------------------
# SwiftBar invokes:  script <action> <port>
case "$1" in
  start)
    start_server "$2"
    exit 0
    ;;
  stop)
    stop_server "$2"
    exit 0
    ;;
  startall)
    for s in "${SERVERS[@]}"; do
      IFS='|' read -r name p dir uptype cmd <<< "$s"
      is_up "$p" "$uptype" || start_server "$p"
    done
    exit 0
    ;;
  stopall)
    for s in "${SERVERS[@]}"; do
      IFS='|' read -r name p dir uptype cmd <<< "$s"
      stop_server "$p"
    done
    exit 0
    ;;
  deploy-website)
    # FTP --> ASL. Long, interactive; run in Terminal so output is visible.
    osascript -e "tell application \"Terminal\" to do script \"cd ${CODE_DIR}/website && ./deploy.sh; echo; echo Done. Press any key to close.; read -n 1; exit\"" -e 'tell application "Terminal" to activate'
    exit 0
    ;;
  deploy-aether)
    # fly --> supabase. Long; run in Terminal so output is visible.
    osascript -e "tell application \"Terminal\" to do script \"cd ${CODE_DIR}/aether/backend && ${FLY} deploy; echo; echo Done. Press any key to close.; read -n 1; exit\"" -e 'tell application "Terminal" to activate'
    exit 0
    ;;
  test-e2e)
    # Full Playwright run — builds its own preview server, mocks /api. ~50s.
    run_in_terminal "cd ${AETHER_FE} && ${BUN} run test:e2e"
    exit 0
    ;;
  test-e2e-ui)
    # Playwright UI mode against the running dev server (needs frontend up on 5174).
    # Requires node on PATH (UI mode re-spawns under node).
    run_in_terminal "cd ${AETHER_FE} && ${BUN} run test:e2e:dev:ui"
    exit 0
    ;;
  test-fe-unit)
    # Frontend vitest, single run.
    run_in_terminal "cd ${AETHER_FE} && ${BUN} run test:run"
    exit 0
    ;;
  test-be-unit)
    # Backend bun:test.
    run_in_terminal "cd ${AETHER_BE} && ${BUN} test"
    exit 0
    ;;
  screenshots)
    # Dev-only device-matrix capture (needs frontend up on 5174).
    run_in_terminal "cd ${AETHER_FE} && ${BUN} run screenshots"
    exit 0
    ;;
esac

# --- render ----------------------------------------------------------------
up_count=0
total=0
rows=""

for s in "${SERVERS[@]}"; do
  IFS='|' read -r name p dir uptype cmd <<< "$s"
  total=$((total + 1))
  if is_up "$p" "$uptype"; then
    up_count=$((up_count + 1))
    rows+="𑁍 ${name} :${p} | color=#1faa59\n"
    rows+="-- Stop ${name} | bash=\"${SELF}\" param0=stop param1=${p} terminal=false refresh=true\n"
  else
    rows+="𑁍 ${name} :${p} | color=#BA4951\n"
    rows+="-- Start ${name} | bash=\"${SELF}\" param0=start param1=${p} terminal=false refresh=true\n"
  fi
  rows+="-- Open ${name} log | bash=/usr/bin/open param0=-a param1=Console param2=/tmp/${name}.log terminal=false\n"

  # Manual-deploy actions (website + aether-backend only). Separator + deploy row.
  if [ "$name" = "website" ]; then
    rows+="-----\n"
    rows+="-- Deploy website (ftp → ASL) | bash=\"${SELF}\" param0=deploy-website terminal=false color=#C77D3A\n"
  elif [ "$name" = "aether-backend" ]; then
    rows+="-----\n"
    rows+="-- Deploy aether (fly → supabase) | bash=\"${SELF}\" param0=deploy-aether terminal=false color=#C77D3A\n"
  elif [ "$name" = "orion-web" ]; then
    rows+="-- Open Orion (${ORION_URL}) | href=${ORION_URL} color=#5B8DEF\n"
  fi
done

# Two-state menu-bar glyph: lotus in muted teal when all up, dusty red otherwise.
if [ "$up_count" -eq "$total" ]; then
  dot_color="#00727F"
else
  dot_color="#BA4951"
fi

echo "𑁍 | color=${dot_color} size=22"
echo "---"
echo "𑁍 Aether servers — ${up_count}/${total} up | size=11 color=#888888"
echo "---"
echo -e "$rows"
echo "---"

# Tests submenu — all open a Terminal window (too long/loud for inline). The UI
# mode + screenshots items need the frontend dev server running on 5174.
echo "𑁍 Tests | color=#888888"
echo "-- E2E — full run (builds preview, mocks /api) | bash=\"${SELF}\" param0=test-e2e terminal=false"
echo "-- E2E — UI mode (needs frontend :5174) | bash=\"${SELF}\" param0=test-e2e-ui terminal=false"
echo "-----"
echo "-- Frontend unit (vitest) | bash=\"${SELF}\" param0=test-fe-unit terminal=false"
echo "-- Backend unit (bun test) | bash=\"${SELF}\" param0=test-be-unit terminal=false"
echo "-----"
echo "-- Screenshots capture (needs frontend :5174) | bash=\"${SELF}\" param0=screenshots terminal=false"

# Docs submenu — open the GitHub docs in the browser.
echo "𑁍 Docs | color=#888888"
echo "-- Getting Started | href=${GH_BASE}/docs/GETTING_STARTED.md"
echo "-- Runbook | href=${GH_BASE}/docs/RUNBOOK.md"
echo "-- Architecture | href=${GH_BASE}/docs/ARCHITECTURE.md"
echo "-- Stack | href=${GH_BASE}/docs/STACK.md"
echo "-- Roadmap | href=${GH_BASE}/docs/ROADMAP.md"
echo "-- Known issues | href=${GH_BASE}/docs/KNOWN_ISSUES.md"
echo "-----"
echo "-- Repo on GitHub | href=https://github.com/andrewbaldock/aether"

echo "---"
echo "𑁍 Start all | bash=\"${SELF}\" param0=startall terminal=false refresh=true color=#1faa59"
echo "𑁍 Stop all | bash=\"${SELF}\" param0=stopall terminal=false refresh=true color=#BA4951"
echo "𑁍 Refresh now | refresh=true color=#888888"
