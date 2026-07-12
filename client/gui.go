package main

import (
	_ "embed"
	"fmt"
	"image/color"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

//go:embed Icon.png
var iconPNG []byte

const maxLogLines = 500

var stateColors = map[State]color.Color{
	StateIdle:       color.NRGBA{R: 0x88, G: 0x88, B: 0x88, A: 0xff}, // grey
	StateConnecting: color.NRGBA{R: 0xff, G: 0xb0, B: 0x00, A: 0xff}, // amber
	StateConnected:  color.NRGBA{R: 0x33, G: 0xcc, B: 0x55, A: 0xff}, // green
	StateError:      color.NRGBA{R: 0xff, G: 0x44, B: 0x44, A: 0xff}, // red
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

	statusDot := canvas.NewCircle(stateColors[StateIdle])
	statusLabel := widget.NewLabel("idle")

	logView := widget.NewMultiLineEntry()
	logView.Wrapping = fyne.TextWrapWord
	logView.Disable()
	logScroll := container.NewScroll(logView)
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

	var startBtn, stopBtn, saveBtn *widget.Button

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
		// Reflect normalisation back into the fields.
		serverEntry.SetText(c.ServerURL)
		journalEntry.SetText(c.JournalDir)
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

	form := widget.NewForm(
		widget.NewFormItem("Server URL", serverEntry),
		widget.NewFormItem("Ingest token", tokenEntry),
		widget.NewFormItem("Journal dir", journalEntry),
	)

	// Fixed-size wrapper so the status dot renders as a small circle.
	dot := container.NewGridWrap(fyne.NewSize(14, 14), statusDot)
	statusBar := container.NewHBox(dot, statusLabel)
	buttons := container.NewHBox(saveBtn, startBtn, stopBtn)

	header := container.NewVBox(
		form,
		buttons,
		statusBar,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("Log", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
	)
	w.SetContent(container.NewBorder(header, nil, nil, nil, logScroll))
	w.Resize(fyne.NewSize(620, 520))

	if created {
		appendLog("welcome! set your ingest token (from the dashboard ⚙ ACCOUNT), then Start")
	} else if strings.TrimSpace(cfg.IngestToken) != "" {
		// Token already present — start syncing right away.
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
