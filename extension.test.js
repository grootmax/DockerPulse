import { jest } from '@jest/globals';

let spawnedArgvs = [];
let spawnedCwds = [];

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
    force_exit() {}
}

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
                add_child() {}
            },
            Label: class {
                constructor() {}
                set_text() {}
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

// Virtual mock for gi://Gio module to run in Node/Jest environment
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
                    this.argv = config ? config.argv : [];
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
                force_exit() {}
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

// Virtual mock for GNOME Shell UI modules
jest.unstable_mockModule('resource:///org/gnome/shell/ui/main.js', () => {
    return {
        panel: {
            addToStatusArea: () => {},
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

jest.unstable_mockModule('resource:///org/gnome/shell/extensions/extension.js', () => {
    return {
        Extension: class {
            constructor() {}
            getSettings() {
                return {
                    connect: () => 1,
                    get_string: (key) => {
                        if (key === 'project-path') return '/path/to/my-project';
                        if (key === 'project-name') return 'my-project';
                        return '';
                    },
                    get_int: () => 25,
                    get_boolean: () => true,
                };
            }
        },
        gettext: (text) => text,
    };
}, { virtual: true });

// Import extension.js
const { default: DockerPulseExtension } = await import('./extension.js');

describe('DockerPulseExtension & Wrapper Spawning', () => {
    let extensionInstance;

    beforeEach(() => {
        spawnedArgvs = [];
        spawnedCwds = [];
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
});
