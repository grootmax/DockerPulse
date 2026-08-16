import { jest } from '@jest/globals';

globalThis.mockSettings = {
    'project-path': '/path/to/my-project',
    'project-name': '',
    'poll-interval': 25,
    'show-container-count': true,
    'alert-style': 'individual',
};

globalThis.notifications = [];
globalThis.mockDockerComposePsOutput = '[]';

// Virtual mock for gi://GObject module to run in Node/Jest environment
jest.unstable_mockModule('gi://GObject', () => {
    return {
        default: {
            registerClass: (cls) => cls,
        }
    };
}, { virtual: true });

// Virtual mock for gi://GLib module to run in Node/Jest environment
jest.unstable_mockModule('gi://GLib', () => {
    return {
        default: {
            timeout_add_seconds: () => 1,
            source_remove: () => {},
            get_pid: () => 12345,
            PRIORITY_DEFAULT: 0,
        }
    };
}, { virtual: true });

// Virtual mock for gi://Clutter module to run in Node/Jest environment
jest.unstable_mockModule('gi://Clutter', () => {
    return {
        default: {
            ActorAlign: { CENTER: 0, END: 1 },
        }
    };
}, { virtual: true });

// Virtual mock for gi://St module to run in Node/Jest environment
jest.unstable_mockModule('gi://St', () => {
    return {
        default: {
            BoxLayout: class {
                constructor() {}
                add_child() {}
            },
            Label: class {
                constructor(props) {
                    this.text = props ? props.text : '';
                }
                set_text(text) {
                    this.text = text;
                }
            },
            Icon: class {
                constructor() {}
            },
            Button: class {
                constructor() {}
                connect() {}
            },
        }
    };
}, { virtual: true });

// Virtual mock for GNOME Shell UI modules
jest.unstable_mockModule('resource:///org/gnome/shell/ui/main.js', () => {
    return {
        panel: {
            addToStatusArea: () => {},
        },
        notify: (title, msg) => {
            if (globalThis.notifications) {
                globalThis.notifications.push({ title, msg });
            }
        },
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/ui/panelMenu.js', () => {
    return {
        Button: class {
            constructor() {
                this.menu = {
                    connect: () => {},
                    removeAll: () => {},
                    addMenuItem: () => {},
                };
            }
            destroy() {}
        }
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/ui/popupMenu.js', () => {
    return {
        PopupMenuItem: class {
            constructor() {
                this.label = { add_style_class_name: () => {} };
            }
            connect() {}
            add_child() {}
        },
        PopupSeparatorMenuItem: class {},
        PopupSubMenuMenuItem: class {
            constructor() {
                this.menu = { addMenuItem: () => {} };
            }
        },
    };
}, { virtual: true });

// Virtual mock for gi://Gio module to run in Node/Jest environment
jest.unstable_mockModule('gi://Gio', () => {
    return {
        default: {
            registerClass: (...args) => args[args.length - 1],
        }
    };
}, { virtual: true });

let spawnedArgvs = [];
let spawnedCwds = [];
let popupSubMenuItems = [];
let popupMenuItems = [];

class MockSubprocess {
    constructor(argv) {
        this.argv = argv;
    }
    get_stdout_pipe() {
        return {};
    }
    communicate_utf8_async(a, b, callback) {
        // Mock communication finishing immediately to avoid pending promises
        process.nextTick(() => {
            callback(this, 'dummy-res');
        });
    }
    communicate_utf8_finish(res) {
        return [true, globalThis.mockDockerComposePsOutput || '[]', ''];
    }
    wait_async(cancellable, callback) {
        process.nextTick(() => {
            if (callback) callback(this, 'dummy-res');
        });
    }
    wait_finish(res) {
        return true;
    }
}

jest.unstable_mockModule('gi://Gio', () => {
    return {
        default: {
            SubprocessLauncher: class {
                constructor() {}
                set_cwd(cwd) {
                    spawnedCwds.push(cwd);
                }
                spawnv(argv) {
                    spawnedArgvs.push(argv);
                    return new MockSubprocess(argv);
                }
            },
            Subprocess: class {
                constructor(config) {
                    this.argv = config.argv;
                    this.flags = config.flags;
                }
                init(cancellable) {}
                wait_async(cancellable, callback) {
                    process.nextTick(() => {
                        if (callback) callback(this, 'dummy-res');
                    });
                }
                wait_finish(res) { return true; }
                get_stdout_pipe() { return {}; }
                static new(argv, flags) {
                    spawnedArgvs.push(argv);
                    return new this({ argv, flags });
                }
            },
            SubprocessFlags: {
                NONE: 0,
                STDOUT_PIPE: 1,
                STDERR_PIPE: 2,
            },
            Cancellable: class {
                is_cancelled() { return false; }
                cancel() {}
            },
            DataInputStream: class {
                constructor() {}
                read_line_async() {}
            },
            IOErrorEnum: {
                CANCELLED: 1,
            },
        }
    };
}, { virtual: true });

jest.unstable_mockModule('gi://Clutter', () => {
    return {
        default: {
            ActorAlign: {
                CENTER: 1,
            },
        }
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/extensions/extension.js', () => {
    return {
        Extension: class {
            constructor() {}
            getSettings() {
                return {
                    connect: () => 1,
                    disconnect: () => {},
                    get_string: (key) => {
                        return globalThis.mockSettings[key] !== undefined ? globalThis.mockSettings[key] : '';
                    },
                    get_int: (key) => {
                        return globalThis.mockSettings[key] !== undefined ? globalThis.mockSettings[key] : 25;
                    },
                    get_boolean: (key) => {
                        return globalThis.mockSettings[key] !== undefined ? globalThis.mockSettings[key] : true;
                    },
                    set_string: (key, val) => {
                        globalThis.mockSettings[key] = val;
                    },
                    set_int: (key, val) => {
                        globalThis.mockSettings[key] = val;
                    },
                    set_boolean: (key, val) => {
                        globalThis.mockSettings[key] = val;
                    }
                };
            }
        },
        gettext: (text) => text,
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/ui/main.js', () => {
    return {
        panel: {
            addToStatusArea: () => {},
        },
        notify: (title, msg) => {
            if (globalThis.notifications) {
                globalThis.notifications.push({ title, msg });
            }
        },
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/ui/panelMenu.js', () => {
    return {
        Button: class {
            constructor(...args) {
                this.menu = {
                    connect: () => {},
                    removeAll: () => {},
                    addMenuItem: () => {},
                };
                if (typeof this._init === 'function') {
                    this._init(...args);
                }
            }
            _init() {}
            add_child() {}
            destroy() {}
        }
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/ui/popupMenu.js', () => {
    return {
        PopupMenuItem: class {
            constructor(label) {
                this.label_text = label;
                this.label = { add_style_class_name: () => {} };
                popupMenuItems.push(this);
            }
            connect() {}
            add_child() {}
        },
        PopupSeparatorMenuItem: class {},
        PopupSubMenuMenuItem: class {
            constructor(label) {
                this.label_text = label;
                this.menu = {
                    addMenuItem: () => {},
                };
                popupSubMenuItems.push(this);
            }
        }
    };
}, { virtual: true });

// Import extension.js
const { default: DockerPulseExtension } = await import('./extension.js');

describe('DockerPulseExtension & Wrapper Spawning', () => {
    let extensionInstance;

    beforeEach(() => {
        spawnedArgvs = [];
        spawnedCwds = [];
        popupSubMenuItems = [];
        popupMenuItems = [];
        globalThis.notifications = [];
        globalThis.mockDockerComposePsOutput = '[]';
        globalThis.mockSettings = {
            'project-path': '/path/to/my-project',
            'project-name': '',
            'poll-interval': 25,
            'show-container-count': true,
            'alert-style': 'individual',
        };
        extensionInstance = new DockerPulseExtension();
        // Mock properties normally provided by GNOME Shell at runtime
        extensionInstance.path = '/home/user/.local/share/gnome-shell/extensions/dockerpulse';
        extensionInstance.uuid = 'dockerpulse@github.com';
    });

    afterEach(() => {
        if (extensionInstance) {
            try {
                extensionInstance.disable();
            } catch (e) {}
        }
    });

    test('should spawn the wrapper with correct arguments including parent pid and command', () => {
        extensionInstance.enable();
        
        // Let's retrieve the indicator
        const indicator = extensionInstance._indicator;
        
        // Triggers _onSettingsChanged and subsequently _startEventStream
        indicator._onSettingsChanged();

        expect(spawnedCwds).toContain('/path/to/my-project');
        expect(spawnedArgvs).toContainEqual([
            'python3',
            '/home/user/.local/share/gnome-shell/extensions/dockerpulse/parent_monitor_wrapper.py',
            '--parent-pid',
            '12345',
            'docker',
            'events',
            '--format',
            '{{json .}}',
            '--filter',
            'type=container'
        ]);
    });

    test('should dynamically calculate and display correct fractions of running containers relative to total', () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;

        indicator._projectPath = '/path/to/my-project';
        indicator._cachedStatus = 'yellow';
        indicator._cachedContainers = [
            { name: 'c1', state: 'running', health: 'healthy' },
            { name: 'c2', state: 'running', health: 'healthy' },
            { name: 'c3', state: 'exited' }
        ];

        indicator._updateUI();

        // c1 and c2 are active, c3 is exited, so total = 3, active = 2
        expect(indicator._statusLabel.text).toBe('🟡');
        expect(indicator._countLabel.text).toBe(' 2/3');
    });

    test('should degrade gracefully and parse anomalous or missing state data', () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;

        indicator._projectPath = '/path/to/my-project';
        indicator._cachedStatus = 'yellow';
        // Simulating a container with missing properties
        indicator._cachedContainers = [
            { name: 'good-container', state: 'running', health: 'healthy' },
            { state: 'running' }, // missing name/health
            null, // completely null item which might trigger errors
            { name: 'bad-container' } // missing state
        ];

        // Should execute without throwing any exceptions
        expect(() => {
            indicator._buildMenu();
        }).not.toThrow();

        // The good container and others that parsed successfully should be rendered
        expect(popupSubMenuItems.length).toBeGreaterThan(0);
        
        // Assert that the good container has correct stateEmoji and displays running status
        const goodItem = popupSubMenuItems.find(item => item.label_text.includes('good-container'));
        expect(goodItem).toBeDefined();
        expect(goodItem.label_text).toContain('🟢');
    });

    test('should display [inactive] label for stopped/inactive containers', () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;

        indicator._projectPath = '/path/to/my-project';
        indicator._cachedStatus = 'yellow';
        indicator._cachedContainers = [
            { name: 'stopped-container', state: 'exited', status: 'exited' }
        ];

        indicator._buildMenu();

        const stoppedItem = popupSubMenuItems.find(item => item.label_text.includes('stopped-container'));
        expect(stoppedItem).toBeDefined();
        expect(stoppedItem.label_text).toContain('🔴');
        expect(stoppedItem.label_text).toContain('[inactive]');
    });

    test('should attempt to spawn Ptyxis first with correct arguments', () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my-project';

        // Clear spawnedArgvs to track specifically this spawn
        spawnedArgvs = [];

        indicator._spawnTerminalCommand(['docker', 'exec', '-it', 'my-container', 'bash']);

        // Since spawnedArgvs tracks every Gio.Subprocess.new call, the first element should be Ptyxis
        expect(spawnedArgvs.length).toBeGreaterThan(0);
        expect(spawnedArgvs[0]).toEqual([
            'ptyxis',
            '--working-directory', '/path/to/my-project',
            '-e', 'docker exec -it my-container bash'
        ]);
    });

    test('should trigger exactly one consolidated notification when multiple containers fail and consolidation is enabled', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my-project';
        indicator._unhealthyContainers = new Set();

        globalThis.mockSettings['alert-style'] = 'consolidated';
        globalThis.notifications = [];

        globalThis.mockDockerComposePsOutput = JSON.stringify([
            { Name: 'web', State: 'running', Health: 'unhealthy' },
            { Name: 'db', State: 'running', Health: 'unhealthy' },
            { Name: 'redis', State: 'running', Health: 'unhealthy' }
        ]);

        await indicator._refreshState();

        expect(globalThis.notifications.length).toBe(1);
        expect(globalThis.notifications[0].title).toBe('DockerPulse Warning');
        expect(globalThis.notifications[0].msg).toContain('Multiple containers are unhealthy');
        expect(globalThis.notifications[0].msg).toContain('web');
        expect(globalThis.notifications[0].msg).toContain('db');
        expect(globalThis.notifications[0].msg).toContain('redis');
    });

    test('should trigger exactly one consolidated notification for a single container failure when consolidation is enabled', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my-project';
        indicator._unhealthyContainers = new Set();

        globalThis.mockSettings['alert-style'] = 'consolidated';
        globalThis.notifications = [];

        globalThis.mockDockerComposePsOutput = JSON.stringify([
            { Name: 'web', State: 'running', Health: 'unhealthy' }
        ]);

        await indicator._refreshState();

        expect(globalThis.notifications.length).toBe(1);
        expect(globalThis.notifications[0].msg).toBe('Container web is unhealthy!');
    });

    test('should trigger individual notifications for each container failure when alert style is individual', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my-project';
        indicator._unhealthyContainers = new Set();

        globalThis.mockSettings['alert-style'] = 'individual';
        globalThis.notifications = [];

        globalThis.mockDockerComposePsOutput = JSON.stringify([
            { Name: 'web', State: 'running', Health: 'unhealthy' },
            { Name: 'db', State: 'running', Health: 'unhealthy' }
        ]);

        await indicator._refreshState();

        expect(globalThis.notifications.length).toBe(2);
        expect(globalThis.notifications[0].msg).toBe('Container web is unhealthy!');
        expect(globalThis.notifications[1].msg).toBe('Container db is unhealthy!');
    });

    test('should prevent any status alerts when notifications are completely disabled (muted)', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my-project';
        indicator._unhealthyContainers = new Set();

        globalThis.mockSettings['alert-style'] = 'disabled';
        globalThis.notifications = [];

        globalThis.mockDockerComposePsOutput = JSON.stringify([
            { Name: 'web', State: 'running', Health: 'unhealthy' },
            { Name: 'db', State: 'running', Health: 'unhealthy' }
        ]);

        await indicator._refreshState();

        expect(globalThis.notifications.length).toBe(0);
    });

    test('should clean up all active timers and listeners on extension disable/unload to prevent memory leaks', () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;

        expect(indicator._pollTimerId).not.toBeNull();

        extensionInstance.disable();

        expect(extensionInstance._indicator).toBeNull();
        expect(indicator._pollTimerId || null).toBeNull();
        expect(indicator._reconnectTimerId || null).toBeNull();
        expect(indicator._debounceId || null).toBeNull();
        expect(indicator._eventProc || null).toBeNull();
    });
});
