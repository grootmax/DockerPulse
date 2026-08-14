import { jest } from '@jest/globals';

// Virtual mock for gi://GObject
jest.unstable_mockModule('gi://GObject', () => {
    return {
        default: {
            registerClass: (meta, cls) => cls || meta,
        }
    };
}, { virtual: true });

// Virtual mock for gi://GLib
const timeout_add_seconds_mock = jest.fn(() => 1);
jest.unstable_mockModule('gi://GLib', () => {
    return {
        default: {
            timeout_add_seconds: timeout_add_seconds_mock,
            timeout_add: jest.fn(() => 2),
            source_remove: jest.fn(),
            get_pid: () => ({ toString: () => '123' }),
            get_user_config_dir: () => '/app/tmp',
            build_filenamev: (arr) => arr.join('/'),
            file_test: () => false,
            PRIORITY_DEFAULT: 0,
            SOURCE_CONTINUE: true,
            SOURCE_REMOVE: false,
        }
    };
}, { virtual: true });

// Virtual mock for gi://Clutter
jest.unstable_mockModule('gi://Clutter', () => {
    return {
        default: {
            ActorAlign: {
                CENTER: 1,
            }
        }
    };
}, { virtual: true });

// Virtual mock for gi://St
class MockLabel {
    constructor(config) {
        this.text = (config && config.text) || '';
        this.visible = true;
    }
    set_text(t) {
        this.text = t;
    }
}
jest.unstable_mockModule('gi://St', () => {
    return {
        default: {
            BoxLayout: class {
                constructor() {}
                add_child() {}
            },
            Label: MockLabel,
        }
    };
}, { virtual: true });

// Virtual mock for gi://Gio module to run in Node/Jest environment
jest.unstable_mockModule('gi://Gio', () => {
    return {
        default: {
            Subprocess: class {
                constructor(config) {
                    this.argv = config.argv;
                    this.flags = config.flags;
                    this._waitCallback = null;
                    this.isKilled = false;
                    this.initCalled = false;
                }

                init(cancellable) {
                    this.initCalled = true;
                }

                wait_async(cancellable, callback) {
                    this._waitCallback = callback;
                }

                wait_finish(res) {
                    return true;
                }

                force_exit() {
                    this.isKilled = true;
                }
            },
            SubprocessFlags: {
                NONE: 0,
                STDOUT_PIPE: 1,
                STDERR_PIPE: 2,
            },
            SubprocessLauncher: class {
                constructor() {}
                set_cwd() {}
                spawnv() {
                    return {
                        get_stdout_pipe: () => ({}),
                        force_exit: () => {},
                    };
                }
            },
            DataInputStream: class {
                constructor() {}
                read_line_async() {}
            },
        }
    };
}, { virtual: true });

// Settings Mock Map
const settingsStore = new Map();

// Virtual mock for extension base class
jest.unstable_mockModule('resource:///org/gnome/shell/extensions/extension.js', () => {
    return {
        Extension: class {
            constructor() {
                this.uuid = 'dockerpulse@github.com';
                this.path = '/app';
            }
            enable() {}
            disable() {}
            getSettings() {
                return {
                    connect: jest.fn(() => 99),
                    disconnect: jest.fn(),
                    get_string: (key) => settingsStore.get(key) || '',
                    get_int: (key) => settingsStore.get(key) !== undefined ? settingsStore.get(key) : 25,
                    get_boolean: (key) => settingsStore.get(key) !== undefined ? settingsStore.get(key) : true,
                    set_string: (key, val) => settingsStore.set(key, val),
                    set_int: (key, val) => settingsStore.set(key, val),
                    set_boolean: (key, val) => settingsStore.set(key, val),
                };
            }
        },
        gettext: (s) => s,
    };
}, { virtual: true });

// Mock shell ui elements
jest.unstable_mockModule('resource:///org/gnome/shell/ui/main.js', () => {
    return {
        panel: {
            addToStatusArea: jest.fn(),
        }
    };
}, { virtual: true });

jest.unstable_mockModule('resource:///org/gnome/shell/ui/panelMenu.js', () => {
    return {
        Button: class {
            constructor(...args) {
                this.menu = {
                    connect: jest.fn(),
                    removeAll: jest.fn(),
                    addMenuItem: jest.fn(),
                    isOpen: false,
                };
                if (this._init) {
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
                this.label = { style: '', add_style_class_name: jest.fn() };
            }
            connect() {}
        },
        PopupSeparatorMenuItem: class {},
        PopupSubMenuMenuItem: class {
            constructor() {
                this.menu = { addMenuItem: jest.fn() };
            }
        },
    };
}, { virtual: true });

// Import the extension under test after mocking dependencies
const { default: DockerPulseExtension } = await import('./extension.js');

describe('DockerPulseExtension', () => {
    let extension;
    let logSpy;
    let errorSpy;

    beforeEach(() => {
        settingsStore.clear();
        timeout_add_seconds_mock.mockClear();
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        extension = new DockerPulseExtension();
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    test('should instantiate indicator on enable', () => {
        extension.enable();

        expect(extension._indicator).toBeDefined();
    });

    test('should clean up and nullify indicator on disable', () => {
        extension.enable();
        expect(extension._indicator).toBeDefined();

        extension.disable();

        expect(extension._indicator).toBeNull();
    });

    test('should handle disable when already disabled or not enabled yet', () => {
        expect(() => {
            extension.disable();
        }).not.toThrow();
        expect(extension._indicator).toBeUndefined();
    });

    test('should respect show-container-count boolean preference', () => {
        // Default is true
        extension.enable();
        expect(extension._indicator._showContainerCount).toBe(true);
        expect(extension._indicator._countLabel.visible).toBe(true);

        // Turn off
        settingsStore.set('show-container-count', false);
        extension._indicator._onSettingsChanged();
        expect(extension._indicator._showContainerCount).toBe(false);
        expect(extension._indicator._countLabel.visible).toBe(false);

        // Turn back on
        settingsStore.set('show-container-count', true);
        extension._indicator._onSettingsChanged();
        expect(extension._indicator._showContainerCount).toBe(true);
        expect(extension._indicator._countLabel.visible).toBe(true);
    });

    test('should reschedule poll timer immediately on poll-interval changes', () => {
        // Enable with default (25 seconds)
        extension.enable();
        expect(timeout_add_seconds_mock).toHaveBeenCalledWith(expect.anything(), 25, expect.any(Function));

        // Change to 15 seconds
        settingsStore.set('poll-interval', 15);
        extension._indicator._onSettingsChanged();
        expect(timeout_add_seconds_mock).toHaveBeenLastCalledWith(expect.anything(), 15, expect.any(Function));

        // Change to 300 seconds
        settingsStore.set('poll-interval', 300);
        extension._indicator._onSettingsChanged();
        expect(timeout_add_seconds_mock).toHaveBeenLastCalledWith(expect.anything(), 300, expect.any(Function));
    });
});
