import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DockerPulseButton = GObject.registerClass(
class DockerPulseButton extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'DockerPulse');
        this.extension = extension;

        // Container box layout in panel
        this._container = new St.BoxLayout({ style_class: 'panel-button' });

        this._dotLabel = new St.Label({
            text: '●',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'color: #9a9996; font-size: 14px; margin-right: 6px;'
        });

        this._statusLabel = new St.Label({
            text: '--/--',
            y_align: Clutter.ActorAlign.CENTER
        });

        this._container.add_child(this._dotLabel);
        this._container.add_child(this._statusLabel);
        this.add_child(this._container);

        this._containers = [];
        this._errorMsg = '';
        this._currentPath = '';
        this._pollTimeoutId = null;

        // Rebuild the menu each time it is opened
        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._rebuildMenu();
            }
        });
    }

    start() {
        this._poll();
        this._pollTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 10, () => {
            this._poll();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._pollTimeoutId) {
            GLib.Source.remove(this._pollTimeoutId);
            this._pollTimeoutId = null;
        }
    }

    _getConfig() {
        const extensionPath = this.extension.path;
        const userConfigDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'dockerpulse']);
        const userConfigFile = GLib.build_filenamev([userConfigDir, 'config.json']);
        const extensionConfigFile = GLib.build_filenamev([extensionPath, 'config.json']);

        let configPath = userConfigFile;

        // Ensure user config directory exists
        try {
            GLib.mkdir_with_parents(userConfigDir, 0o755);
        } catch (e) {
            log(`DockerPulse: Error creating user config directory: ${e}`);
        }

        // Initialize user config file if missing
        if (!GLib.file_test(userConfigFile, GLib.FileTest.EXISTS)) {
            let defaultContent = '{\n  "project_path": ""\n}';
            if (GLib.file_test(extensionConfigFile, GLib.FileTest.EXISTS)) {
                try {
                    let [ok, content] = GLib.file_get_contents(extensionConfigFile);
                    if (ok) {
                        defaultContent = content.toString();
                    }
                } catch (e) {
                    log(`DockerPulse: Error reading extension config: ${e}`);
                }
            }

            try {
                GLib.file_set_contents(userConfigFile, defaultContent);
            } catch (e) {
                log(`DockerPulse: Failed to write user config file: ${e}`);
                configPath = extensionConfigFile;
            }
        }

        let projectPath = '';
        try {
            let [ok, content] = GLib.file_get_contents(configPath);
            if (ok) {
                let data = JSON.parse(content.toString());
                projectPath = data.project_path || '';
            }
        } catch (e) {
            log(`DockerPulse: Error parsing config file: ${e}`);
            if (configPath !== extensionConfigFile && GLib.file_test(extensionConfigFile, GLib.FileTest.EXISTS)) {
                try {
                    let [ok, content] = GLib.file_get_contents(extensionConfigFile);
                    if (ok) {
                        let data = JSON.parse(content.toString());
                        projectPath = data.project_path || '';
                    }
                } catch (err) {
                    log(`DockerPulse: Error parsing fallback config: ${err}`);
                }
            }
        }

        return {
            path: configPath,
            project_path: projectPath
        };
    }

    async _poll() {
        const config = this._getConfig();
        this._currentPath = config.project_path;

        if (!this._currentPath || !this._currentPath.trim()) {
            this._updateStatus('grey', '--/--', 'No project path configured in config.json');
            this._containers = [];
            return;
        }

        const trimmedPath = this._currentPath.trim();
        if (!GLib.file_test(trimmedPath, GLib.FileTest.EXISTS | GLib.FileTest.IS_DIR)) {
            this._updateStatus('grey', '--/--', `Directory does not exist: ${trimmedPath}`);
            this._containers = [];
            return;
        }

        try {
            // Asynchronously run docker compose ps
            let result = await this._runCommandAsync(
                ['docker', 'compose', 'ps', '--all', '--format', 'json'],
                trimmedPath
            );

            if (!result.success) {
                let err = (result.stderr || 'Execution failed').trim();
                this._updateStatus('grey', '--/--', `Docker Compose error: ${err}`);
                this._containers = [];
                return;
            }

            let containers = this._parseDockerComposePsOutput(result.stdout);
            this._containers = containers;
            this._errorMsg = '';

            if (containers.length === 0) {
                this._updateStatus('red', '0/0', 'Stack has no containers running');
            } else {
                let total = containers.length;
                let active = 0;
                for (const c of containers) {
                    if (this._isContainerActive(c)) {
                        active++;
                    }
                }

                let color = 'grey';
                if (active === total) {
                    color = 'green';
                } else if (active > 0) {
                    color = 'yellow';
                } else {
                    color = 'red';
                }

                this._updateStatus(color, `${active}/${total}`, '');
            }
        } catch (e) {
            this._updateStatus('grey', '--/--', `Exception: ${e.message || e}`);
            this._containers = [];
        }
    }

    _runCommandAsync(argv, cwd = null) {
        return new Promise((resolve) => {
            try {
                let flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
                let launcher = new Gio.SubprocessLauncher({ flags: flags });
                if (cwd) {
                    let file = Gio.File.new_for_path(cwd);
                    launcher.set_cwd(file);
                }

                let proc = launcher.spawnv(argv);

                proc.communicate_utf8_async(null, null, (obj, res) => {
                    try {
                        let [ok, stdout, stderr] = obj.communicate_utf8_finish(res);
                        if (ok) {
                            resolve({
                                success: proc.get_successful(),
                                exitStatus: proc.get_exit_status(),
                                stdout: stdout || '',
                                stderr: stderr || ''
                            });
                        } else {
                            resolve({
                                success: false,
                                exitStatus: -1,
                                stdout: '',
                                stderr: 'Communication with subprocess failed'
                            });
                        }
                    } catch (e) {
                        resolve({
                            success: false,
                            exitStatus: -1,
                            stdout: '',
                            stderr: `Subprocess error: ${e.message || e}`
                        });
                    }
                });
            } catch (e) {
                resolve({
                    success: false,
                    exitStatus: -1,
                    stdout: '',
                    stderr: `Failed to spawn: ${e.message || e}`
                });
            }
        });
    }

    _parseDockerComposePsOutput(outputStr) {
        if (!outputStr || !outputStr.trim()) {
            return [];
        }
        const trimmed = outputStr.trim();
        if (trimmed.startsWith('[')) {
            try {
                return JSON.parse(trimmed);
            } catch (e) {
                // Try line-by-line fallback
            }
        }

        const lines = trimmed.split('\n');
        const containers = [];
        for (const line of lines) {
            if (line.trim()) {
                try {
                    containers.push(JSON.parse(line));
                } catch (e) {
                    // Ignore line-level parsing error
                }
            }
        }
        return containers;
    }

    _isContainerActive(c) {
        const state = (c.State || '').toLowerCase();
        const status = (c.Status || '').toLowerCase();
        const health = (c.Health || '').toLowerCase();

        const isRunning = state === 'running' || state === 'up' || status.includes('up');
        const isHealthy = health === 'healthy' || health === '' || health === 'starting';

        return isRunning && isHealthy;
    }

    _updateStatus(color, text, errorMsg = '') {
        this._errorMsg = errorMsg;
        this._statusLabel.set_text(text);

        let dotStyle = 'font-size: 14px; margin-right: 6px;';
        if (color === 'green') {
            dotStyle += ' color: #2ec27e;';
        } else if (color === 'yellow') {
            dotStyle += ' color: #f5c211;';
        } else if (color === 'red') {
            dotStyle += ' color: #e01b24;';
        } else {
            dotStyle += ' color: #9a9996;';
        }
        this._dotLabel.set_style(dotStyle);

        // Instantly update popup if currently open
        if (this.menu.isOpen) {
            this._rebuildMenu();
        }
    }

    _rebuildMenu() {
        this.menu.removeAll();

        // 1. Current Project Path
        let pathLabel = this._currentPath ? this._currentPath : 'None configured';
        let pathItem = new PopupMenu.PopupMenuItem(`Project: ${pathLabel}`, { reactive: false });
        pathItem.reactive = false;
        this.menu.addMenuItem(pathItem);

        if (this._errorMsg) {
            let errItem = new PopupMenu.PopupMenuItem(`⚠️ ${this._errorMsg}`, { reactive: false });
            errItem.reactive = false;
            errItem.label.style = 'color: #ff7b72; font-size: 11px;';
            this.menu.addMenuItem(errItem);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 2. Stack Actions
        let restartItem = new PopupMenu.PopupMenuItem('🔄 Restart Stack');
        restartItem.connect('activate', () => {
            this._runStackAction('restart');
        });
        this.menu.addMenuItem(restartItem);

        let stopItem = new PopupMenu.PopupMenuItem('🛑 Stop Stack');
        stopItem.connect('activate', () => {
            this._runStackAction('stop');
        });
        this.menu.addMenuItem(stopItem);

        let logsItem = new PopupMenu.PopupMenuItem('📋 View Stack Logs');
        logsItem.connect('activate', () => {
            this._runStackAction('logs');
        });
        this.menu.addMenuItem(logsItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // 3. Containers list
        if (this._containers.length === 0) {
            let emptyItem = new PopupMenu.PopupMenuItem('No active containers found', { reactive: false });
            emptyItem.reactive = false;
            this.menu.addMenuItem(emptyItem);
        } else {
            let sectionHeader = new PopupMenu.PopupMenuItem('Containers:', { reactive: false });
            sectionHeader.reactive = false;
            this.menu.addMenuItem(sectionHeader);

            for (const container of this._containers) {
                const name = container.Name || container.Service || 'unknown';
                const state = container.State || 'unknown';

                let is_active = this._isContainerActive(container);
                let emoji = is_active ? '🟢' : (state === 'restarting' ? '🟡' : '🔴');

                let containerSubMenu = new PopupMenu.PopupSubMenuMenuItem(`${emoji} ${name} (${state})`);

                let containerLogs = new PopupMenu.PopupMenuItem('📋 View Logs');
                containerLogs.connect('activate', () => {
                    this._runContainerAction(name, 'logs', container.Service || name);
                });
                containerSubMenu.menu.addMenuItem(containerLogs);

                let containerShell = new PopupMenu.PopupMenuItem('💻 Open Terminal');
                containerShell.connect('activate', () => {
                    this._runContainerAction(name, 'terminal', container.Service || name);
                });
                containerSubMenu.menu.addMenuItem(containerShell);

                this.menu.addMenuItem(containerSubMenu);
            }
        }
    }

    _runStackAction(action) {
        if (!this._currentPath) {
            this._showNotification('No configured project path.');
            return;
        }

        const term = this._findTerminalEmulator();
        if (!term) {
            this._showNotification('No supported terminal emulator found.');
            return;
        }

        let cmd = '';
        if (action === 'restart') {
            cmd = `cd ${JSON.stringify(this._currentPath)} && docker compose restart; echo "Press Enter to exit..."; read`;
        } else if (action === 'stop') {
            cmd = `cd ${JSON.stringify(this._currentPath)} && docker compose down; echo "Press Enter to exit..."; read`;
        } else if (action === 'logs') {
            cmd = `cd ${JSON.stringify(this._currentPath)} && docker compose logs -f; echo "Press Enter to exit..."; read`;
        }

        if (cmd) {
            this._runInTerminal(term, cmd);
        }
    }

    _runContainerAction(name, action, serviceName) {
        if (!this._currentPath) {
            this._showNotification('No configured project path.');
            return;
        }

        const term = this._findTerminalEmulator();
        if (!term) {
            this._showNotification('No supported terminal emulator found.');
            return;
        }

        let cmd = '';
        if (action === 'logs') {
            cmd = `cd ${JSON.stringify(this._currentPath)} && docker compose logs -f ${JSON.stringify(serviceName)}; echo "Press Enter to exit..."; read`;
        } else if (action === 'terminal') {
            cmd = `(docker exec -it ${JSON.stringify(name)} bash || docker exec -it ${JSON.stringify(name)} sh); echo "Press Enter to exit..."; read`;
        }

        if (cmd) {
            this._runInTerminal(term, cmd);
        }
    }

    _showNotification(msg) {
        try {
            if (Main && typeof Main.notify === 'function') {
                Main.notify('DockerPulse', msg);
            } else {
                log(`DockerPulse Notification: ${msg}`);
            }
        } catch (e) {
            log(`DockerPulse Notification failed: ${e}`);
        }
    }

    _findTerminalEmulator() {
        const terminals = ['gnome-terminal', 'kgx', 'x-terminal-emulator', 'kitty', 'alacritty', 'xterm'];
        for (const term of terminals) {
            try {
                if (GLib.find_program_in_path(term)) {
                    return term;
                }
            } catch (e) {
                // Ignore program finding errors
            }
        }
        return null;
    }

    _runInTerminal(terminal, commandStr) {
        let argv = [];
        if (terminal === 'gnome-terminal' || terminal === 'kgx' || terminal === 'kitty') {
            argv = [terminal, '--', 'bash', '-c', commandStr];
        } else if (terminal === 'alacritty' || terminal === 'xterm' || terminal === 'x-terminal-emulator') {
            argv = [terminal, '-e', 'bash', '-c', commandStr];
        } else {
            argv = ['gnome-terminal', '--', 'bash', '-c', commandStr];
        }

        try {
            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        } catch (e) {
            this._showNotification(`Failed to launch terminal: ${e.message || e}`);
        }
    }
});

export default class DockerPulseExtension extends Extension {
    enable() {
        this._indicator = new DockerPulseButton(this);
        Main.panel.addToStatusArea('dockerpulse', this._indicator);
        this._indicator.start();
    }

    disable() {
        if (this._indicator) {
            this._indicator.stop();
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
