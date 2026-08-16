UUID = dockerpulse@github.com
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
STAGE_DIR = build_staging

.PHONY: all compile install clean validate

all: compile

compile:
	glib-compile-schemas schemas/

validate:
	@echo "Running ESLint verification..."
	npx eslint .
	@echo "Running Type checking..."
	npx tsc --project jsconfig.json
	@echo "Running Unit tests..."
	npm test

install:
	@echo "Staging files..."
	rm -rf $(STAGE_DIR)
	mkdir -p $(STAGE_DIR)/schemas
	cp extension.js prefs.js metadata.json stylesheet.css $(STAGE_DIR)/
	cp schemas/org.gnome.shell.extensions.dockerpulse.gschema.xml $(STAGE_DIR)/schemas/
	@echo "Compiling schemas in staging area..."
	glib-compile-schemas $(STAGE_DIR)/schemas/
	@echo "Deploying to GNOME Shell extensions..."
	mkdir -p $(EXT_DIR)
	cp -r extension.js prefs.js metadata.json stylesheet.css parent_monitor_wrapper.py schemas/ $(EXT_DIR)/
	glib-compile-schemas $(EXT_DIR)/schemas/
	@echo "Extension installed successfully to $(EXT_DIR)."

clean:
	rm -f schemas/gschemas.compiled
	rm -rf $(STAGE_DIR)
	rm -rf $(EXT_DIR)
