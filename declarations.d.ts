declare namespace Gio {
    interface Subprocess {
        init(cancellable: any): void;
        force_exit(): void;
        wait_async(cancellable: any, callback: (source: any, res: any) => void): void;
        wait_finish(res: any): void;
    }
    enum SubprocessFlags {
        NONE
    }
}

declare module 'gi://Gio' {
    const Gio: any;
    export default Gio;
}
declare module 'gi://GLib' {
    const GLib: any;
    export default GLib;
}
declare module 'gi://St' {
    const St: any;
    export default St;
}
declare module 'gi://Shell' {
    const Shell: any;
    export default Shell;
}
declare module 'gi://Clutter' {
    const Clutter: any;
    export default Clutter;
}
declare module 'gi://Meta' {
    const Meta: any;
    export default Meta;
}
declare module 'resource:///org/gnome/shell/ui/panelMenu.js' {
    const panelMenu: any;
    export default panelMenu;
}
declare module 'resource:///org/gnome/shell/ui/popupMenu.js' {
    const popupMenu: any;
    export default popupMenu;
}
declare module 'resource:///org/gnome/shell/ui/main.js' {
    const main: any;
    export default main;
}
declare module 'resource:///org/gnome/shell/ui/extensionSystem.js' {
    const extensionSystem: any;
    export default extensionSystem;
}
declare module 'resource:///org/gnome/Shell/Extensions/js/misc/extensionUtils.js' {
    const extensionUtils: any;
    export default extensionUtils;
}
declare module 'gi://GObject' {
    const GObject: any;
    export default GObject;
}
