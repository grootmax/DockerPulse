import { jest } from '@jest/globals';

global.mockClipboardText = {};
global.mockMessageTraySources = [];
global.mockNotifications = [];
global.mockTerminalFail = false;
global.mockSettings = {
    'terminal-emulator': 'auto',
    'project-path': '/path/to/my-project',
    'poll-interval': 25,
    'show-container-count': true,
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
            ClipboardType: {
                CLIPBOARD: 0,
                PRIMARY: 1,
            },
            Clipboard: {
                get_default: () => {
                    return {
                        set_text: (type, text) => {
                            global.mockClipboardText[type] = text;
                        }
                    };
                }
            }
        }
    };
}, { virtual: true });

// Virtual mock for GNOME Shell UI modules
jest.unstable_mockModule('resource:///org/gnome/shell/ui/main.js', () => {
    return {
        panel: {
            addToStatusArea: () => {},
        },
        messageTray: {
            add: (source) => {
                global.mockMessageTraySources.push(source);
            }
        }
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/ui/messageTray.js', () => {
    return {
        Source: class {
            constructor(name, icon) {
                this.name = name;
                this.icon = icon;
                global.mockMessageTraySources.push(this);
            }
            showNotification(notification) {
                this.shownNotification = notification;
                global.mockNotifications.push(notification);
            }
        },
        Notification: class {
            constructor(source, title, body) {
                this.source = source;
                this.title = title;
                this.body = body;
                this.transient = false;
                this.actions = [];
            }
            setTransient(val) { this.transient = val; }
            addAction(label, callback) {
                this.actions.push({ label, callback });
            }
            destroy() {
                global.mockNotifications = global.mockNotifications.filter(n => n !== this);
            }
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
        return [true, '[]', ''];
    }
    wait_async(cancellable, callback) {
        process.nextTick(() => {
            callback(this, 'dummy-res');
        });
    }
    wait_finish(res) {
        return true;
    }
}

jest.unstable_mockModule('gi://Gio', () => {
    return {
        default: {
            Subprocess: class {
                constructor(config) {
                    this.argv = config ? config.argv : [];
                    this.flags = config ? config.flags : 0;
                }
                init() {}
                wait_async(cancellable, callback) {
                    process.nextTick(() => {
                        callback(this, 'dummy-res');
                    });
                }
                wait_finish(res) {
                    return true;
                }
                static new(argv, flags) {
                    if (global.mockTerminalFail) {
                        throw new Error('Terminal spawn failed');
                    }
                    return new MockSubprocess(argv);
                }
            },
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
                    get_string: (key) => global.mockSettings[key] || '/path/to/my-project',
                    get_int: (key) => global.mockSettings[key] || 25,
                    get_boolean: (key) => global.mockSettings[key] !== undefined ? global.mockSettings[key] : true,
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
        messageTray: {
            add: (source) => {
                global.mockMessageTraySources.push(source);
            }
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
        global.mockClipboardText = {};
        global.mockMessageTraySources = [];
        global.mockNotifications = [];
        global.mockTerminalFail = false;
        global.mockSettings = {
            'terminal-emulator': 'auto',
            'project-path': '/path/to/my-project',
            'poll-interval': 25,
            'show-container-count': true,
        };
        spawnedArgvs = [];
        spawnedCwds = [];
        popupSubMenuItems = [];
        popupMenuItems = [];
        extensionInstance = new DockerPulseExtension();
        // Mock properties normally provided by GNOME Shell at runtime
        extensionInstance.path = '/home/user/.local/share/gnome-shell/extensions/dockerpulse';
        extensionInstance.uuid = 'dockerpulse@github.com';
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

    test('should construct safe array-based terminal commands and preserve spaces', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my-project';

        const GioModule = await import('gi://Gio');
        const originalNew = GioModule.default.Subprocess.new;
        let capturedArgv = null;
        GioModule.default.Subprocess.new = (argv, flags) => {
            capturedArgv = argv;
            return { init: () => {} };
        };

        try {
            indicator._spawnTerminalCommand(['docker', 'compose', 'exec', 'web', 'echo hello world']);
            
            expect(capturedArgv).toEqual([
                'ptyxis',
                '--working-directory',
                '/path/to/my-project',
                '--',
                'docker',
                'compose',
                'exec',
                'web',
                'echo hello world'
            ]);
        } finally {
            GioModule.default.Subprocess.new = originalNew;
        }
    });

    test('should respect user terminal preferences and immediately update used application', async () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my-project';

        global.mockSettings['terminal-emulator'] = 'gnome-terminal';

        const GioModule = await import('gi://Gio');
        const originalNew = GioModule.default.Subprocess.new;
        let capturedArgv = null;
        GioModule.default.Subprocess.new = (argv, flags) => {
            capturedArgv = argv;
            return { init: () => {} };
        };

        try {
            indicator._spawnTerminalCommand(['docker', 'compose', 'logs']);
            
            expect(capturedArgv).toEqual([
                'gnome-terminal',
                '--working-directory=/path/to/my-project',
                '--',
                'docker',
                'compose',
                'logs'
            ]);
        } finally {
            GioModule.default.Subprocess.new = originalNew;
        }
    });

    test('should fallback to copying command to clipboard and triggering interactive notification when launching fails', () => {
        extensionInstance.enable();
        const indicator = extensionInstance._indicator;
        indicator._projectPath = '/path/to/my project';

        global.mockTerminalFail = true;

        indicator._spawnTerminalCommand(['docker', 'compose', 'exec', 'web', 'echo hello']);

        expect(global.mockClipboardText[0]).toBe("cd '/path/to/my project' && docker compose exec web 'echo hello'");
        expect(global.mockClipboardText[1]).toBe("cd '/path/to/my project' && docker compose exec web 'echo hello'");

        expect(global.mockMessageTraySources.length).toBeGreaterThan(0);
        expect(global.mockNotifications.length).toBeGreaterThan(0);
        const notification = global.mockNotifications[0];
        expect(notification.title).toBe("Terminal Launch Failed");
        expect(notification.body).toContain("copied to your clipboard");
    });
});
