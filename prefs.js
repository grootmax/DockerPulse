import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/shell/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export default class DockerPulsePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        let settings = this.getSettings();

        let page = new Adw.PreferencesPage();
        window.add(page);

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
    }
}
