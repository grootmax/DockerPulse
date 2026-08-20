import { jest, afterEach, beforeEach, describe, expect, test } from '@jest/globals';

let sentNotifications = [];

globalThis.imports = {
    ui: {
        main: {
            notify: (title, body) => {
                sentNotifications.push({ title, body });
            }
        }
    }
};

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
            timeout_add: (priority, interval, callback) => {
                if (typeof callback === 'function') {
                    callback();
                }
                return 2;
            },
            source_remove: () => {},
            get_pid: () => 12345,
            PRIORITY_DEFAULT: 0,
            SOURCE_REMOVE: false,
            SOURCE_CONTINUE: true,
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
        notify: (title, body) => {
            sentNotifications.push({ title, body });
        }
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
let mockSubprocessStdout = '[]';

class MockSubprocess {
    constructor(argv) {
        this.argv = argv;
        this.stdout = mockSubprocessStdout;
    }
    force_exit() {}
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
        return [true, this.stdout, ''];
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
                    get_string: (key) => key === 'project-path' ? '/path/to/my-project' : '',
                    get_int: () => 25,
                    get_boolean: () => true,
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
        notify: (title, body) => {
            sentNotifications.push({ title, body });
        }
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
        sentNotifications = [];
        mockSubprocessStdout = '[]';
        extensionInstance = new DockerPulseExtension();
        // Mock properties normally provided by GNOME Shell at runtime
        extensionInstance.path = '/home/user/.local/share/gnome-shell/extensions/dockerpulse';
        extensionInstance.uuid = 'dockerpulse@github.com';
    });

    afterEach(() => {
        if (extensionInstance) {
            extensionInstance.disable();
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

    test('should consolidate multiple unhealthy container alerts into a single notification', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;

        // Flush background runs from construction
        for (let i = 0; i < 20; i++) await new Promise(resolve => process.nextTick(resolve));
        sentNotifications = [];

        indicator._projectPath = '/path/to/my-project';
        indicator._unhealthyContainers = new Set(); // No containers are currently unhealthy

        // Simulate 3 containers becoming unhealthy simultaneously
        mockSubprocessStdout = JSON.stringify([
            { Name: 'service-web', State: 'running', Health: 'unhealthy' },
            { Name: 'service-db', State: 'running', Health: 'unhealthy' },
            { Name: 'service-redis', State: 'running', Health: 'unhealthy' }
        ]);

        // Await the asynchronous state refresh
        await indicator._refreshState();

        // Check notifications sent
        expect(sentNotifications.length).toBe(1);
        expect(sentNotifications[0].title).toBe('DockerPulse Warning');
        expect(sentNotifications[0].body).toBe('3 containers are unhealthy: service-web, service-db, service-redis');
    });

    test('should send a singular notification if only one container becomes unhealthy', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;

        // Flush background runs from construction
        for (let i = 0; i < 20; i++) await new Promise(resolve => process.nextTick(resolve));
        sentNotifications = [];

        indicator._projectPath = '/path/to/my-project';
        indicator._unhealthyContainers = new Set();

        mockSubprocessStdout = JSON.stringify([
            { Name: 'service-web', State: 'running', Health: 'unhealthy' },
            { Name: 'service-db', State: 'running', Health: 'healthy' }
        ]);

        await indicator._refreshState();

        expect(sentNotifications.length).toBe(1);
        expect(sentNotifications[0].title).toBe('DockerPulse Warning');
        expect(sentNotifications[0].body).toBe('1 container is unhealthy: service-web');
    });

    test('should not send notifications for containers that were already unhealthy', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;

        // Flush background runs from construction
        for (let i = 0; i < 20; i++) await new Promise(resolve => process.nextTick(resolve));
        sentNotifications = [];

        indicator._projectPath = '/path/to/my-project';
        indicator._unhealthyContainers = new Set(['service-web']); // Already recorded as unhealthy

        mockSubprocessStdout = JSON.stringify([
            { Name: 'service-web', State: 'running', Health: 'unhealthy' },
            { Name: 'service-db', State: 'running', Health: 'unhealthy' } // newly unhealthy
        ]);

        await indicator._refreshState();

        // Only service-db is newly unhealthy, so we expect a singular notification for service-db
        expect(sentNotifications.length).toBe(1);
        expect(sentNotifications[0].body).toBe('1 container is unhealthy: service-db');
    });

    test('should resolve active Docker CLI context host before falling back to local socket discovery', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        mockSubprocessStdout = '';

        indicator._discoverDockerContext = jest.fn().mockResolvedValue({
            host: 'ssh://remoteuser@remotehost',
            certPath: '',
            tlsVerify: ''
        });

        await indicator._discoverAndValidateEnvironment();

        expect(indicator._resolvedHost).toBe('ssh://remoteuser@remotehost');
    });

    test('should fallback to local socket auto-discovery when no active remote Docker CLI context is configured', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        mockSubprocessStdout = '';

        indicator._discoverDockerContext = jest.fn().mockResolvedValue(null);
        indicator._checkFileExists = jest.fn().mockImplementation((path) => {
            return path.includes('docker.sock');
        });

        await indicator._discoverAndValidateEnvironment();

        expect(indicator._resolvedHost).toContain('unix://');
    });

    test('should discover active SSH agent socket path and forward SSH_AUTH_SOCK to subprocess environment', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        mockSubprocessStdout = '';

        indicator._discoverSshAuthSock = jest.fn().mockReturnValue('/run/user/1000/keyring/ssh');
        indicator._discoverDockerContext = jest.fn().mockResolvedValue({
            host: 'ssh://user@remote',
            certPath: '',
            tlsVerify: ''
        });

        await indicator._discoverAndValidateEnvironment();

        expect(indicator._resolvedSshAuthSock).toBe('/run/user/1000/keyring/ssh');
        const env = indicator._getEnvWithResolved();
        expect(env).toContain('SSH_AUTH_SOCK=/run/user/1000/keyring/ssh');
        expect(env).toContain('DOCKER_HOST=ssh://user@remote');
    });

    test('should persist host parameters and diagnostic keys in settings without errors', async () => {
        const mockSetString = jest.fn();
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        mockSubprocessStdout = '';
        indicator._settings = {
            set_string: mockSetString,
            get_string: () => '',
            get_int: () => 25,
            get_boolean: () => false,
            connect: () => 1,
            disconnect: () => {}
        };

        indicator._discoverDockerContext = jest.fn().mockResolvedValue({
            host: 'ssh://remoteuser@remotehost',
            certPath: '/path/to/certs',
            tlsVerify: '1'
        });

        await indicator._discoverAndValidateEnvironment();

        expect(mockSetString).toHaveBeenCalledWith('diagnostic-status', expect.any(String));
        expect(mockSetString).toHaveBeenCalledWith('diagnostic-resolved-host', 'ssh://remoteuser@remotehost');
    });
});
