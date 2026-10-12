const REFRESH_MS = 2000;          // decision 012
const SLOW_LAG_SECONDS = 30;      // above this: "Falling behind"
const STALLED_LAG_SECONDS = 120;  // above this: "Stalled"
const TRACK_MAX_SECONDS = 60;     // the lag bar is full at 60 s

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  byId(id).textContent = value;
}

// 45 -> "45 s", 200 -> "3 m 20 s", 7400 -> "2 h 3 m"
function formatDuration(totalSeconds) {
  if (totalSeconds < 60) {
    return { value: String(totalSeconds), unit: "s" };
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return { value: minutes + ":" + String(totalSeconds % 60).padStart(2, "0"), unit: "min" };
  }
  const hours = Math.floor(minutes / 60);
  return { value: hours + ":" + String(minutes % 60).padStart(2, "0"), unit: "h" };
}

// "2 days ago", "5 minutes ago"
function timeAgo(isoText) {
  const seconds = Math.round((Date.parse(isoText) - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps = [
    { unit: "day", seconds: 86400 },
    { unit: "hour", seconds: 3600 },
    { unit: "minute", seconds: 60 }
  ];
  for (let i = 0; i < steps.length; i++) {
    if (Math.abs(seconds) >= steps[i].seconds) {
      return format.format(Math.round(seconds / steps[i].seconds), steps[i].unit);
    }
  }
  return format.format(seconds, "second");
}

function plural(count, word) {
  return count + " " + word + (count === 1 ? "" : "s");
}

// Decide what the big sentence says
function describeHealth(stats) {
  const lag = stats.queueLagSeconds;
  const waiting = stats.counts.waiting;
  const busyWorkers = stats.workers.length;

  if (lag === null) {
    if (waiting > 0) {
      return {
        state: "idle",
        verdict: "Nothing due",
        detail: plural(waiting, "job") + " waiting, all scheduled for later. Every job that is due has been picked up."
      };
    }
    return {
      state: "idle",
      verdict: "Queue is empty",
      detail: "Every job that is due has been picked up."
    };
  }

  if (lag > STALLED_LAG_SECONDS) {
    return {
      state: "stalled",
      verdict: "Stalled",
      detail: busyWorkers === 0
        ? "No worker is holding a job. Check that the workers are running."
        : "Jobs have waited over 2 minutes. The workers cannot keep up."
    };
  }

  if (lag > SLOW_LAG_SECONDS) {
    return {
      state: "slow",
      verdict: "Falling behind",
      detail: "Ready jobs are waiting longer than " + SLOW_LAG_SECONDS + " s. Add workers or check for slow jobs."
    };
  }

  return {
    state: "ok",
    verdict: "Keeping up",
    detail: plural(waiting, "job") + " waiting, picked up within seconds."
  };
}

function renderHealth(stats) {
  const health = describeHealth(stats);
  byId("health").dataset.state = health.state;
  setText("verdict", health.verdict);
  setText("verdictDetail", health.detail);

  const lag = stats.queueLagSeconds === null ? 0 : stats.queueLagSeconds;
  const duration = formatDuration(lag);
  setText("lagValue", duration.value);
  setText("lagUnit", duration.unit);

  const filled = Math.min(lag / TRACK_MAX_SECONDS, 1) * 100;
  byId("lagFill").style.width = filled + "%";
}

function renderCounts(stats) {
  setText("waiting", stats.counts.waiting);
  setText("running", stats.counts.running);
  setText("done", stats.counts.done);
  setText("failed", stats.counts.failed);
  setText("failedLastHour", stats.failedLastHour);
  byId("failedCount").classList.toggle("is-recent", stats.failedLastHour > 0);
}

function renderWorkers(workers) {
  const list = byId("workers");
  list.replaceChildren();

  if (workers.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No worker is running a job right now.";
    list.appendChild(item);
    return;
  }

  for (let i = 0; i < workers.length; i++) {
    const item = document.createElement("li");

    const id = document.createElement("span");
    id.className = "worker-id";
    id.textContent = workers[i].workerId;

    const jobs = document.createElement("span");
    jobs.className = "worker-jobs";
    jobs.textContent = plural(workers[i].running, "job");

    item.appendChild(id);
    item.appendChild(jobs);
    list.appendChild(item);
  }
}

// textContent, never innerHTML: type and error text come from API users
function addCell(row, text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) {
    cell.className = className;
  }
  row.appendChild(cell);
  return cell;
}

function renderFailures(failures) {
  const body = byId("failures");
  body.replaceChildren();

  if (failures.length === 0) {
    const row = document.createElement("tr");
    const cell = addCell(row, "No failed jobs.", "empty");
    cell.colSpan = 5;
    body.appendChild(row);
    return;
  }

  for (let i = 0; i < failures.length; i++) {
    const failure = failures[i];
    const row = document.createElement("tr");
    addCell(row, "#" + failure.id, "job-id");
    addCell(row, failure.type);
    addCell(row, failure.attempts, "num");
    addCell(row, failure.lastError, "error");
    const when = addCell(row, timeAgo(failure.failedAt), "when");
    when.title = new Date(failure.failedAt).toLocaleString();
    body.appendChild(row);
  }
}

function showLive(ok, text) {
  const dot = byId("liveDot");
  dot.classList.toggle("is-down", !ok);
  setText("updated", text);
  if (ok) {
    dot.classList.remove("beat");
    void dot.offsetWidth;          // restart the flash animation
    dot.classList.add("beat");
  }
}

async function refresh() {
  try {
    const response = await fetch("/stats");
    if (!response.ok) {
      throw new Error("the API answered " + response.status);
    }
    const stats = await response.json();
    renderHealth(stats);
    renderCounts(stats);
    renderWorkers(stats.workers);
    renderFailures(stats.recentFailures);
    showLive(true, "Live, updated " + new Date().toLocaleTimeString());
  } catch (error) {
    byId("health").dataset.state = "error";
    setText("verdict", "Can't reach the API");
    setText("verdictDetail", "The last request failed: " + error.message + ". Trying again every " + REFRESH_MS / 1000 + " s.");
    showLive(false, "Disconnected");
  }
}

refresh();
setInterval(refresh, REFRESH_MS);