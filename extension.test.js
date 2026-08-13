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
