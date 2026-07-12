package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/BurntSushi/toml"
)

// Config is the client's TOML configuration, stored in ~/.ed-dashboard/config.toml.
type Config struct {
	ServerURL      string `toml:"server_url"`
	IngestToken    string `toml:"ingest_token"`
	JournalDir     string `toml:"journal_dir"`
	PollIntervalMs int    `toml:"poll_interval_ms"`
}

// ConfigDir is the ~/.ed-dashboard directory holding config + local state.
func ConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".ed-dashboard"), nil
}

func defaultJournalDir() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(home, "Saved Games", "Frontier Developments", "Elite Dangerous")
	case "darwin":
		// Elite Dangerous on macOS runs under CrossOver/Wine.
		return filepath.Join(home,
			"Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover",
			"Saved Games/Frontier Developments/Elite Dangerous")
	default: // linux — typically Steam Proton
		return filepath.Join(home,
			".local/share/Steam/steamapps/compatdata/359320/pfx/drive_c/users/steamuser",
			"Saved Games/Frontier Developments/Elite Dangerous")
	}
}

const configTemplate = `# ED Dashboard client configuration.
#
# You can edit these here or from the app window (they're the same file).
#  - ingest_token comes from the dashboard: open it in a browser, then
#    ⚙ ACCOUNT → NEW TOKEN, and paste it below.
#  - journal_dir should point at your Elite Dangerous journal folder.

# Base URL of your hosted dashboard, e.g. "https://ed.example.com".
server_url = %q

# Ingest token from the dashboard. REQUIRED.
ingest_token = %q

# Folder Elite Dangerous writes its journal + Status/Cargo/NavRoute/Market files to.
journal_dir = %q

# How often to poll the journal folder for changes (milliseconds).
poll_interval_ms = %d
`

func (c Config) normalized() Config {
	c.ServerURL = strings.TrimRight(strings.TrimSpace(c.ServerURL), "/")
	c.IngestToken = strings.TrimSpace(c.IngestToken)
	c.JournalDir = strings.TrimSpace(c.JournalDir)
	if c.ServerURL == "" {
		c.ServerURL = "http://localhost:3400"
	}
	if c.JournalDir == "" {
		c.JournalDir = defaultJournalDir()
	}
	if c.PollIntervalMs <= 0 {
		c.PollIntervalMs = 1000
	}
	return c
}

// LoadOrInitConfig reads ~/.ed-dashboard/config.toml, creating a template with
// sensible defaults on first run (created=true). It never fails on a missing
// ingest_token — the GUI lets the user fill it in — so callers that need one
// (headless mode) must check it themselves.
func LoadOrInitConfig() (cfg Config, path string, created bool, err error) {
	dir, err := ConfigDir()
	if err != nil {
		return Config{}, "", false, err
	}
	if err = os.MkdirAll(dir, 0o755); err != nil {
		return Config{}, "", false, err
	}
	path = filepath.Join(dir, "config.toml")

	if _, statErr := os.Stat(path); os.IsNotExist(statErr) {
		cfg = Config{ServerURL: "http://localhost:3400", JournalDir: defaultJournalDir(), PollIntervalMs: 1000}
		if err = SaveConfig(path, cfg); err != nil {
			return Config{}, path, false, err
		}
		return cfg, path, true, nil
	}

	if _, err = toml.DecodeFile(path, &cfg); err != nil {
		return Config{}, path, false, fmt.Errorf("parsing %s: %w", path, err)
	}
	return cfg.normalized(), path, false, nil
}

// SaveConfig writes the config back out, keeping the explanatory comments.
func SaveConfig(path string, c Config) error {
	c = c.normalized()
	body := fmt.Sprintf(configTemplate, c.ServerURL, c.IngestToken, c.JournalDir, c.PollIntervalMs)
	return os.WriteFile(path, []byte(body), 0o600)
}
