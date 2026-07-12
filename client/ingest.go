package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type ingestBatch struct {
	Filename string      `json:"filename"`
	Events   []TailEvent `json:"events"`
}

type ingestSidecar struct {
	File string          `json:"file"`
	Data json.RawMessage `json:"data"`
}

type ingestPayload struct {
	Batches  []ingestBatch   `json:"batches,omitempty"`
	Sidecars []ingestSidecar `json:"sidecars,omitempty"`
}

type ingestResponse struct {
	Accepted int `json:"accepted"`
}

// errUnauthorized is fatal — a bad/rejected ingest token. No point retrying.
var errUnauthorized = errors.New("ingest token rejected (401) — check ingest_token in your config")

const maxBackoff = 30 * time.Second

// Ingest POSTs journal batches / sidecars to the server's /api/ingest endpoint.
type Ingest struct {
	url    string
	token  string
	client *http.Client
}

func NewIngest(serverURL, token string) *Ingest {
	return &Ingest{
		url:    serverURL + "/api/ingest",
		token:  token,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (in *Ingest) post(payload ingestPayload) (int, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, err
	}
	req, err := http.NewRequest(http.MethodPost, in.url, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+in.token)

	res, err := in.client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized {
		return 0, errUnauthorized
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 512))
		return 0, fmt.Errorf("ingest failed: %d %s", res.StatusCode, string(b))
	}
	var r ingestResponse
	_ = json.NewDecoder(res.Body).Decode(&r)
	return r.Accepted, nil
}

// Send retries transient failures with exponential backoff so nothing is
// dropped while the server is briefly unreachable. A 401 is fatal.
func (in *Ingest) Send(payload ingestPayload) (int, error) {
	backoff := time.Second
	for {
		accepted, err := in.post(payload)
		if err == nil {
			return accepted, nil
		}
		if errors.Is(err, errUnauthorized) {
			return 0, err
		}
		log.Printf("ingest error, retrying in %s: %v", backoff, err)
		time.Sleep(backoff)
		if backoff *= 2; backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}
