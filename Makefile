UUID = dockerpulse@dockerpulse.local
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all install clean

all:
	@echo "Run 'make install' to install the extension."

install:
	mkdir -p $(INSTALL_DIR)
	cp extension.js metadata.json $(INSTALL_DIR)/
	# Only copy config.json if it doesn't already exist in the install dir, to preserve user settings
	if [ ! -f $(INSTALL_DIR)/config.json ]; then \
		cp config.json $(INSTALL_DIR)/; \
	fi
	@echo "DockerPulse installed successfully to $(INSTALL_DIR)."
	@echo "Please restart GNOME Shell or reload extensions to activate."

clean:
	rm -rf $(INSTALL_DIR)
	@echo "DockerPulse extension removed."
