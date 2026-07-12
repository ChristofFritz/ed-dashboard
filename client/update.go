package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	repoOwner       = "ChristofFritz"
	repoName        = "ed-dashboard"
	releasesPageURL = "https://github.com/" + repoOwner + "/" + repoName + "/releases/latest"
)

type releaseInfo struct {
	TagName string `json:"tag_name"`
	HTMLURL string `json:"html_url"`
}

// latestRelease asks GitHub for the newest release. Returns nil on any error
// (offline, rate-limited, bad response) so callers can fail silently.
func latestRelease(ctx context.Context) *releaseInfo {
	url := "https://api.github.com/repos/" + repoOwner + "/" + repoName + "/releases/latest"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	res, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return nil
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil
	}
	var r releaseInfo
	if json.NewDecoder(res.Body).Decode(&r) != nil || r.TagName == "" {
		return nil
	}
	if r.HTMLURL == "" {
		r.HTMLURL = releasesPageURL
	}
	return &r
}

// updateAvailable reports whether latest is newer than the running version.
// A dev/unknown build never reports an update.
func updateAvailable(current, latest string) bool {
	if current == "dev" || current == "" || latest == "" {
		return false
	}
	return compareVersions(latest, current) > 0
}

// compareVersions orders versions of the form YYYY-MM-DD-N: the zero-padded
// date compares lexically, the trailing counter numerically.
func compareVersions(a, b string) int {
	ad, an := splitVersion(a)
	bd, bn := splitVersion(b)
	if ad != bd {
		if ad < bd {
			return -1
		}
		return 1
	}
	switch {
	case an < bn:
		return -1
	case an > bn:
		return 1
	default:
		return 0
	}
}

func splitVersion(v string) (date string, n int) {
	i := strings.LastIndex(v, "-")
	if i < 0 {
		return v, 0
	}
	n, _ = strconv.Atoi(v[i+1:])
	return v[:i], n
}
