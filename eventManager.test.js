import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Virtual mock for gi://GLib module
jest.unstable_mockModule('gi://GLib', () => {
    return {
        default: {
            timeout_add_seconds: (priority, interval, callback) => {
                return 101;
            },
            timeout_add: (priority, interval, callback) => {
                if (typeof callback === 'function') {
                    callback();
                }
                return 102;
            },
            source_remove: jest.fn(),
            get_pid: () => 99999,
            PRIORITY_DEFAULT: 0,
            SOURCE_REMOVE: false,
            SOURCE_CONTINUE: true,
        }
    };
}, { virtual: true });

let spawnedArgvs = [];
let spawnedCwds = [];
let registeredProcesses = [];

class MockProcess {
    constructor(argv) {
        this.argv = argv;
        this.exited = false;
    }
    get_stdout_pipe() {
        return {};
    }
    force_exit() {
        this.exited = true;
    }
}

class MockRegistry {
    constructor() {
        this.processes = [];
    }
    register(proc) {
        this.processes.push(proc);
        registeredProcesses.push(proc);
        return proc;
    }
}

jest.unstable_mockModule('gi://Gio', () => {
    return {
        default: {
            SubprocessLauncher: class {
                constructor() {
                    this.env = [];
                }
                set_cwd(cwd) {
                    spawnedCwds.push(cwd);
                }
                set_environ(env) {
                    this.env = env;
                }
                spawnv(argv) {
                    spawnedArgvs.push(argv);
                    return new MockProcess(argv);
                }
            },
            SubprocessFlags: {
                NONE: 0,
                STDOUT_PIPE: 1,
                STDERR_PIPE: 2,
            },
            Cancellable: class {
                constructor() {
                    this.cancelled = false;
                }
                is_cancelled() {
                    return this.cancelled;
                }
                cancel() {
                    this.cancelled = true;
                }
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

const { EventManager } = await import('./eventManager.js');

describe('EventManager Subsystem', () => {
    let eventManager;

    beforeEach(() => {
        spawnedArgvs = [];
        spawnedCwds = [];
        registeredProcesses = [];
        eventManager = new EventManager();
    });

    afterEach(() => {
        if (eventManager) {
            eventManager.destroy();
        }
    });

    test('should manage callback listeners correctly', () => {
        const callback1 = jest.fn();
        const callback2 = jest.fn();

        const unsubscribe1 = eventManager.addListener(callback1);
        eventManager.addListener(callback2);

        expect(eventManager._listeners.size).toBe(2);

        eventManager.triggerDebouncedRefresh();
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(1);

        unsubscribe1();
        expect(eventManager._listeners.size).toBe(1);

        eventManager.triggerDebouncedRefresh();
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledTimes(2);
    });

    test('should start event stream with project-scoped container and compose filters', () => {
        const registry = new MockRegistry();

        eventManager.start({
            projectPath: '/path/to/my-project',
            projectName: 'my-project',
            extensionPath: '/ext/path',
            registry: registry,
            env: ['DOCKER_HOST=unix:///var/run/docker.sock']
        });

        expect(spawnedCwds).toContain('/path/to/my-project');
        expect(spawnedArgvs).toContainEqual([
            'python3',
            '/ext/path/parent_monitor_wrapper.py',
            '--parent-pid',
            '99999',
            'docker',
            'events',
            '--filter',
            'type=container',
            '--filter',
            'label=com.docker.compose.project=my-project'
        ]);

        expect(registeredProcesses.length).toBe(1);
        expect(eventManager._eventProc).toBeDefined();
    });

    test('should stop event stream cleanly and release resources', () => {
        const registry = new MockRegistry();

        eventManager.start({
            projectPath: '/path/to/my-project',
            projectName: 'my-project',
            extensionPath: '/ext/path',
            registry: registry
        });

        const proc = eventManager._eventProc;
        const spyExit = jest.spyOn(proc, 'force_exit');
        const spyCancel = jest.spyOn(eventManager._eventCancellable, 'cancel');

        eventManager.stop();

        expect(spyExit).toHaveBeenCalled();
        expect(spyCancel).toHaveBeenCalled();
        expect(eventManager._eventProc).toBeNull();
        expect(eventManager._eventCancellable).toBeNull();
    });

    test('should handle exponential backoff reconnection on stream closure', () => {
        eventManager.start({
            projectPath: '/path/to/my-project',
            projectName: 'my-project'
        });

        eventManager._handleEventStreamClosed();
        expect(eventManager._reconnectDelay).toBe(5);

        eventManager._handleEventStreamClosed();
        expect(eventManager._reconnectDelay).toBe(10);

        eventManager._handleEventStreamClosed();
        expect(eventManager._reconnectDelay).toBe(20);
    });
});
