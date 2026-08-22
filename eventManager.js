import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Subsystem responsible for managing project-scoped Docker event streaming,
 * stream parsing, debounced notifications, and process registration.
 */
export class EventManager {
    constructor() {
        /** @type {Set<Function>} */
        this._listeners = new Set();
        /** @type {any} */
        this._eventProc = null;
        /** @type {any} */
        this._eventCancellable = null;
        /** @type {number|null} */
        this._reconnectTimerId = null;
        /** @type {number} */
        this._reconnectDelay = 0;
        /** @type {number|null} */
        this._debounceId = null;
        /** @type {string} */
        this._projectPath = '';
        /** @type {string} */
        this._projectName = '';
        /** @type {string} */
        this._extensionPath = '';
        /** @type {any} */
        this._registry = null;
        /** @type {Array<string>|null} */
        this._env = null;
    }

    /**
     * Register a callback listener for event notifications.
     * @param {Function} callback Callback function triggered on event updates.
     * @returns {Function} Unsubscribe function.
     */
    addListener(callback) {
        if (typeof callback === 'function') {
            this._listeners.add(callback);
        }
        return () => this.removeListener(callback);
    }

    /**
     * Remove a callback listener.
     * @param {Function} callback Callback function to remove.
     */
    removeListener(callback) {
        this._listeners.delete(callback);
    }

    /**
     * Start monitoring Docker events for a project configuration.
     * @param {object} [config] Configuration parameters.
     * @param {string} [config.projectPath] Path to project directory.
     * @param {string} [config.projectName] Compose project name.
     * @param {string} [config.extensionPath] Directory path of extension.
     * @param {any} [config.registry] ProcessRegistry instance.
     * @param {Array<string>} [config.env] Environment variables array.
     */
    start(config = {}) {
        this.stop();

        if (config.projectPath !== undefined) this._projectPath = config.projectPath;
        if (config.projectName !== undefined) this._projectName = config.projectName;
        if (config.extensionPath !== undefined) this._extensionPath = config.extensionPath;
        if (config.registry !== undefined) this._registry = config.registry;
        if (config.env !== undefined) this._env = config.env;

        if (!this._projectPath) {
            return;
        }

        try {
            this._eventCancellable = new Gio.Cancellable();
            let launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
            });

            if (this._projectPath) {
                launcher.set_cwd(this._projectPath);
            }

            if (this._env && typeof launcher.set_environ === 'function') {
                launcher.set_environ(this._env);
            }

            let projName = this._projectName;
            if (!projName && this._projectPath) {
                projName = this._projectPath.split('/').pop() || 'DockerPulse';
            }

            let parentPid = GLib.get_pid().toString();
            let wrapperPath = (this._extensionPath ? this._extensionPath + '/' : '') + 'parent_monitor_wrapper.py';

            let argv = [
                'python3',
                wrapperPath,
                '--parent-pid',
                parentPid,
                'docker',
                'events',
                '--filter',
                'type=container',
                '--filter',
                `label=com.docker.compose.project=${projName}`
            ];

            this._eventProc = launcher.spawnv(argv);

            if (this._registry && typeof this._registry.register === 'function') {
                this._registry.register(this._eventProc);
            }

            let stdoutPipe = this._eventProc.get_stdout_pipe();
            let dataStream = new Gio.DataInputStream({
                base_stream: stdoutPipe,
            });

            this._readLine(dataStream);
        } catch (e) {
            console.error('[DockerPulse] Error starting event stream in EventManager:', e);
        }
    }

    /**
     * Asynchronously read line from data stream.
     * @param {any} dataStream Gio DataInputStream
     */
    _readLine(dataStream) {
        if (!this._eventCancellable || this._eventCancellable.is_cancelled()) return;

        dataStream.read_line_async(GLib.PRIORITY_DEFAULT, this._eventCancellable, (stream, res) => {
            try {
                let [line, length] = stream.read_line_finish_utf8(res);
                if (line !== null) {
                    this.triggerDebouncedRefresh();
                    this._readLine(stream);
                } else {
                    this._handleEventStreamClosed();
                }
            } catch (e) {
                if (e.matches && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    return;
                }
                console.error('[DockerPulse] Error reading from stream in EventManager:', e);
                this._handleEventStreamClosed();
            }
        });
    }

    /**
     * Handle closed event stream and manage exponential backoff reconnects.
     */
    _handleEventStreamClosed() {
        this._eventProc = null;

        if (!this._reconnectDelay) {
            this._reconnectDelay = 5;
        } else {
            this._reconnectDelay = Math.min(60, this._reconnectDelay * 2);
        }

        if (this._reconnectTimerId) {
            GLib.source_remove(this._reconnectTimerId);
            this._reconnectTimerId = null;
        }

        if (this._projectPath && this._eventCancellable && !this._eventCancellable.is_cancelled()) {
            this._reconnectTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._reconnectDelay, () => {
                this._reconnectTimerId = null;
                if (this._projectPath && !this._eventProc) {
                    this.start();
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    /**
     * Trigger a refresh debounced with 150ms timer threshold.
     */
    triggerDebouncedRefresh() {
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = null;
        }
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._debounceId = null;
            this._notifyListeners();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Process Docker event line.
     * @param {string} line Event output line.
     */
    handleDockerEvent(line) {
        this.triggerDebouncedRefresh();
    }

    /**
     * Notify all registered listeners.
     */
    _notifyListeners() {
        for (let listener of this._listeners) {
            try {
                listener();
            } catch (e) {
                console.error('[DockerPulse] Error in EventManager listener:', e);
            }
        }
    }

    /**
     * Stop active event stream, cancel pending timers and async reads.
     */
    stop() {
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
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = null;
        }
        this._reconnectDelay = 0;
    }

    /**
     * Completely destroy EventManager instance.
     */
    destroy() {
        this.stop();
        this._listeners.clear();
    }
}

export const DockerEventManager = EventManager;
