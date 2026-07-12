package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"
)

// Cap events per request so a large first-run backfill stays well under the
// server's body-size limit.
const chunkSize = 2000

var journalRe = regexp.MustCompile(`^Journal\..*\.log$`)

var sidecarFiles = []string{"Status.json", "Cargo.json", "NavRoute.json", "Market.json"}

// State is the engine's connection state, shown by the status indicator.
type State int

const (
	StateIdle State = iota
	StateConnecting
	StateConnected
	StateError
)

func (s State) String() string {
	switch s {
	case StateConnecting:
		return "connecting"
	case StateConnected:
		return "connected"
	case StateError:
		return "error"
	default:
		return "idle"
	}
}

// Status is an immutable snapshot handed to the UI on every change.
type Status struct {
	State       State
	EventsTotal int
	LastError   string
}

// Engine runs the polling sync loop. It's safe to Start/Stop repeatedly and
// reports every log line and status change through the callbacks given to
// NewEngine.
type Engine struct {
	logFn    func(string)
	statusFn func(Status)

	mu          sync.Mutex
	cfg         Config
	offsets     *Offsets
	ingest      *Ingest
	sidecarSeen map[string]string
	running     bool
	cancel      context.CancelFunc
	status      Status
}

func NewEngine(logFn func(string), statusFn func(Status)) *Engine {
	dir, _ := ConfigDir()
	return &Engine{
		logFn:       logFn,
		statusFn:    statusFn,
		offsets:     LoadOffsets(dir),
		sidecarSeen: map[string]string{},
	}
}

func (e *Engine) log(format string, args ...any) {
	msg := time.Now().Format("15:04:05") + "  " + fmt.Sprintf(format, args...)
	if e.logFn != nil {
		e.logFn(msg)
	}
}

func (e *Engine) emitStatus() {
	if e.statusFn != nil {
		e.statusFn(e.status)
	}
}

func (e *Engine) setState(s State, lastErr string) {
	e.mu.Lock()
	e.status.State = s
	e.status.LastError = lastErr
	e.mu.Unlock()
	e.emitStatus()
}

func (e *Engine) addEvents(n int) {
	if n == 0 {
		return
	}
	e.mu.Lock()
	e.status.EventsTotal += n
	e.mu.Unlock()
	e.emitStatus()
}

// SetConfig swaps the configuration. It takes effect immediately for future
// polls (a fresh ingest client is built with the new URL/token).
func (e *Engine) SetConfig(cfg Config) {
	cfg = cfg.normalized()
	e.mu.Lock()
	e.cfg = cfg
	e.ingest = NewIngest(cfg.ServerURL, cfg.IngestToken, e.onAttempt)
	e.mu.Unlock()
}

func (e *Engine) onAttempt(err error) {
	switch {
	case err == nil:
		e.setState(StateConnected, "")
	case errors.Is(err, errUnauthorized):
		e.setState(StateError, err.Error())
	case errors.Is(err, context.Canceled):
		// stopping — leave state alone
	default:
		e.setState(StateConnecting, err.Error())
	}
}

func (e *Engine) get() (Config, *Ingest) {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.cfg, e.ingest
}

func (e *Engine) Running() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.running
}

// Start begins the sync loop in the background. No-op if already running.
func (e *Engine) Start() {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	e.cancel = cancel
	e.running = true
	e.mu.Unlock()

	e.setState(StateConnecting, "")
	go e.run(ctx)
}

// Stop halts the sync loop. No-op if not running.
func (e *Engine) Stop() {
	e.mu.Lock()
	if !e.running {
		e.mu.Unlock()
		return
	}
	e.running = false
	cancel := e.cancel
	e.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (e *Engine) run(ctx context.Context) {
	cfg, _ := e.get()
	e.log("server:  %s", cfg.ServerURL)
	e.log("journal: %s", cfg.JournalDir)
	if _, err := os.Stat(cfg.JournalDir); err != nil {
		e.log("warning: journal dir not found yet — will keep checking")
	}

	n := e.scanJournals(ctx)
	if ctx.Err() != nil {
		e.finish()
		return
	}
	e.log("backfill complete — forwarded %d new events", n)
	e.scanSidecars(ctx)
	e.log("watching every %dms…", cfg.PollIntervalMs)

	ticker := time.NewTicker(time.Duration(cfg.PollIntervalMs) * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			e.finish()
			return
		case <-ticker.C:
			e.scanJournals(ctx)
			e.scanSidecars(ctx)
		}
	}
}

func (e *Engine) finish() {
	e.log("stopped")
	e.setState(StateIdle, "")
}

// scanJournals reads new lines from every journal (oldest first) and forwards
// them. Returns the number of events accepted this pass.
func (e *Engine) scanJournals(ctx context.Context) int {
	cfg, _ := e.get()
	entries, err := os.ReadDir(cfg.JournalDir)
	if err != nil {
		return 0
	}
	names := make([]string, 0, len(entries))
	for _, ent := range entries {
		if !ent.IsDir() && journalRe.MatchString(ent.Name()) {
			names = append(names, ent.Name())
		}
	}
	sort.Strings(names) // lexical == chronological for ED journal names

	total := 0
	for _, name := range names {
		if ctx.Err() != nil {
			break
		}
		n, err := e.pump(ctx, name)
		if err != nil {
			if ctx.Err() == nil && !errors.Is(err, context.Canceled) {
				e.log("journal %s: %v", name, err)
			}
			continue
		}
		total += n
	}
	return total
}

// pump reads new lines from one journal, sends them (chunked), and persists
// the offset only after a successful send (a crash re-reads; server de-dupes).
func (e *Engine) pump(ctx context.Context, name string) (int, error) {
	cfg, ingest := e.get()
	cur := e.offsets.Get(name)
	res, err := tail(filepath.Join(cfg.JournalDir, name), cur)
	if err != nil {
		return 0, err
	}
	if res.Consumed == 0 {
		return 0, nil
	}

	accepted := 0
	for i := 0; i < len(res.Events); i += chunkSize {
		end := min(i+chunkSize, len(res.Events))
		n, err := ingest.Send(ctx, ingestPayload{
			Batches: []ingestBatch{{Filename: name, Events: res.Events[i:end]}},
		})
		if err != nil {
			return accepted, err // fatal (401) or cancelled — offset not advanced
		}
		accepted += n
	}
	e.offsets.Set(name, Cursor{Offset: res.NewOffset, LineNo: res.NewLineNo})
	e.addEvents(accepted)
	if accepted > 0 {
		e.log("forwarded %d events from %s", accepted, name)
	}
	return accepted, nil
}

// scanSidecars forwards Status/Cargo/NavRoute/Market whenever they change.
func (e *Engine) scanSidecars(ctx context.Context) {
	cfg, ingest := e.get()
	for _, file := range sidecarFiles {
		if ctx.Err() != nil {
			return
		}
		full := filepath.Join(cfg.JournalDir, file)
		st, err := os.Stat(full)
		if err != nil {
			continue
		}
		stamp := fmt.Sprintf("%d:%d", st.ModTime().UnixNano(), st.Size())
		if e.sidecarSeen[file] == stamp {
			continue
		}
		raw, ok := readJSONWithRetry(full)
		if !ok {
			continue // torn write — retry on the next tick
		}
		if _, err := ingest.Send(ctx, ingestPayload{Sidecars: []ingestSidecar{{File: file, Data: raw}}}); err != nil {
			if ctx.Err() == nil && !errors.Is(err, context.Canceled) {
				e.log("sidecar %s: %v", file, err)
			}
			continue
		}
		e.sidecarSeen[file] = stamp
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
