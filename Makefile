UUID = dockerpulse@github.com
EXT_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
STAGE_DIR = build_staging

MANIFEST = extension.js prefs.js processRegistry.js eventManager.js metadata.json stylesheet.css parent_monitor_wrapper.py schemas

.PHONY: all compile stage audit install clean validate

all: compile

compile:
	glib-compile-schemas schemas/

stage:
	@echo "Staging files..."
	rm -rf $(STAGE_DIR)
	mkdir -p $(STAGE_DIR)
	cp -r $(MANIFEST) $(STAGE_DIR)/
	@echo "Compiling schemas in staging area..."
	glib-compile-schemas $(STAGE_DIR)/schemas/

audit: stage
	@echo "Auditing staged files against build manifest..."
	node audit-manifest.js

validate: audit
	@echo "Running ESLint verification..."
	npx eslint .
	@echo "Running Type checking..."
	npx tsc --project jsconfig.json
	@echo "Running Unit tests..."
	npm test

install: stage
	@echo "Deploying to GNOME Shell extensions..."
	mkdir -p $(EXT_DIR)
	rm -rf $(EXT_DIR)/*
	cp -r $(STAGE_DIR)/* $(EXT_DIR)/
	@echo "Compiling schemas in target extension directory..."
	glib-compile-schemas $(EXT_DIR)/schemas/
	@echo "Extension installed successfully to $(EXT_DIR)."

clean:
	rm -f schemas/gschemas.compiled
	rm -rf $(STAGE_DIR)
	rm -rf $(EXT_DIR)
