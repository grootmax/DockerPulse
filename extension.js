import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { ProcessRegistry } from './processRegistry.js';

export default class DockerPulseExtension extends Extension {
    enable() {
        console.log('[DockerPulse] Enabling extension...');
        this._registry = new ProcessRegistry();

        try {
            console.log('[DockerPulse] Spawning Docker events listener...');
            // Requirement 1: Spawn background listener for Docker events and register it in the central registry
            this._registry.spawn(['docker', 'events', '--format', '{{json .}}']);
            console.log('[DockerPulse] Docker events listener spawned and registered.');
        } catch (e) {
            console.error(`[DockerPulse] Failed to spawn Docker events listener: ${e.message}`);
        }
    }

    disable() {
        console.log('[DockerPulse] Disabling extension...');
        
        // Requirement 2: Intercept the GNOME Shell extension disable event to trigger the cleanup sequence
        // Requirement 3 & 4: Forcefully terminate and asynchronously reap all tracked processes during deactivation
        if (this._registry) {
            const count = this._registry.activeCount;
            this._registry.cleanup();
            this._registry = null;
            console.log(`[DockerPulse] Cleaned up registry. Terminated ${count} background processes.`);
        }
    }
}
