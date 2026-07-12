package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	headless := flag.Bool("headless", false, "run without the GUI (console logging)")
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}

	cfg, path, created, err := LoadOrInitConfig()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	if *headless {
		runHeadless(cfg, path, created)
		return
	}
	runGUI(cfg, path, created)
}

// runHeadless runs the sync engine with plain console logging — handy for
// servers or debugging. The GUI is the normal way to run the client.
func runHeadless(cfg Config, path string, created bool) {
	log.SetFlags(0)
	log.Printf("ed-dashboard client %s (headless)", version)
	if created {
		log.Printf("created config at %s — set ingest_token and run again", path)
		return
	}
	if cfg.IngestToken == "" {
		log.Fatalf("ingest_token is empty in %s — set it from the dashboard (⚙ ACCOUNT)", path)
	}

	engine := NewEngine(
		func(line string) { log.Println(line) },
		func(_ Status) {},
	)
	engine.SetConfig(cfg)
	engine.Start()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	engine.Stop()
}
