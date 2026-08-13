UUID = dockerpulse@github.com
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all compile install clean

all: compile

compile:
	glib-compile-schemas schemas/

install: compile
	mkdir -p $(EXT_DIR)
	cp -r extension.js prefs.js metadata.json stylesheet.css schemas/ $(EXT_DIR)/
	glib-compile-schemas $(EXT_DIR)/schemas/
	@echo "Extension installed successfully to $(EXT_DIR)."

clean:
	rm -f schemas/gschemas.compiled
	rm -rf $(EXT_DIR)
