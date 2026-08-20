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

function getSettingBool(settings, key, fallback) {
    if (!settings) return fallback;
    try {
        return settings.get_boolean(key);
    } catch (e) {
        console.error(`[DockerPulse] Failed to get boolean for key "${key}":`, e);
        return fallback;
    }
}

function getSafeEnviron() {
    if (GLib && typeof GLib.get_environ === 'function') {
        try {
            return GLib.get_environ();
        } catch (e) {}
    }
    return [];
}

function setEnvironVar(env, key, value) {
    if (GLib && typeof GLib.environ_setenv === 'function') {
        try {
            return GLib.environ_setenv(env, key, value, true);
        } catch (e) {}
    }
    // Fallback for mock environments
    let prefix = key + '=';
    let filtered = env.filter(item => !item.startsWith(prefix));
    filtered.push(prefix + value);
    return filtered;
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
        this._state = Object.freeze({
            containers: [],
            status: 'grey', // 'green', 'yellow', 'red', 'grey'
            projectName: '',
            activeCount: 0,
            totalCount: 0
        });
        this._cachedContainers = [];
        this._cachedStatus = 'grey'; // 'green', 'yellow', 'red', 'grey'
        this._cachedProjectName = '';
        this._unhealthyContainers = new Set();
        this._notificationTimerId = null;

        // Local state cache is read from when menu opens (preventing synchronous system calls)
        this.menu.connect('menu-opened', () => {
            this._buildMenu();
        });

        // Watch settings changes
        if (this._settings) {
            this._settingsId = this._settings.connect('changed', (settings, key) => {
                if (key && key.startsWith('diagnostic-')) {
                    return;
                }
                this._onSettingsChanged();
            });
        }

        // Initialize state (this sets up poll timer & streams & cached project name)
        this._onSettingsChanged();
    }

    _onSettingsChanged() {
        this._projectPath = getSettingString(this._settings, 'project-path', '');
        this._showContainerCount = getSettingBool(this._settings, 'show-container-count', true);
        
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

            // Trigger background environment discovery and diagnostics
            this._discoverAndValidateEnvironment().then(() => {
                this._stopEventStream();
                this._startEventStream();
                this._refreshState();
            }).catch(e => {
                console.error('[DockerPulse] Environment discovery error:', e);
            });
        } else {
            this._cachedProjectName = '';
            this._cachedContainers = [];
            this._cachedStatus = 'grey';
            this._state = Object.freeze({
                containers: [],
                status: 'grey',
                projectName: '',
                activeCount: 0,
                totalCount: 0
            });
            this._updateUI();
        }
        
        this._refreshState();
    }

    _getLauncherEnviron() {
        let env = getSafeEnviron();
        if (this._resolvedHost) env = setEnvironVar(env, 'DOCKER_HOST', this._resolvedHost);
        if (this._resolvedCertPath) env = setEnvironVar(env, 'DOCKER_CERT_PATH', this._resolvedCertPath);
        if (this._resolvedTlsVerify) env = setEnvironVar(env, 'DOCKER_TLS_VERIFY', this._resolvedTlsVerify);

        let profiles = getSettingString(this._settings, 'compose-profiles', '');
        let composeFile = getSettingString(this._settings, 'compose-file', '');
        if (profiles) env = setEnvironVar(env, 'COMPOSE_PROFILES', profiles);
        if (composeFile) env = setEnvironVar(env, 'COMPOSE_FILE', composeFile);

        return env;
    }

    async _discoverAndValidateEnvironment() {
        let customHost = getSettingString(this._settings, 'custom-host', '');
        let customCertPath = getSettingString(this._settings, 'custom-cert-path', '');
        let customTlsVerify = getSettingBool(this._settings, 'custom-tls-verify', false);

        let resolvedHost = '';
        let resolvedCertPath = '';
        let resolvedTlsVerify = '';

        if (customHost) {
            resolvedHost = customHost;
            resolvedCertPath = customCertPath;
            resolvedTlsVerify = customTlsVerify ? '1' : '';
        } else {
            // Attempt Background Shell Discovery
            let shellHost = '';
            let shellCertPath = '';
            let shellTlsVerify = '';
            try {
                let launcher = new Gio.SubprocessLauncher({
                    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                });
                let proc = launcher.spawnv(['bash', '-l', '-c', 'env']);
                let res = await new Promise((resolve, reject) => {
                    proc.communicate_utf8_async(null, null, (obj, r) => {
                        try {
                            let [success, stdout, stderr] = obj.communicate_utf8_finish(r);
                            resolve({ success, stdout, stderr });
                        } catch (e) {
                            reject(e);
                        }
                    });
                });
                if (res.success && res.stdout) {
                    let lines = res.stdout.split('\n');
                    for (let line of lines) {
                        let trimLine = line.trim();
                        if (trimLine.startsWith('DOCKER_HOST=')) {
                            shellHost = trimLine.substring('DOCKER_HOST='.length);
                        } else if (trimLine.startsWith('DOCKER_CERT_PATH=')) {
                            shellCertPath = trimLine.substring('DOCKER_CERT_PATH='.length);
                        } else if (trimLine.startsWith('DOCKER_TLS_VERIFY=')) {
                            shellTlsVerify = trimLine.substring('DOCKER_TLS_VERIFY='.length);
                        }
                    }
                }
            } catch (e) {
                console.error('[DockerPulse] Shell env discovery failed:', e);
            }

            if (shellHost) {
                resolvedHost = shellHost;
                resolvedCertPath = shellCertPath;
                resolvedTlsVerify = shellTlsVerify;
            } else {
                // Attempt Rootless socket auto-discovery in user directories
                let socketPath = '';
                let runtimeSock = GLib.get_user_runtime_dir() + '/docker.sock';
                let homeSock1 = GLib.get_home_dir() + '/.docker/run/docker.sock';
                let homeSock2 = GLib.get_home_dir() + '/.docker/desktop/docker.sock';

                let checkFileExists = (path) => {
                    try {
                        let file = Gio.File.new_for_path(path);
                        return file.query_exists(null);
                    } catch (e) {
                        return false;
                    }
                };

                if (checkFileExists(runtimeSock)) {
                    socketPath = 'unix://' + runtimeSock;
                } else if (checkFileExists(homeSock1)) {
                    socketPath = 'unix://' + homeSock1;
                } else if (checkFileExists(homeSock2)) {
                    socketPath = 'unix://' + homeSock2;
                }

                if (socketPath) {
                    resolvedHost = socketPath;
                    resolvedCertPath = '';
                    resolvedTlsVerify = '';
                }
            }
        }

        this._resolvedHost = resolvedHost;
        this._resolvedCertPath = resolvedCertPath;
        this._resolvedTlsVerify = resolvedTlsVerify;

        // Perform connection validation
        let status = 'error';
        let errorMsg = 'Docker daemon unreachable.';
        try {
            let testLauncher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            let testEnv = this._getLauncherEnviron();
            if (typeof testLauncher.set_environ === 'function') {
                testLauncher.set_environ(testEnv);
            }

            let testProc = testLauncher.spawnv(['docker', 'info']);
            let testRes = await new Promise((resolve, reject) => {
                testProc.communicate_utf8_async(null, null, (obj, r) => {
                    try {
                        let [success, stdout, stderr] = obj.communicate_utf8_finish(r);
                        resolve({ success, stdout, stderr });
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            if (testRes.success) {
                status = 'connected';
                errorMsg = 'Connected and validated successfully.';
            } else {
                status = 'error';
                errorMsg = testRes.stderr ? testRes.stderr.trim() : 'Docker daemon unreachable.';
            }
        } catch (e) {
            status = 'error';
            errorMsg = e.message || 'Failed to spawn validation command.';
        }

        if (this._settings && typeof this._settings.set_string === 'function') {
            try {
                this._settings.set_string('diagnostic-status', status);
                this._settings.set_string('diagnostic-error', errorMsg);
                this._settings.set_string('diagnostic-resolved-host', resolvedHost || 'None (System Default)');
                this._settings.set_string('diagnostic-resolved-cert-path', resolvedCertPath || 'None');
                this._settings.set_string('diagnostic-resolved-tls-verify', resolvedTlsVerify || 'None');
            } catch (err) {
                console.error('[DockerPulse] Failed to write diagnostics back to GSettings:', err);
            }
        }
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
            let env = this._getLauncherEnviron();
            if (typeof launcher.set_environ === 'function') {
                launcher.set_environ(env);
            }
            
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

    get _cachedContainers() {
        return this._state ? this._state.containers : [];
    }

    set _cachedContainers(containers) {
        let active = 0;
        let total = 0;
        if (Array.isArray(containers)) {
            containers.forEach(item => {
                if (item) {
                    total++;
                    if (this._isContainerActive(item)) {
                        active++;
                    }
                }
            });
        }
        this._state = Object.freeze({
            containers: containers || [],
            status: this._state ? this._state.status : 'grey',
            projectName: this._state ? this._state.projectName : '',
            activeCount: active,
            totalCount: total
        });
    }

    get _cachedStatus() {
        return this._state ? this._state.status : 'grey';
    }

    set _cachedStatus(status) {
        this._state = Object.freeze({
            containers: this._state ? this._state.containers : [],
            status: status,
            projectName: this._state ? this._state.projectName : '',
            activeCount: this._state ? this._state.activeCount : 0,
            totalCount: this._state ? this._state.totalCount : 0
        });
    }

    async _refreshState() {
        if (!this._projectPath) {
            this._cachedContainers = [];
            this._cachedStatus = 'grey';
            this._state = Object.freeze({
                containers: [],
                status: 'grey',
                projectName: '',
                activeCount: 0,
                totalCount: 0
            });
            this._updateUI();
            return;
        }

        try {
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });
            launcher.set_cwd(this._projectPath);
            let env = this._getLauncherEnviron();
            if (typeof launcher.set_environ === 'function') {
                launcher.set_environ(env);
            }
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
                
                // Track health transition notifications & active containers count in a single background pass
                let newlyUnhealthy = [];
                let currentUnhealthy = new Set();
                let active = 0;
                let total = containers.length;

                containers.forEach(item => {
                    if (!item) return;
                    let name = item.Name || item.name || '';
                    let state = (item.State || item.state || '').toLowerCase();
                    let health = (item.Health || item.health || '').toLowerCase();
                    
                    if ((state === 'running' || state === 'up') && health === 'unhealthy') {
                        currentUnhealthy.add(name);
                        if (name && !this._unhealthyContainers.has(name)) {
                            newlyUnhealthy.push(name);
                        }
                    }

                    if (this._isContainerActive(item)) {
                        active++;
                    }
                });
                this._unhealthyContainers = currentUnhealthy;

                if (newlyUnhealthy.length > 0) {
                    let count = newlyUnhealthy.length;
                    let names = newlyUnhealthy.join(', ');
                    let message = `${count} container${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} unhealthy: ${names}`;

                    if (this._notificationTimerId) {
                        GLib.source_remove(this._notificationTimerId);
                        this._notificationTimerId = null;
                    }

                    this._notificationTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
                        this._notificationTimerId = null;
                        try {
                            if (typeof Main !== 'undefined' && Main.notify) {
                                Main.notify("DockerPulse Warning", message);
                            } else {
                                const uiMain = imports.ui.main;
                                uiMain.notify("DockerPulse Warning", message);
                            }
                        } catch (err) {
                            console.error(`[DockerPulse] Failed to send consolidated notification:`, err);
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                }

                // Determine overall status
                let status = 'grey';
                if (total === 0) {
                    status = 'red'; // No containers running or created (stack down)
                } else if (active === total) {
                    status = 'green';
                } else if (active > 0) {
                    status = 'yellow';
                } else {
                    status = 'red';
                }

                this._cachedStatus = status;

                // Build a pre-calculated, read-only state object
                this._state = Object.freeze({
                    containers: containers,
                    status: status,
                    projectName: this._cachedProjectName,
                    activeCount: active,
                    totalCount: total
                });

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
                this._state = Object.freeze({
                    containers: [],
                    status: 'grey',
                    projectName: this._cachedProjectName,
                    activeCount: 0,
                    totalCount: 0
                });
                this._backoffPollInterval();
                this._updateUI();
            }
        } catch (e) {
            // Exception - daemon unreachable
            this._cachedContainers = [];
            this._cachedStatus = 'grey';
            this._state = Object.freeze({
                containers: [],
                status: 'grey',
                projectName: this._cachedProjectName,
                activeCount: 0,
                totalCount: 0
            });
            this._backoffPollInterval();
            this._updateUI();
        }
    }

    _updateUI() {
        let emoji = '⚪';
        let countText = ' --';

        if (this._projectPath) {
            switch (this._state.status) {
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

            if (this._state.status !== 'grey') {
                countText = ` ${this._state.activeCount}/${this._state.totalCount}`;
            } else {
                countText = ' --';
            }
        } else {
            emoji = '⚪';
            countText = ' [no path]';
        }

        this._statusLabel.set_text(emoji);
        this._countLabel.set_text(countText);
        this._countLabel.visible = this._showContainerCount;
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
        } else if (this._state.status === 'grey') {
            let errorItem = new PopupMenu.PopupMenuItem('Docker daemon unreachable', { reactive: false });
            this.menu.addMenuItem(errorItem);
        } else if (this._state.containers.length === 0) {
            let emptyItem = new PopupMenu.PopupMenuItem('No containers found / Stack down', { reactive: false });
            this.menu.addMenuItem(emptyItem);
        } else {
            this._state.containers.forEach(item => {
                if (!item) return;
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
                let healthLabel = '';
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
                    healthLabel = ' [inactive]';
                }

                // Submenu for each container containing actions
                let containerSubMenu = new PopupMenu.PopupSubMenuMenuItem(
                    stateEmoji + ' ' + name + ' (' + displayStatus + ')' + healthLabel
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
        if (this._projectPath && this._state.status !== 'grey') {
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
            let env = this._getLauncherEnviron();
            if (typeof launcher.set_environ === 'function') {
                launcher.set_environ(env);
            }
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

        let ptyxisArgs = [
            'ptyxis',
            '--working-directory', this._projectPath,
            '-e', commandArgs.join(' '),
        ];

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

        let spawnWithEnv = (args) => {
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.NONE,
            });
            let env = this._getLauncherEnviron();
            if (typeof launcher.set_environ === 'function') {
                launcher.set_environ(env);
            }
            return launcher.spawnv(args);
        };

        try {
            spawnWithEnv(ptyxisArgs);
        } catch (e1) {
            try {
                spawnWithEnv(gnomeTerminalArgs);
            } catch (e2) {
                try {
                    spawnWithEnv(kgxArgs);
                } catch (e3) {
                    try {
                        spawnWithEnv(xtermArgs);
                    } catch (e4) {
                        console.error('[DockerPulse] Could not spawn terminal:', e4);
                    }
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
        if (this._notificationTimerId) {
            GLib.source_remove(this._notificationTimerId);
            this._notificationTimerId = null;
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
        console.log('[DockerPulse] Disabling extension...');
        if (this._registry) {
            const count = this._registry.activeCount;
            this._registry.cleanup();
            this._registry = null;
            console.log(`[DockerPulse] Cleaned up registry. Terminated ${count} background processes.`);
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
