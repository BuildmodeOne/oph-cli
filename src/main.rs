mod commands;
mod ui;
mod utils;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(
    name = "oph",
    version,
    about = "A general purpose CLI by Philipp Opheys"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Update project dependencies
    Update {
        /// Skip git branch check
        #[arg(short, long)]
        force: bool,
    },
    /// Self-upgrade the CLI to the latest release from GitHub
    Upgrade,
    /// Replace AI em dashes (- -) with a regular minus (-) in all non-ignored files
    Dash {
        /// Preview changes without writing to disk
        #[arg(long)]
        dry_run: bool,
    },
}

fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        Command::Update { force } => commands::update::run(force),
        Command::Upgrade => commands::upgrade::run(),
        Command::Dash { dry_run } => commands::dash::run(dry_run),
    };

    if let Err(e) = result {
        eprintln!("{e:#}");
        std::process::exit(1);
    }
}
