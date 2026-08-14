import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { ProcessRegistry } from './processRegistry.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

function getSettingString(settings, key, fallback) {
    if (!settings) return fallback;
    try {
        return settings.get_string(key) || fallback;
    } catch (e) {
        console.error(`[DockerPulse] Failed to get string for key "${key}":`, e);
        return fallback;
    }
}

function getSettingInt(settings, key, fallback) {
    if (!settings) return fallback;
    try {
        return settings.get_int(key);
    } catch (e) {
        console.error(`[DockerPulse] Failed to get int for key "${key}":`, e);
        return fallback;
    }
}

const DockerPulseIndicator = GObject.registerClass(
class DockerPulseIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'DockerPulse');
        this._extension = extension;
        
        try {
            this._settings = extension.getSettings();
        } catch (e) {
            console.error('[DockerPulse] GSettings not available. Using fallback configurations.', e);
            this._settings = null;
        }

        // Create container box
        this._box = new St.BoxLayout({
            style_class: 'panel-status-menu-box',
        });

        // Icon / Emoji Label
        this._statusLabel = new St.Label({
            text: '⚪',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._statusLabel);

        // Count Label
        this._countLabel = new St.Label({
            text: ' --',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._countLabel);

        this.add_child(this._box);

        // Cached state (read from for UI/menu rendering)
        this._cachedContainers = [];
        this._cachedStatus = 'grey'; // 'green', 'yellow', 'red', 'grey'
        this._cachedProjectName = '';

        // Local state cache is read from when menu opens (preventing synchronous system calls)
        this.menu.connect('menu-opened', () => {
            this._buildMenu();
        });

        // Watch settings changes
        if (this._settings) {
            this._settingsId = this._settings.connect('changed', () => {
                this._onSettingsChanged();
            });
        }

        // Initialize state (this sets up poll timer & streams & cached project name)
        this._onSettingsChanged();
    }

    _onSettingsChanged() {
        this._projectPath = getSettingString(this._settings, 'project-path', '');
        
        // Stop current stream
        this._stopEventStream();

        // Update poll timer
        this._updatePollTimer();

        if (this._projectPath) {
            // Determine project name from settings, fallback to path, then "DockerPulse"
            let nameSetting = getSettingString(this._settings, 'project-name', '');
            if (nameSetting) {
                this._cachedProjectName = nameSetting;
            } else {
                this._cachedProjectName = this._projectPath.split('/').pop() || 'DockerPulse';
            }
            // Start event stream
            this._startEventStream();
        } else {
            this._cachedProjectName = '';
            this._cachedContainers = [];
            this._cachedStatus = 'grey';
            this._updateUI();
        }
        
        this._refreshState();
    }

    _updatePollTimer(customInterval) {
        // Remove existing timer
        if (this._pollTimerId) {
            GLib.source_remove(this._pollTimerId);
            this._pollTimerId = null;
        }

        let interval = customInterval || getSettingInt(this._settings, 'poll-interval', 25);
        if (interval < 1) {
            interval = 25; // Safe guard
        }
        this._currentPollInterval = interval;

        this._pollTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._currentPollInterval, () => {
            this._refreshState();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _backoffPollInterval() {
        let baseInterval = getSettingInt(this._settings, 'poll-interval', 25);
        if (baseInterval < 1) baseInterval = 25;
        
        if (!this._currentPollInterval) {
            this._currentPollInterval = baseInterval;
        }
        // Multiply by 1.5 for backoff, up to a maximum of 300 seconds
        let newInterval = Math.min(300, Math.round(this._currentPollInterval * 1.5));
        if (newInterval > this._currentPollInterval) {
            this._updatePollTimer(newInterval);
        }
    }

    _stopEventStream() {
        if (this._eventProc) {
            try {
                this._eventProc.force_exit();
            } catch (e) {}
            this._eventProc = null;
        }
        if (this._eventCancellable) {
            this._eventCancellable.cancel();
            this._eventCancellable = null;
        }
        if (this._reconnectTimerId) {
            GLib.source_remove(this._reconnectTimerId);
            this._reconnectTimerId = null;
        }
    }

    _startEventStream() {
        this._stopEventStream();
        
        if (!this._projectPath) return;

        try {
            this._eventCancellable = new Gio.Cancellable();
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            launcher.set_cwd(this._projectPath);
            
            // Get current parent PID and path to wrapper
            let parentPid = GLib.get_pid().toString();
            let wrapperPath = this._extension.path + '/parent_monitor_wrapper.py';

            // Stream container events within the self-terminating wrapper
            let argv = [
                'python3',
                wrapperPath,
                '--parent-pid',
                parentPid,
                'docker',
                'events',
                '--format',
                '{{json .}}',
                '--filter',
                'type=container'
            ];
            this._eventProc = launcher.spawnv(argv);
            if (this._extension && this._extension._registry) {
                this._extension._registry.register(this._eventProc);
            }

            let stdoutPipe = this._eventProc.get_stdout_pipe();
            let dataStream = new Gio.DataInputStream({
                base_stream: stdoutPipe,
            });

            this._readLine(dataStream);
        } catch (e) {
            console.error('[DockerPulse] Error starting event stream:', e);
            // Fallback: will rely on periodic poll
        }
    }

    _readLine(dataStream) {
        if (!this._eventCancellable || this._eventCancellable.is_cancelled()) return;

        dataStream.read_line_async(GLib.PRIORITY_DEFAULT, this._eventCancellable, (stream, res) => {
            try {
                let [line, length] = stream.read_line_finish_utf8(res);
                if (line !== null) {
                    this._handleDockerEvent(line);
                    this._readLine(stream);
                } else {
                    // Subprocess exited
                    this._handleEventStreamClosed();
                }
            } catch (e) {
                if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    return;
                }
                console.error('[DockerPulse] Error reading from stream:', e);
                this._handleEventStreamClosed();
            }
        });
    }

    _handleEventStreamClosed() {
        this._eventProc = null;
        
        // Back off reconnect delay
        if (!this._reconnectDelay) {
            this._reconnectDelay = 5;
        } else {
            this._reconnectDelay = Math.min(60, this._reconnectDelay * 2);
        }

        if (this._reconnectTimerId) {
            GLib.source_remove(this._reconnectTimerId);
            this._reconnectTimerId = null;
        }

        // Retry starting stream after reconnectDelay seconds if still active
        if (this._projectPath && this._eventCancellable && !this._eventCancellable.is_cancelled()) {
            this._reconnectTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._reconnectDelay, () => {
                this._reconnectTimerId = null;
                if (this._projectPath && (!this._eventProc)) {
                    this._startEventStream();
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _handleDockerEvent(line) {
        try {
            let event = JSON.parse(line.trim());
            // Filter events to check if they belong to this project
            let attributes = (event.Actor && event.Actor.Attributes) || {};
            let project = attributes['com.docker.compose.project'];
            let workingDir = attributes['com.docker.compose.project.working_dir'] ||
                             attributes['com.docker.compose.working_dir'] ||
                             attributes['com.docker.compose.working-dir'] ||
                             attributes['com.docker.compose.project.working-dir'];

            let matches = false;
            if (project && this._cachedProjectName && project.toLowerCase() === this._cachedProjectName.toLowerCase()) {
                matches = true;
            } else if (workingDir && workingDir === this._projectPath) {
                matches = true;
            } else if (!project && !workingDir) {
                // If we couldn't filter by project attributes, trigger refresh to be safe
                matches = true;
            }

            if (matches) {
                this._triggerDebouncedRefresh();
            }
        } catch (e) {
            // JSON parsing or filtering error
        }
    }

    _triggerDebouncedRefresh() {
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = null;
        }
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._debounceId = null;
            this._refreshState();
            return GLib.SOURCE_REMOVE;
        });
    }

    _parseDockerComposePsOutput(outputStr) {
        let output = outputStr ? outputStr.trim() : '';
        let containers = [];
        if (output.startsWith('[')) {
            try {
                containers = JSON.parse(output);
            } catch (e) {}
        } else if (output.length > 0) {
            containers = output.split('\n').map(line => {
                try {
                    return JSON.parse(line.trim());
                } catch (e) {
                    return null;
                }
            }).filter(Boolean);
        }
        return containers;
    }

    _isContainerActive(item) {
        let state = (item.State || item.state || '').toLowerCase();
        let health = (item.Health || item.health || '').toLowerCase();
        let active = state === 'running' || state === 'up';
        if (active) {
            return health !== 'unhealthy';
        }
        return false;
    }

    async _refreshState() {
        if (!this._projectPath) {
            this._cachedContainers = [];
            this._cachedStatus = 'grey';
            this._updateUI();
            return;
        }

        try {
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            launcher.set_cwd(this._projectPath);
            // Run docker compose ps -a --format json
            let argv = ['docker', 'compose', 'ps', '-a', '--format', 'json'];
            let proc = launcher.spawnv(argv);
            if (this._extension && this._extension._registry) {
                this._extension._registry.register(proc);
            }

            let result = await new Promise((resolve, reject) => {
                proc.communicate_utf8_async(null, null, (obj, res) => {
                    try {
                        let [success, stdout, stderr] = obj.communicate_utf8_finish(res);
                        resolve({ success, stdout, stderr });
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            if (result.success) {
                let output = result.stdout ? result.stdout.trim() : '';
                let containers = this._parseDockerComposePsOutput(output);

                this._cachedContainers = containers;
                
                // Determine overall status
                let total = containers.length;
                let active = 0;

                containers.forEach(item => {
                    if (this._isContainerActive(item)) {
                        active++;
                    }
                });

                if (total === 0) {
                    this._cachedStatus = 'red'; // No containers running or created (stack down)
                } else if (active === total) {
                    this._cachedStatus = 'green';
                } else if (active > 0) {
                    this._cachedStatus = 'yellow';
                } else {
                    this._cachedStatus = 'red';
                }

                // Reset poll interval backoff since we succeeded
                let baseInterval = getSettingInt(this._settings, 'poll-interval', 25);
                if (this._currentPollInterval !== baseInterval) {
                    this._updatePollTimer(baseInterval);
                }

                this._updateUI();
            } else {
                // Command failed - e.g. daemon unreachable or docker compose config error
                this._cachedContainers = [];
                this._cachedStatus = 'grey';
                this._backoffPollInterval();
                this._updateUI();
            }
        } catch (e) {
            // Exception - daemon unreachable
            this._cachedContainers = [];
            this._cachedStatus = 'grey';
            this._backoffPollInterval();
            this._updateUI();
        }
    }

    _updateUI() {
        let emoji = '⚪';
        let countText = ' --';

        if (this._projectPath) {
            switch (this._cachedStatus) {
                case 'green':
                    emoji = '🟢';
                    break;
                case 'yellow':
                    emoji = '🟡';
                    break;
                case 'red':
                    emoji = '🔴';
                    break;
                case 'grey':
                default:
                    emoji = '⚪';
                    break;
            }

            if (this._cachedStatus !== 'grey') {
                let total = this._cachedContainers.length;
                let active = 0;
                this._cachedContainers.forEach(item => {
                    if (this._isContainerActive(item)) {
                        running++;
                    }
                });
                countText = ` ${active}/${total}`;
            } else {
                countText = ' --';
            }
        } else {
            emoji = '⚪';
            countText = ' [no path]';
        }

        this._statusLabel.set_text(emoji);
        this._countLabel.set_text(countText);
    }

    _buildMenu() {
        this.menu.removeAll();

        // 1. Header showing project path
        let titleItem = new PopupMenu.PopupMenuItem(
            this._cachedProjectName ? `Project: ${this._cachedProjectName}` : 'DockerPulse',
            { reactive: true }
        );
        titleItem.activate = () => {};

        let refreshIcon = new St.Icon({
            icon_name: 'view-refresh-symbolic',
            style_class: 'system-status-icon',
        });
        let refreshButton = new St.Button({
            child: refreshIcon,
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'dockerpulse-refresh-button',
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        refreshButton.connect('clicked', () => {
            this._refreshState();
        });
        titleItem.add_child(refreshButton);
        this.menu.addMenuItem(titleItem);

        if (this._projectPath) {
            let pathItem = new PopupMenu.PopupMenuItem(
                this._projectPath,
                { reactive: false, style_class: 'dockerpulse-path-item' }
            );
            pathItem.label.add_style_class_name('dockerpulse-muted');
            this.menu.addMenuItem(pathItem);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 2. Container List (built from cache!)
        if (!this._projectPath) {
            let noPathItem = new PopupMenu.PopupMenuItem('No project path configured', { reactive: false });
            this.menu.addMenuItem(noPathItem);
        } else if (this._cachedStatus === 'grey') {
            let errorItem = new PopupMenu.PopupMenuItem('Docker daemon unreachable', { reactive: false });
            this.menu.addMenuItem(errorItem);
        } else if (this._cachedContainers.length === 0) {
            let emptyItem = new PopupMenu.PopupMenuItem('No containers found / Stack down', { reactive: false });
            this.menu.addMenuItem(emptyItem);
        } else {
            this._cachedContainers.forEach(item => {
                let name = item.Name || item.name || 'container';
                let service = item.Service || item.service || name;
                let state = (item.State || item.state || '').toLowerCase();
                let status = item.Status || item.status || state;

                let health = '';
                if (item.Health !== undefined && item.Health !== null) {
                    health = String(item.Health).toLowerCase();
                } else if (item.health !== undefined && item.health !== null) {
                    health = String(item.health).toLowerCase();
                }

                let stateEmoji = '⚪';
                let displayStatus = status;

                if (state === 'running' || state === 'up') {
                    if (health === 'starting') {
                        stateEmoji = '🟡';
                        displayStatus = 'starting';
                    } else if (health === 'unhealthy') {
                        stateEmoji = '⚠️';
                        displayStatus = 'unhealthy';
                    } else {
                        stateEmoji = '🟢';
                    }
                } else if (state === 'restarting') {
                    stateEmoji = '🟡';
                } else if (health === 'unhealthy' || state === 'unhealthy') {
                    stateEmoji = '⚠️';
                    displayStatus = 'unhealthy';
                } else {
                    stateEmoji = '🔴';
                }

                // Submenu for each container containing actions
                let containerSubMenu = new PopupMenu.PopupSubMenuMenuItem(
                    stateEmoji + ' ' + name + ' (' + displayStatus + ')'
                );

                // Quick Actions for Container
                let logsItem = new PopupMenu.PopupMenuItem('Stream Logs');
                logsItem.connect('activate', () => {
                    this._spawnTerminalCommand(['docker', 'compose', 'logs', '-f', service]);
                });
                containerSubMenu.menu.addMenuItem(logsItem);

                let shellItem = new PopupMenu.PopupMenuItem('Interactive Shell');
                shellItem.connect('activate', () => {
                    this._spawnTerminalCommand(['docker', 'compose', 'exec', service, 'sh']);
                });
                containerSubMenu.menu.addMenuItem(shellItem);

                this.menu.addMenuItem(containerSubMenu);
            });
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3. Stack Actions
        if (this._projectPath && this._cachedStatus !== 'grey') {
            let startItem = new PopupMenu.PopupMenuItem('Start Stack');
            startItem.connect('activate', () => {
                this._runStackCommand(['docker', 'compose', 'up', '-d']);
            });
            this.menu.addMenuItem(startItem);

            let restartItem = new PopupMenu.PopupMenuItem('Restart Stack');
            restartItem.connect('activate', () => {
                this._runStackCommand(['docker', 'compose', 'restart']);
            });
            this.menu.addMenuItem(restartItem);

            let stopItem = new PopupMenu.PopupMenuItem('Stop Stack');
            stopItem.connect('activate', () => {
                this._runStackCommand(['docker', 'compose', 'stop']);
            });
            this.menu.addMenuItem(stopItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        // 4. Extension Settings
        let settingsItem = new PopupMenu.PopupMenuItem('Settings');
        settingsItem.connect('activate', () => {
            this._extension.openPreferences();
        });
        this.menu.addMenuItem(settingsItem);
    }

    async _runStackCommand(argv) {
        if (!this._projectPath) return;
        try {
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.NONE,
            });
            launcher.set_cwd(this._projectPath);
            let proc = launcher.spawnv(argv);
            
            // Wait for the stack action process to complete asynchronously (non-blocking)
            await new Promise((resolve) => {
                proc.wait_async(null, (source, res) => {
                    try {
                        source.wait_finish(res);
                    } catch (e) {
                        console.error('[DockerPulse] Error waiting for stack command:', e);
                    }
                    resolve();
                });
            });

            // Trigger state refresh after the stack action has fully completed
            this._refreshState();
        } catch (e) {
            console.error('[DockerPulse] Error running stack command:', e);
        }
    }

    _spawnTerminalCommand(commandArgs) {
        if (!this._projectPath) return;

        // Try gnome-terminal, fallback to kgx (Console), fallback to xterm
        let gnomeTerminalArgs = [
            'gnome-terminal',
            `--working-directory=${this._projectPath}`,
            '--',
        ].concat(commandArgs);

        let kgxArgs = [
            'kgx',
            '--working-directory', this._projectPath,
            '-e', commandArgs.join(' '),
        ];

        let xtermArgs = [
            'xterm',
            '-wdir', this._projectPath,
            '-e', commandArgs.join(' '),
        ];

        try {
            let proc = Gio.Subprocess.new(gnomeTerminalArgs, Gio.SubprocessFlags.NONE);
            proc.init(null);
        } catch (e) {
            try {
                let proc = Gio.Subprocess.new(kgxArgs, Gio.SubprocessFlags.NONE);
                proc.init(null);
            } catch (e2) {
                try {
                    let proc = Gio.Subprocess.new(xtermArgs, Gio.SubprocessFlags.NONE);
                    proc.init(null);
                } catch (e3) {
                    console.error('[DockerPulse] Could not spawn terminal:', e3);
                }
            }
        }
    }

    destroy() {
        this._stopEventStream();
        if (this._settings && this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = null;
        }
        if (this._pollTimerId) {
            GLib.source_remove(this._pollTimerId);
            this._pollTimerId = null;
        }
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = null;
        }
        super.destroy();
    }
});

export default class DockerPulseExtension extends Extension {
    enable() {
        this._registry = new ProcessRegistry();
        try {
            this._registry.spawn(['docker', 'events', '--format', '{{json .}}']);
            console.log('Docker events listener spawned and registered.');
        } catch (e) {
            console.error('[DockerPulse] Failed to spawn docker events:', e);
        }

        this._indicator = new DockerPulseIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._registry) {
            let count = this._registry.activeCount;
            this._registry.cleanup();
            this._registry = null;
            console.log(`Cleaned up registry. Terminated ${count} background processes.`);
        }
    }
}
