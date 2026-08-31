#!/bin/bash
# 分批续跑 v1.3 全量评测；中断后再跑会自动从最新 checkpoint 接着
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

TOTAL="${2:-966}"
BATCH="${3:-20}"
LOG="${4:-tests/eval/reports/eval_run_continue_$(date +%Y%m%d_%H%M%S).log}"
# 单批墙钟上限（秒）：防单 case 卡死拖死整批；到期杀 node，按已有 checkpoint 推进
BATCH_TIMEOUT_SEC="${BATCH_TIMEOUT_SEC:-1200}"

if [ "${1:-auto}" = "auto" ] || [ -z "${1:-}" ]; then
  SKIP=$(node -e '
    const fs=require("fs"), path=require("path");
    const dir="tests/eval/reports";
    let max=0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith("eval_checkpoint_v1.3_skip") || !f.endsWith(".json")) continue;
      try {
        const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
        const end=(d.skip||0)+(d.done||0);
        if (end>max) max=end;
      } catch {}
    }
    console.log(max);
  ')
else
  SKIP="$1"
fi

mkdir -p tests/eval/reports
echo "start SKIP=$SKIP TOTAL=$TOTAL BATCH=$BATCH remain=$((TOTAL-SKIP)) batch_timeout=${BATCH_TIMEOUT_SEC}s log=$LOG $(date -Iseconds)" | tee -a "$LOG"

run_batch() {
  local skip="$1" limit="$2"
  node tests/eval/run_eval.js --dataset v1.3 --limit "$limit" --skip "$skip" >> "$LOG" 2>&1 &
  local pid=$!
  local waited=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$BATCH_TIMEOUT_SEC" ]; then
      echo "batch watchdog: kill pid=$pid after ${BATCH_TIMEOUT_SEC}s (skip=$skip)" | tee -a "$LOG"
      kill "$pid" 2>/dev/null || true
      sleep 2
      kill -9 "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 5
    waited=$((waited + 5))
  done
  wait "$pid"
  return $?
}

FAIL_COUNT=0
while [ "$SKIP" -lt "$TOTAL" ]; do
  REMAIN=$((TOTAL - SKIP))
  LIMIT=$BATCH
  if [ "$REMAIN" -lt "$LIMIT" ]; then LIMIT=$REMAIN; fi

  echo "" | tee -a "$LOG"
  echo "======== BATCH skip=$SKIP limit=$LIMIT remain=$REMAIN ($(date -Iseconds)) ========" | tee -a "$LOG"

  set +e
  run_batch "$SKIP" "$LIMIT"
  EC=$?
  set -e

  CK="tests/eval/reports/eval_checkpoint_v1.3_skip${SKIP}.json"
  if [ -f "$CK" ]; then
    DONE=$(node -e "const d=require('./$CK'); console.log(d.done||0)")
    NEXT=$((SKIP + DONE))
    echo "batch exit=$EC checkpoint_done=$DONE next_skip=$NEXT $(date -Iseconds)" | tee -a "$LOG"
    if [ "$DONE" -le 0 ]; then
      FAIL_COUNT=$((FAIL_COUNT + 1))
      echo "checkpoint empty progress, fail=$FAIL_COUNT" | tee -a "$LOG"
      if [ "$FAIL_COUNT" -ge 5 ]; then
        echo "too many empty batches, abort" | tee -a "$LOG"
        exit 2
      fi
      sleep 3
      continue
    fi
    SKIP=$NEXT
    FAIL_COUNT=0
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "no checkpoint after batch (exit=$EC), fail=$FAIL_COUNT, retry after 5s" | tee -a "$LOG"
    if [ "$FAIL_COUNT" -ge 5 ]; then
      echo "5 consecutive batch failures, abort" | tee -a "$LOG"
      exit 3
    fi
    sleep 5
    continue
  fi
done

echo "ALL_DONE skip=$SKIP $(date -Iseconds)" | tee -a "$LOG"
exit 0
