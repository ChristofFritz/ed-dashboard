package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Cursor is a byte offset + physical line count within one journal file.
type Cursor struct {
	Offset int64 `json:"offset"`
	LineNo int   `json:"lineNo"`
}

// Offsets persists per-file cursors to ~/.ed-dashboard/offsets.json so a
// restart resumes where it left off. (The server de-dupes re-sends too, so
// this is only an optimisation.)
type Offsets struct {
	path string
	mu   sync.Mutex
	data map[string]Cursor
}

func LoadOffsets(dir string) *Offsets {
	o := &Offsets{path: filepath.Join(dir, "offsets.json"), data: map[string]Cursor{}}
	if b, err := os.ReadFile(o.path); err == nil {
		_ = json.Unmarshal(b, &o.data)
	}
	return o
}

func (o *Offsets) Get(name string) Cursor {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.data[name]
}

// Clear forgets all cursors (and persists the empty state) so the next poll
// re-reads every journal from the start.
func (o *Offsets) Clear() {
	o.mu.Lock()
	o.data = map[string]Cursor{}
	b, _ := json.Marshal(o.data)
	o.mu.Unlock()
	tmp := o.path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, o.path)
	}
}

func (o *Offsets) Set(name string, c Cursor) {
	o.mu.Lock()
	o.data[name] = c
	b, _ := json.Marshal(o.data)
	o.mu.Unlock()
	tmp := o.path + ".tmp"
	if os.WriteFile(tmp, b, 0o600) == nil {
		_ = os.Rename(tmp, o.path)
	}
}
