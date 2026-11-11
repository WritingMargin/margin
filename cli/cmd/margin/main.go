package main

import (
	cli "margin-cli"
	"os"
)

var version = "dev"

func main() {
	os.Exit(cli.Execute(os.Args[1:], version, os.Stdin, os.Stdout, os.Stderr))
}
