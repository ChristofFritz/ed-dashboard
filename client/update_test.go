package main

import "testing"

func TestUpdateAvailable(t *testing.T) {
	cases := []struct {
		current, latest string
		want            bool
	}{
		{"2026-07-12-1", "2026-07-12-2", true},  // same day, higher counter
		{"2026-07-12-2", "2026-07-12-10", true}, // numeric, not lexical (10 > 2)
		{"2026-07-12-2", "2026-07-12-2", false}, // same
		{"2026-07-12-3", "2026-07-12-2", false}, // older latest
		{"2026-07-12-9", "2026-07-13-1", true},  // next day
		{"2026-12-31-1", "2027-01-01-1", true},  // year boundary
		{"dev", "2026-07-12-1", false},          // dev never updates
		{"2026-07-12-1", "", false},             // no data
	}
	for _, c := range cases {
		if got := updateAvailable(c.current, c.latest); got != c.want {
			t.Errorf("updateAvailable(%q, %q) = %v, want %v", c.current, c.latest, got, c.want)
		}
	}
}
