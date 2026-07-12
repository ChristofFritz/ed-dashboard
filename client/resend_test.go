package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestResendAll verifies the engine re-streams journals from the start when
// ResendAll is called mid-run (and exercises the concurrency under -race).
func TestResendAll(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	jdir := t.TempDir()
	line := `{"timestamp":"2026-01-01T00:00:00Z","event":"LoadGame","Commander":"x"}` + "\n"
	if err := os.WriteFile(filepath.Join(jdir, "Journal.2026-01-01T000000.01.log"), []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}

	var batchesWithEvents int64
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		body, _ := io.ReadAll(r.Body)
		var p ingestPayload
		_ = json.Unmarshal(body, &p)
		n := 0
		for _, b := range p.Batches {
			n += len(b.Events)
		}
		if n > 0 {
			atomic.AddInt64(&batchesWithEvents, 1)
		}
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true,"accepted":` + itoa(n) + `}`))
	}))
	defer srv.Close()

	eng := NewEngine(func(string) {}, func(Status) {})
	eng.SetConfig(Config{ServerURL: srv.URL, IngestToken: "t", JournalDir: jdir, PollIntervalMs: 100})
	eng.Start()
	defer eng.Stop()

	waitFor(t, func() bool { return atomic.LoadInt64(&batchesWithEvents) >= 1 }, "first send")
	eng.ResendAll()
	waitFor(t, func() bool { return atomic.LoadInt64(&batchesWithEvents) >= 2 }, "resend")
}

func waitFor(t *testing.T, cond func() bool, what string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}
