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
                    if (this.argv.includes('fail-on-init')) {
                        throw new Error('Spawn failed');
                    }
                }

                wait_async(cancellable, callback) {
                    this._waitCallback = callback;
                }

                wait_finish(res) {
                    if (this.argv.includes('throw-on-finish')) {
                        throw new Error('Finish error');
                    }
                    return true;
                }

                force_exit() {
                    this.isKilled = true;
                    // Simulate async exit completion
                    if (this._waitCallback) {
                        const cb = this._waitCallback;
                        this._waitCallback = null;
                        // Execute callback in next tick to match async behavior
                        process.nextTick(() => {
                            cb(this, 'dummy-res');
                        });
                    }
                }

                // Helper to simulate normal process exit
                simulateExit() {
                    if (this._waitCallback) {
                        const cb = this._waitCallback;
                        this._waitCallback = null;
                        process.nextTick(() => {
                            cb(this, 'dummy-res');
                        });
                    }
                }
            },
            SubprocessFlags: {
                NONE: 0,
                STDOUT_PIPE: 1,
            }
        }
    };
}, { virtual: true });

// Import the module under test and Gio after mocking
const GioModule = await import('gi://Gio');
const Gio = GioModule.default;
const { ProcessRegistry } = await import('./processRegistry.js');

describe('ProcessRegistry', () => {
    let registry;

    beforeEach(() => {
        registry = new ProcessRegistry();
    });

    test('should register a subprocess on spawn', () => {
        const proc = registry.spawn(['echo', 'hello']);
        expect(proc).toBeInstanceOf(Gio.Subprocess);
        expect(proc.initCalled).toBe(true);
        expect(registry.activeCount).toBe(1);
        expect(registry.isTracking(proc)).toBe(true);
    });

    test('should throw an error and not register if spawn/init fails', () => {
        expect(() => {
            registry.spawn(['fail-on-init']);
        }).toThrow('Spawn failed');
        expect(registry.activeCount).toBe(0);
    });

    test('should throw error for invalid arguments', () => {
        expect(() => registry.spawn(null)).toThrow();
        expect(() => registry.spawn([])).toThrow();
        expect(() => registry.spawn('not-an-array')).toThrow();
    });

    test('should remove process from registry when process exits normally', async () => {
        const proc = registry.spawn(['sleep', '1']);
        expect(registry.activeCount).toBe(1);

        proc.simulateExit();

        // Wait for nextTick to allow callback to execute
        await new Promise(resolve => process.nextTick(resolve));

        expect(registry.activeCount).toBe(0);
        expect(registry.isTracking(proc)).toBe(false);
    });

    test('should handle wait_finish error gracefully and still remove process from registry', async () => {
        const proc = registry.spawn(['throw-on-finish']);
        expect(registry.activeCount).toBe(1);

        // Spy on console.warn to verify graceful error log
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        proc.simulateExit();

        await new Promise(resolve => process.nextTick(resolve));

        expect(registry.activeCount).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[ProcessRegistry] Error or abnormal exit for process: Finish error')
        );

        warnSpy.mockRestore();
    });

    test('should forcefully terminate and clear all processes on cleanup', async () => {
        const proc1 = registry.spawn(['sleep', '1']);
        const proc2 = registry.spawn(['sleep', '2']);
        expect(registry.activeCount).toBe(2);

        registry.cleanup();

        expect(proc1.isKilled).toBe(true);
        expect(proc2.isKilled).toBe(true);
        expect(registry.activeCount).toBe(0);

        // Verify that async exit callbacks still execute gracefully on cleanup
        await new Promise(resolve => process.nextTick(resolve));
    });

    test('should handle empty registry cleanup safely', () => {
        expect(() => registry.cleanup()).not.toThrow();
        expect(registry.activeCount).toBe(0);
    });
});
