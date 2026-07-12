package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"
)

// Cap events per request so a large first-run backfill stays well under the
// server's body-size limit.
const chunkSize = 2000

var journalRe = regexp.MustCompile(`^Journal\..*\.log$`)

var sidecarFiles = []string{"Status.json", "Cargo.json", "NavRoute.json", "Market.json"}

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}

	log.SetFlags(log.Ltime)
	log.Printf("ed-dashboard client %s", version)

	cfg, path, err := LoadConfig()
	if errors.Is(err, ErrConfigCreated) {
		log.Printf("created config at %s", path)
		log.Printf("→ set your ingest_token (from the dashboard, ⚙ ACCOUNT) and run again")
		return
	}
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	log.Printf("server:  %s", cfg.ServerURL)
	log.Printf("journal: %s", cfg.JournalDir)
	if _, err := os.Stat(cfg.JournalDir); err != nil {
		log.Printf("warning: journal dir not found yet (%v) — will keep checking", err)
	}

	dir, _ := ConfigDir()
	offsets := LoadOffsets(dir)
	ingest := NewIngest(cfg.ServerURL, cfg.IngestToken)

	p := &poller{cfg: cfg, offsets: offsets, ingest: ingest, sidecarSeen: map[string]string{}}

	// First pass = backfill anything written while we were down.
	backfilled := p.scanJournals()
	log.Printf("backfill complete — forwarded %d new events", backfilled)
	p.scanSidecars()
	log.Printf("watching %s every %dms…", cfg.JournalDir, cfg.PollIntervalMs)

	ticker := time.NewTicker(time.Duration(cfg.PollIntervalMs) * time.Millisecond)
	defer ticker.Stop()
	for range ticker.C {
		p.scanJournals()
		p.scanSidecars()
	}
}

type poller struct {
	cfg     *Config
	offsets *Offsets
	ingest  *Ingest
	// sidecarSeen maps a sidecar filename to its last-seen "modtime:size" stamp.
	sidecarSeen map[string]string
}

// scanJournals reads new lines from every journal file (oldest first) and
// forwards them. Returns the number of events accepted this pass.
func (p *poller) scanJournals() int {
	entries, err := os.ReadDir(p.cfg.JournalDir)
	if err != nil {
		return 0
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && journalRe.MatchString(e.Name()) {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names) // lexical == chronological for ED journal names

	total := 0
	for _, name := range names {
		n, err := p.pump(name)
		if err != nil {
			log.Printf("journal %s: %v", name, err)
			continue
		}
		total += n
	}
	return total
}

// pump reads new lines from one journal, sends them (chunked), and persists
// the file's offset only after a successful send (a crash re-reads; the server
// de-dupes).
func (p *poller) pump(name string) (int, error) {
	cur := p.offsets.Get(name)
	res, err := tail(filepath.Join(p.cfg.JournalDir, name), cur)
	if err != nil {
		return 0, err
	}
	if res.Consumed == 0 {
		return 0, nil
	}

	accepted := 0
	for i := 0; i < len(res.Events); i += chunkSize {
		end := min(i+chunkSize, len(res.Events))
		n, err := p.ingest.Send(ingestPayload{
			Batches: []ingestBatch{{Filename: name, Events: res.Events[i:end]}},
		})
		if err != nil {
			return accepted, err // fatal (401) — offset not advanced
		}
		accepted += n
	}
	p.offsets.Set(name, Cursor{Offset: res.NewOffset, LineNo: res.NewLineNo})
	if accepted > 0 {
		log.Printf("forwarded %d events from %s", accepted, name)
	}
	return accepted, nil
}

// scanSidecars forwards Status/Cargo/NavRoute/Market whenever they change.
func (p *poller) scanSidecars() {
	for _, file := range sidecarFiles {
		full := filepath.Join(p.cfg.JournalDir, file)
		st, err := os.Stat(full)
		if err != nil {
			continue
		}
		stamp := fmt.Sprintf("%d:%d", st.ModTime().UnixNano(), st.Size())
		if p.sidecarSeen[file] == stamp {
			continue
		}
		raw, ok := readJSONWithRetry(full)
		if !ok {
			continue // torn write — retry on the next tick
		}
		if _, err := p.ingest.Send(ingestPayload{Sidecars: []ingestSidecar{{File: file, Data: raw}}}); err != nil {
			log.Printf("sidecar %s: %v", file, err)
			continue
		}
		p.sidecarSeen[file] = stamp
	}
}

// readJSONWithRetry reads a sidecar file, retrying briefly because the game
// rewrites them whole and non-atomically (a read can catch a torn write).
func readJSONWithRetry(path string) (json.RawMessage, bool) {
	for attempt := 0; attempt < 3; attempt++ {
		b, err := os.ReadFile(path)
		if err == nil && len(b) > 0 && json.Valid(b) {
			return json.RawMessage(b), true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return nil, false
}
