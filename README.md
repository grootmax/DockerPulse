# DockerPulse

**Live Docker Compose status in your GNOME top bar — lightweight, robust, and focused.**

DockerPulse is a minimal GNOME Shell extension that displays the real-time health and status of your Docker Compose project directly in the top bar. 

No heavy dashboards. No constant high CPU usage. Just a clean, glanceable status indicator with quick actions when you click it.

---

## Table of Contents

- [Features](#features)
- [Prerequisites & Requirements](#prerequisites--requirements)
- [Installation](#installation)
- [Configuration & Settings](#configuration--settings)
- [Enabling & Controlling the Extension](#enabling--controlling-the-extension)
- [Reloading GNOME Shell](#reloading-gnome-shell)
- [Manual Schema Compilation](#manual-schema-compilation)
- [Troubleshooting & Debugging](#troubleshooting--debugging)
- [Architecture & Process Management](#architecture--process-management)

---

## Features

- **Top-Bar Status Indicator** with color-coded states:
  - 🟢 **Green** → All containers are healthy/running.
  - 🟡 **Yellow** → Partial stack running, some containers starting or restarting.
  - 🔴 **Red** → The stack is completely down.
  - ⚪ **Grey** → Docker daemon is not available or unreachable.
- **Container Count Display**: Optionally shows running count (e.g., `3/3`) directly in the panel.
- **Quick-Access Popup Menu**: Click the panel item to view:
  - The list of individual containers, their status, and health states.
  - Quick action buttons (Restart Stack, Stop Stack, Open Logs, Open Terminal).
- **Extremely Low Resource Footprint**:
  - Leverages event-driven `docker events` stream via a specialized Python wrapper.
  - Falls back to light polling (default 25 seconds) to ensure status is always up-to-date.
  - Monitors only one user-specified Docker Compose project to save resources.
  - Smart status and container list caching to minimize top-bar redraws.

---

## Prerequisites & Requirements

Before installing, ensure your system meets the following prerequisites:

### 1. GNOME Shell Version Compatibility
- Compatible with **GNOME Shell 46** and **47**.
- You can check your desktop's current version by running:
  ```bash
  gnome-shell --version
  ```

### 2. Docker Compose v2 (Strictly Required)
- This extension **strictly requires Docker Compose v2** (invoked as `docker compose`). It is **not compatible** with older Docker Compose v1 legacy commands (`docker-compose`).
- The extension runs `docker compose ps -a --format json` to query container states.
- **Auto-Parsing Engine**: Because different minor versions of Docker Compose v2 format their JSON outputs differently, the extension features a robust built-in JSON parser (`_parseDockerComposePsOutput`) designed to automatically detect and handle both:
  1. **NDJSON (Newline-Delimited JSON)**: One JSON object per line.
  2. **Standard JSON Array**: A single JSON array starting with `[`.

### 3. Docker Permissions (Non-Sudo Access)
- The extension executes standard docker commands as your user. Your user account **must** have permission to run docker commands without `sudo`.
- To grant your user the required permissions, add them to the `docker` group:
  ```bash
  sudo usermod -aG docker $USER
  ```
  *Note: You must log out and log back in (or reboot) for this group change to take effect.*

### 4. Python 3
- The extension relies on a clean python wrapper script (`parent_monitor_wrapper.py`) to run background subprocesses safely (specifically the `docker events` listener).
- Python 3 must be available on your system path.

### 5. Libadwaita (`libadwaita`)
- The Preferences UI is constructed with modern `Adw` (libadwaita) widgets. Ensure `libadwaita` is installed (usually present by default on modern GNOME distributions like Ubuntu, Fedora, Debian, etc.).

---

## Installation

The target installation directory for local user-installed GNOME extensions is:
`~/.local/share/gnome-shell/extensions/dockerpulse@github.com`

### Quick Install with Makefile

The repository includes a helper `Makefile` to fully automate local staging, compilation, and installation:

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/yourusername/dockerpulse.git
   cd dockerpulse
   ```

2. **Build & Install Locally:**
   ```bash
   make install
   ```
   *This command stages files inside `build_staging/`, compiles the GSettings schema inside the target directories, and installs all the extension assets directly to your local user directory (`~/.local/share/gnome-shell/extensions/dockerpulse@github.com`).*

3. **Clean / Uninstall Extension:**
   To completely remove the staged files, compiled schemas, and uninstall the extension from your system, run:
   ```bash
   make clean
   ```

---

## Configuration & Settings

You can open the extension configuration window using the GNOME "Extensions" or "Extension Manager" app, or by running the command line utility:
```bash
gnome-extensions prefs dockerpulse@github.com
```

The extension settings schema (`org.gnome.shell.extensions.dockerpulse`) exposes the following options:

- **Docker Compose Project Path** (`project-path`):
  The **absolute path** of the local directory containing your project's `docker-compose.yml` or `compose.yaml` file (e.g. `/home/user/projects/web-api`).
- **Monitored Project Name** (`project-name`):
  A custom display label for the project inside the GNOME top-bar/dropdown (defaults to empty, which falls back to the folder name).
- **Polling Interval** (`poll-interval`):
  Fallback polling frequency in seconds to query the container status (default: `25` seconds).
- **Show Container Count** (`show-container-count`):
  A boolean flag to show or hide the container count badge (e.g. `3/3` running) next to the status icon in your panel (default: `true`).

---

## Enabling & Controlling the Extension

You can enable or disable the extension either via command line or utilizing GNOME GUI tools:

### Using Command Line:
- **Enable the Extension:**
  ```bash
  gnome-extensions enable dockerpulse@github.com
  ```
- **Disable the Extension:**
  ```bash
  gnome-extensions disable dockerpulse@github.com
  ```

### Using GUI Tools:
- Launch the official **GNOME Extensions** application or the third-party **Extension Manager** application.
- Locate **DockerPulse** in your user-installed extensions list and toggle the switch to `ON` or `OFF`.

---

## Reloading GNOME Shell

Because GNOME Shell caches loaded extensions in its active process memory, you **must reload** the GNOME Shell environment for any new code modifications, stylesheet updates, or settings schema compiled changes to take effect.

### Under X11 Window System
1. Press `Alt + F2` on your keyboard.
2. Type `r` into the Run command dialog.
3. Press `Enter`.
This restarts your GNOME Shell in-place seamlessly without closing any of your active programs or windows.

### Under Wayland Window System
Wayland does not support in-place shell restarting via the `Alt + F2` + `r` command due to architectural security constraints.
- **Option A (Log Out):** Save your active work, log out of your GNOME desktop session, and log back in.
- **Option B (Nested Shell for Development):** If you are actively developing, editing code, or testing, you can spawn a nested, interactive GNOME Shell window on top of your current environment:
  ```bash
  dbus-run-session gnome-shell --nested --wayland
  ```
  This provides a safe, standalone sandbox window where you can install, enable, inspect, and reload your extension, with stdout/stderr outputs logged directly to the launching terminal window.

---

## Manual Schema Compilation

If you are editing the settings schema files manually, or not utilizing the automated Makefile to install/re-install, the GSettings schema MUST be compiled inside the target directory. 

To manually compile schemas, run:
```bash
glib-compile-schemas ~/.local/share/gnome-shell/extensions/dockerpulse@github.com/schemas/
```

> ⚠️ **Warning:** If you do not compile the schema file, GNOME Shell will fail to load or initialize the extension, throwing a `"Settings schema org.gnome.shell.extensions.dockerpulse not found"` error when trying to activate or open its preferences.

---

## Troubleshooting & Debugging

### 1. Inspecting GNOME Shell Logs
All runtime extension logging, `console.log`/`console.error` calls, and uncaught exceptions are sent to the systemd journal logs.

- **To view a continuous live stream of GNOME Shell logs:**
  ```bash
  journalctl --user -f -u gnome-shell
  ```
- **To filter and watch logs specifically related to DockerPulse:**
  ```bash
  journalctl --user -f -u gnome-shell | grep -i dockerpulse
  ```
- **Alternative (Distribution Specific, e.g., Ubuntu/Fedora):**
  ```bash
  journalctl -f -o cat /usr/bin/gnome-shell
  ```

### 2. Common Issues & Solutions

#### The extension displays an "Error" or a red warning triangle in the Extensions App
- Run the `journalctl` command above, toggle the extension off and on, and inspect the logs for runtime syntax or JS import failures.
- Make sure you are on a compatible version of GNOME (`46` or `47`) by running `gnome-shell --version`.

#### Settings screen fails to open or crashes
- Ensure `glib-compile-schemas` was run successfully inside the schemas subdirectory.
- Verify `libadwaita` is installed on your system.

#### The status icon remains grey (Docker daemon unreachable) or is empty
- Confirm you have configured the **Docker Compose Project Path** setting to use an **absolute path** (relative paths like `./` or `~/` are not resolved correctly).
- Verify the path actually contains a valid `docker-compose.yml` or `compose.yaml` configuration.
- Check if your user can run docker without sudo. Test this by running:
  ```bash
  docker compose ps -a --format json
  ```
  manually in your terminal within the specified project folder. If it fails or asks for password, see [Prerequisites](#3-docker-permissions-non-sudo-access).

---

## Architecture & Process Management

DockerPulse is designed with system stability and resource consumption in mind, preventing common pitfalls associated with running background processes inside GNOME Shell's single-threaded environment:

1. **Subprocess Lifecycle & Zombie Prevention (`processRegistry.js`):**
   GNOME Shell runs a single thread. The extension implements a robust, asynchronous `ProcessRegistry` class utilizing GIO (`Gio.Subprocess`) to spawn tasks without blocking the main rendering loop. It handles exit statuses gracefully and safely reaps completed processes to avoid defunct zombie processes on your host system.

2. **The Parent Monitor Wrapper (`parent_monitor_wrapper.py`):**
   The extension monitors real-time container health via `docker events` streaming. To prevent background subprocesses from running indefinitely (and becoming orphaned zombies) if GNOME Shell crashes, restarts, or exits unexpectedly, DockerPulse utilizes a specialized helper script `parent_monitor_wrapper.py`. This script monitors the parent shell's PID and guarantees that background docker listeners are cleanly killed and reaped immediately when the parent GNOME Shell process terminates.

*(For deeper architectural details, refer to the supplemental codebase notes in `/tmp/jules_docs/CODEBASE_CONTEXT.md`.)*
