import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/shell/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export default class DockerPulsePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        let settings = null;
        try {
            settings = this.getSettings();
        } catch (e) {
            console.error('[DockerPulse] Failed to load settings:', e);
        }

        let page = new Adw.PreferencesPage();
        window.add(page);

        if (!settings) {
            let errorGroup = new Adw.PreferencesGroup({
                title: 'Configuration Error',
                description: 'The GSettings schemas for DockerPulse are missing or corrupted.',
            });
            page.add(errorGroup);

            let errorRow = new Adw.ActionRow({
                title: 'Schema Unavailable',
                subtitle: 'Please make sure you compiled schemas locally, or ran "make install" in the extension directory.',
            });
            errorGroup.add(errorRow);

            let helpLabel = new Gtk.Label({
                label: 'To resolve this, please run:\n  $ make install\nand restart GNOME Shell or log out and log back in.',
                use_markup: false,
                halign: Gtk.Align.START,
                wrap: true,
                margin_start: 12,
                margin_end: 12,
                margin_top: 12,
                margin_bottom: 12,
            });
            errorGroup.add(helpLabel);
            return;
        }

        let group = new Adw.PreferencesGroup({
            title: 'General Settings',
            description: 'Configure your monitored Docker Compose project',
        });
        page.add(group);

        let pathRow = new Adw.ActionRow({
            title: 'Docker Compose Project Path',
            subtitle: settings.get_string('project-path') || 'No path selected',
        });
        group.add(pathRow);

        let selectButton = new Gtk.Button({
            label: 'Select Folder',
            valign: Gtk.Align.CENTER,
        });
        pathRow.add_suffix(selectButton);

        selectButton.connect('clicked', () => {
            let dialog = new Gtk.FileDialog({
                title: 'Select Docker Compose Project Folder',
                select_multiple: false,
                initial_folder: null,
            });

            dialog.select_folder(window, null, (obj, res) => {
                try {
                    let folder = dialog.select_folder_finish(res);
                    if (folder) {
                        let path = folder.get_path();
                        settings.set_string('project-path', path);
                        pathRow.set_subtitle(path);
                    }
                } catch (e) {
                    console.error('[DockerPulse] Error selecting folder:', e);
                }
            });
        });

        let nameRow = new Adw.EntryRow({
            title: 'Monitored Project Name',
            text: settings.get_string('project-name') || '',
            placeholder_text: 'Falls back to directory name if empty',
        });
        group.add(nameRow);

        nameRow.connect('changed', () => {
            try {
                settings.set_string('project-name', nameRow.get_text().trim());
            } catch (e) {
                console.error('[DockerPulse] Error saving project-name:', e);
            }
        });

        let adj = new Gtk.Adjustment({
            value: settings.get_int('poll-interval') || 25,
            lower: 5,
            upper: 300,
            step_increment: 1,
            page_increment: 10,
        });

        let pollRow = new Adw.SpinRow({
            title: 'Polling Interval (seconds)',
            subtitle: 'How often to refresh container status',
            adjustment: adj,
            climb_rate: 1.0,
            digits: 0,
        });
        group.add(pollRow);

        pollRow.connect('changed', () => {
            try {
                settings.set_int('poll-interval', pollRow.get_value());
            } catch (e) {
                console.error('[DockerPulse] Error saving poll-interval:', e);
            }
        });

        let showCountRow = new Adw.SwitchRow({
            title: 'Show Container Count',
            subtitle: 'Display the number of running containers in the top status bar',
            active: settings.get_boolean('show-container-count'),
        });
        group.add(showCountRow);

        showCountRow.connect('notify::active', () => {
            try {
                settings.set_boolean('show-container-count', showCountRow.active);
            } catch (e) {
                console.error('[DockerPulse] Error saving show-container-count:', e);
            }
        });
    }
}
