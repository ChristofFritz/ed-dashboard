package main

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"
)

// TailEvent is one journal line to forward, with its physical line number.
type TailEvent struct {
	LineNo int    `json:"lineNo"`
	Raw    string `json:"raw"`
}

// TailResult is the outcome of reading new bytes from a journal file.
type TailResult struct {
	Events    []TailEvent
	NewOffset int64
	NewLineNo int
	// Consumed is how many bytes of complete lines were read (>= 0). Even when
	// no valid events were produced, the offset should advance by this much.
	Consumed int64
}

// validEvent reports whether a journal line is a well-formed event object
// (matches the server's parser: needs string "event" and "timestamp").
func validEvent(line []byte) bool {
	var e struct {
		Event     string `json:"event"`
		Timestamp string `json:"timestamp"`
	}
	if json.Unmarshal(line, &e) != nil {
		return false
	}
	return e.Event != "" && e.Timestamp != ""
}

// tail reads complete (newline-terminated) lines past cur from the file. A
// trailing partial line is left for the next poll, so offsets always sit on
// line boundaries.
func tail(path string, cur Cursor) (TailResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return TailResult{}, err
	}
	defer f.Close()

	st, err := f.Stat()
	if err != nil {
		return TailResult{}, err
	}
	// Journal files are append-only; a smaller size means it was rotated/reset.
	if st.Size() < cur.Offset {
		cur = Cursor{}
	}
	if st.Size() == cur.Offset {
		return TailResult{NewOffset: cur.Offset, NewLineNo: cur.LineNo}, nil
	}

	if _, err := f.Seek(cur.Offset, io.SeekStart); err != nil {
		return TailResult{}, err
	}
	data, err := io.ReadAll(f)
	if err != nil {
		return TailResult{}, err
	}

	res := TailResult{NewLineNo: cur.LineNo}
	lineNo := cur.LineNo
	var consumed int64
	for {
		nl := bytes.IndexByte(data[consumed:], '\n')
		if nl < 0 {
			break // trailing partial line — re-read next poll
		}
		line := data[consumed : consumed+int64(nl)]
		consumed += int64(nl) + 1
		lineNo++
		if validEvent(line) {
			res.Events = append(res.Events, TailEvent{LineNo: lineNo, Raw: strings.TrimSpace(string(line))})
		}
	}
	res.Consumed = consumed
	res.NewOffset = cur.Offset + consumed
	res.NewLineNo = lineNo
	return res, nil
}
