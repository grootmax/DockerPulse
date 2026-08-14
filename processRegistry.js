import Gio from 'gi://Gio';

export class ProcessRegistry {
    constructor() {
        this._activeProcesses = new Set();
    }

    /**
     * Spawns a new Gio.Subprocess, registers it, and initiates asynchronous reaping.
     * @param {string[]} argv The command line arguments
     * @param {Gio.SubprocessFlags} [flags] Optional process flags
     * @returns {Gio.Subprocess} The spawned subprocess
     */
    spawn(argv, flags = Gio.SubprocessFlags.NONE) {
        if (!argv || !Array.isArray(argv) || argv.length === 0) {
            throw new Error('Arguments array must be a non-empty array of strings');
        }

        const proc = new Gio.Subprocess({
            argv: argv,
            flags: flags,
        });
        
        // This actually launches the subprocess and can throw if spawning fails
        proc.init(null);
        
        this.register(proc);
        return proc;
    }

    /**
     * Registers an already instantiated/initialized Gio.Subprocess and reaps it asynchronously when it exits.
     * @param {Gio.Subprocess} proc The subprocess to track
     */
    register(proc) {
        if (!proc) {
            return;
        }

        this._activeProcesses.add(proc);

        // Asynchronously wait for the process to exit to prevent defunct (zombie) process generation.
        // We use wait_async which runs on the main loop without blocking UI.
        proc.wait_async(null, (source_object, res) => {
            try {
                // wait_finish reaps the process exit status from the OS process table.
                source_object.wait_finish(res);
            } catch (e) {
                // Handle abnormal exit or other wait errors gracefully
                console.warn(`[ProcessRegistry] Error or abnormal exit for process: ${e.message}`);
            } finally {
                // Ensure it is removed from our active tracking registry
                this._activeProcesses.delete(source_object);
            }
        });
    }

    /**
     * Forcefully terminates all currently tracked processes and reaps them asynchronously.
     */
    cleanup() {
        if (this._activeProcesses.size === 0) {
            return;
        }

        // Create a copy of the processes set to safely iterate and force termination
        const processesToTerminate = Array.from(this._activeProcesses);
        
        for (const proc of processesToTerminate) {
            try {
                // Sends SIGKILL (or equivalent) to forcefully exit the subprocess immediately
                proc.force_exit();
            } catch (e) {
                console.error(`[ProcessRegistry] Failed to forcefully terminate process: ${e.message}`);
            }
        }

        // We clear our tracking registry. The wait_async callback will still trigger and safely complete wait_finish.
        this._activeProcesses.clear();
    }

    /**
     * Checks if a subprocess is currently tracked.
     * @param {Gio.Subprocess} proc 
     * @returns {boolean}
     */
    isTracking(proc) {
        return this._activeProcesses.has(proc);
    }

    /**
     * Returns the list of currently active/tracked processes.
     * @returns {Gio.Subprocess[]}
     */
    get activeProcesses() {
        return Array.from(this._activeProcesses);
    }

    /**
     * Returns the count of currently active/tracked processes.
     * @returns {number}
     */
    get activeCount() {
        return this._activeProcesses.size;
    }
}
