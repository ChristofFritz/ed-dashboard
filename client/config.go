package main

import (
	"errors"
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

// ErrConfigCreated is returned by LoadConfig when it just wrote a fresh config
// that the user still needs to fill in (the ingest token).
var ErrConfigCreated = errors.New("config created")

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
# 1. Create an ingest token in the dashboard (open it in a browser, then
#    ⚙ ACCOUNT → NEW TOKEN) and paste it below.
# 2. Point journal_dir at your Elite Dangerous journal folder if the default
#    below is wrong for your setup.
# 3. Run the client again.

# Base URL of your hosted dashboard, e.g. "https://ed.example.com".
server_url = %q

# Ingest token from the dashboard. REQUIRED.
ingest_token = %q

# Folder Elite Dangerous writes its journal + Status/Cargo/NavRoute/Market files to.
journal_dir = %q

# How often to poll the journal folder for changes (milliseconds).
poll_interval_ms = %d
`

// LoadConfig reads ~/.ed-dashboard/config.toml, creating a template on first
// run (returning ErrConfigCreated). It validates required fields otherwise.
func LoadConfig() (*Config, string, error) {
	dir, err := ConfigDir()
	if err != nil {
		return nil, "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, "", err
	}
	path := filepath.Join(dir, "config.toml")

	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		body := fmt.Sprintf(configTemplate, "http://localhost:3400", "", defaultJournalDir(), 1000)
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			return nil, path, err
		}
		return nil, path, ErrConfigCreated
	}

	cfg := &Config{}
	if _, err := toml.DecodeFile(path, cfg); err != nil {
		return nil, path, fmt.Errorf("parsing %s: %w", path, err)
	}
	cfg.ServerURL = strings.TrimRight(strings.TrimSpace(cfg.ServerURL), "/")
	cfg.IngestToken = strings.TrimSpace(cfg.IngestToken)
	if cfg.PollIntervalMs <= 0 {
		cfg.PollIntervalMs = 1000
	}
	if cfg.ServerURL == "" {
		return nil, path, fmt.Errorf("server_url is empty in %s", path)
	}
	if cfg.IngestToken == "" {
		return nil, path, fmt.Errorf("ingest_token is empty in %s — set it from the dashboard (⚙ ACCOUNT)", path)
	}
	if cfg.JournalDir == "" {
		cfg.JournalDir = defaultJournalDir()
	}
	return cfg, path, nil
}
