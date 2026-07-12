package main

import (
	"context"
	_ "embed"
	"fmt"
	"image/color"
	"net/url"
	"os"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/storage"
	"fyne.io/fyne/v2/widget"
)

//go:embed Icon.png
var iconPNG []byte

const maxLogLines = 500

var (
	colGrey  = color.NRGBA{R: 0x88, G: 0x88, B: 0x88, A: 0xff}
	colAmber = color.NRGBA{R: 0xff, G: 0xb0, B: 0x00, A: 0xff}
	colGreen = color.NRGBA{R: 0x33, G: 0xcc, B: 0x55, A: 0xff}
	colRed   = color.NRGBA{R: 0xff, G: 0x44, B: 0x44, A: 0xff}
)

var stateColors = map[State]color.Color{
	StateIdle:       colGrey,
	StateConnecting: colAmber,
	StateConnected:  colGreen,
	StateError:      colRed,
}

// journalStatus reports whether dir exists and holds journal files.
func journalStatus(dir string) (string, color.Color) {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return "⚠ set your journal folder", colAmber
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return "⚠ folder not found", colRed
	}
	entries, _ := os.ReadDir(dir)
	n := 0
	for _, e := range entries {
		if !e.IsDir() && journalRe.MatchString(e.Name()) {
			n++
		}
	}
	if n == 0 {
		return "⚠ no Journal.*.log files found here yet", colAmber
	}
	return fmt.Sprintf("✓ %d journal files found", n), colGreen
}

// runGUI shows the client's window: editable config, Start/Stop, a status
// indicator, and a live log. Runs on the main goroutine (required by the GUI).
func runGUI(cfg Config, path string, created bool) {
	a := app.NewWithID("net.chfritz.eddashboard.client")
	a.SetIcon(fyne.NewStaticResource("icon.png", iconPNG))
	w := a.NewWindow("ED Dashboard Client " + version)

	serverEntry := widget.NewEntry()
	serverEntry.SetText(cfg.ServerURL)
	tokenEntry := widget.NewPasswordEntry()
	tokenEntry.SetText(cfg.IngestToken)
	tokenEntry.SetPlaceHolder("edci_… (from the dashboard ⚙ ACCOUNT)")
	journalEntry := widget.NewEntry()
	journalEntry.SetText(cfg.JournalDir)

	statusDot := canvas.NewCircle(colGrey)
	statusLabel := widget.NewLabel("idle")

	journalHint := canvas.NewText("", colGrey)
	journalHint.TextSize = 12
	refreshJournalHint := func() {
		msg, col := journalStatus(journalEntry.Text)
		journalHint.Text = msg
		journalHint.Color = col
		journalHint.Refresh()
	}
	journalEntry.OnChanged = func(string) { refreshJournalHint() }
	refreshJournalHint()

	browseBtn := widget.NewButton("Browse…", func() {
		d := dialog.NewFolderOpen(func(lu fyne.ListableURI, err error) {
			if err != nil || lu == nil {
				return
			}
			journalEntry.SetText(lu.Path())
			refreshJournalHint()
		}, w)
		if cur := journalEntry.Text; cur != "" {
			if u, err := storage.ListerForURI(storage.NewFileURI(cur)); err == nil {
				d.SetLocation(u)
			}
		}
		d.Show()
	})

	// Readable, wrapping, vertically-scrolling log (monospace, full contrast).
	logView := widget.NewLabel("")
	logView.Wrapping = fyne.TextWrapWord
	logView.TextStyle = fyne.TextStyle{Monospace: true}
	logScroll := container.NewVScroll(logView)
	var logLines []string

	appendLog := func(line string) {
		fyne.Do(func() {
			logLines = append(logLines, line)
			if len(logLines) > maxLogLines {
				logLines = logLines[len(logLines)-maxLogLines:]
			}
			logView.SetText(strings.Join(logLines, "\n"))
			logScroll.ScrollToBottom()
		})
	}

	updateStatus := func(s Status) {
		fyne.Do(func() {
			statusDot.FillColor = stateColors[s.State]
			statusDot.Refresh()
			text := fmt.Sprintf("%s — %d events forwarded", s.State, s.EventsTotal)
			if s.LastError != "" && (s.State == StateError || s.State == StateConnecting) {
				text += "  (" + trim(s.LastError, 80) + ")"
			}
			statusLabel.SetText(text)
		})
	}

	engine := NewEngine(appendLog, updateStatus)
	engine.SetConfig(cfg)

	var startBtn, stopBtn, saveBtn, resendBtn *widget.Button

	readForm := func() Config {
		return Config{
			ServerURL:      serverEntry.Text,
			IngestToken:    tokenEntry.Text,
			JournalDir:     journalEntry.Text,
			PollIntervalMs: cfg.PollIntervalMs,
		}
	}

	save := func() bool {
		c := readForm().normalized()
		if err := SaveConfig(path, c); err != nil {
			appendLog("save error: " + err.Error())
			return false
		}
		engine.SetConfig(c)
		serverEntry.SetText(c.ServerURL)
		journalEntry.SetText(c.JournalDir)
		refreshJournalHint()
		appendLog("config saved to " + path)
		return true
	}

	setRunning := func(running bool) {
		fyne.Do(func() {
			if running {
				startBtn.Disable()
				stopBtn.Enable()
			} else {
				startBtn.Enable()
				stopBtn.Disable()
			}
		})
	}

	saveBtn = widget.NewButton("Save", func() { save() })
	startBtn = widget.NewButton("Start", func() {
		if !save() {
			return
		}
		if strings.TrimSpace(tokenEntry.Text) == "" {
			appendLog("set your ingest token before starting")
			return
		}
		engine.Start()
		setRunning(true)
	})
	stopBtn = widget.NewButton("Stop", func() {
		engine.Stop()
		setRunning(false)
	})
	stopBtn.Disable()

	resendBtn = widget.NewButton("Re-send all", func() {
		if strings.TrimSpace(tokenEntry.Text) == "" {
			appendLog("set your ingest token before re-sending")
			return
		}
		if !save() {
			return
		}
		engine.ResendAll()
		setRunning(true)
	})

	// Journal dir field with a Browse button that doesn't get cramped.
	journalRow := container.NewBorder(nil, nil, nil, browseBtn, journalEntry)

	form := widget.NewForm(
		widget.NewFormItem("Server URL", serverEntry),
		widget.NewFormItem("Ingest token", tokenEntry),
		widget.NewFormItem("Journal dir", journalRow),
	)

	dot := container.NewGridWrap(fyne.NewSize(14, 14), statusDot)
	statusBar := container.NewHBox(dot, statusLabel)
	buttons := container.NewHBox(saveBtn, startBtn, stopBtn, resendBtn)

	// Hidden until a newer release is found. Clicking opens the download page.
	updateLink := widget.NewHyperlink("", nil)
	updateLink.Hide()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
		defer cancel()
		rel := latestRelease(ctx)
		if rel == nil || !updateAvailable(version, rel.TagName) {
			return
		}
		u, _ := url.Parse(rel.HTMLURL)
		fyne.Do(func() {
			updateLink.SetText("⭳ Update available: " + rel.TagName + " — download")
			updateLink.SetURL(u)
			updateLink.Show()
		})
	}()

	header := container.NewVBox(
		updateLink,
		form,
		journalHint,
		buttons,
		statusBar,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Log", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
	)
	w.SetContent(container.NewBorder(header, nil, nil, nil, logScroll))
	w.Resize(fyne.NewSize(660, 560))

	if created {
		appendLog("welcome! set your ingest token (from the dashboard ⚙ ACCOUNT), then Start")
	} else if strings.TrimSpace(cfg.IngestToken) != "" {
		engine.Start()
		setRunning(true)
	} else {
		appendLog("set your ingest token, then Start")
	}

	w.SetCloseIntercept(func() {
		engine.Stop()
		w.Close()
	})
	w.ShowAndRun()
}

func trim(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
