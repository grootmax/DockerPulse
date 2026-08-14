import { jest } from '@jest/globals';

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
            }
        }
    };
}, { virtual: true });

// Virtual mock for extension base class
jest.unstable_mockModule('resource:///org/gnome/shell/extensions/extension.js', () => {
    return {
        Extension: class {
            constructor() {}
            enable() {}
            disable() {}
        },
        gettext: (str) => str
    };
}, { virtual: true });

// Virtual mock for gi://GObject
jest.unstable_mockModule('gi://GObject', () => {
    return {
        default: {
            registerClass: (klass) => klass,
        }
    };
}, { virtual: true });

// Virtual mock for gi://GLib
jest.unstable_mockModule('gi://GLib', () => {
    return {
        default: {
            source_remove: jest.fn(),
            timeout_add_seconds: jest.fn().mockReturnValue(123),
            get_pid: jest.fn().mockReturnValue({ toString: () => '12345' }),
            timeout_add: jest.fn().mockReturnValue(456),
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
jest.unstable_mockModule('gi://St', () => {
    return {
        default: {
            BoxLayout: class {
                constructor() {}
                add_child() {}
            },
            Label: class {
                constructor() {}
                set_text() {}
            }
        }
    };
}, { virtual: true });

// Virtual mock for resource:///org/gnome/shell/ui/main.js
jest.unstable_mockModule('resource:///org/gnome/shell/ui/main.js', () => {
    return {
        panel: {
            addToStatusArea: jest.fn(),
        }
    };
}, { virtual: true });

// Virtual mock for resource:///org/gnome/shell/ui/panelMenu.js
jest.unstable_mockModule('resource:///org/gnome/shell/ui/panelMenu.js', () => {
    return {
        Button: class {
            constructor() {
                this.menu = {
                    connect: jest.fn(),
                    removeAll: jest.fn(),
                    addMenuItem: jest.fn(),
                };
            }
            _init() {}
            destroy() {}
        }
    };
}, { virtual: true });

// Virtual mock for resource:///org/gnome/shell/ui/popupMenu.js
jest.unstable_mockModule('resource:///org/gnome/shell/ui/popupMenu.js', () => {
    return {
        PopupMenuItem: class {
            constructor() {
                this.label = {
                    add_style_class_name: jest.fn(),
                };
            }
            connect() {}
        },
        PopupSeparatorMenuItem: class {},
        PopupSubMenuMenuItem: class {
            constructor() {
                this.menu = {
                    addMenuItem: jest.fn(),
                };
            }
        }
    };
}, { virtual: true });

// Import the extension under test after mocking dependencies
const { default: DockerPulseExtension } = await import('./extension.js');

describe('DockerPulseExtension', () => {
    let extension;
    let logSpy;
    let errorSpy;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        extension = new DockerPulseExtension();
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    test('should instantiate registry and spawn docker events on enable', () => {
        extension.enable();

        expect(extension._registry).toBeDefined();
        expect(extension._registry.activeCount).toBe(1);

        const activeProc = extension._registry.activeProcesses[0];
        expect(activeProc.argv).toEqual(['docker', 'events', '--format', '{{json .}}']);
        expect(activeProc.initCalled).toBe(true);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Docker events listener spawned and registered.'));
    });

    test('should clean up and nullify registry on disable', () => {
        extension.enable();
        expect(extension._registry.activeCount).toBe(1);
        const activeProc = extension._registry.activeProcesses[0];

        extension.disable();

        expect(activeProc.isKilled).toBe(true);
        expect(extension._registry).toBeNull();
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Cleaned up registry. Terminated 1 background processes.'));
    });

    test('should handle disable when already disabled or not enabled yet', () => {
        expect(() => {
            extension.disable();
        }).not.toThrow();
        expect(extension._registry).toBeUndefined();
    });
});
