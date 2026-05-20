use anyhow::{Context, Result};
use indicatif::{ProgressBar, ProgressStyle};
use std::process::{Command, Output, Stdio};
use std::time::Duration;

fn spinner(message: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::default_spinner()
            .template("{spinner} {msg}")
            .unwrap(),
    );
    pb.set_message(message.to_string());
    pb.enable_steady_tick(Duration::from_millis(80));
    pb
}

pub struct CmdOutput {
    pub stdout: String,
    #[allow(dead_code)]
    pub stderr: String,
}

pub fn run_cmd(cmd: &str, args: &[&str]) -> Result<CmdOutput> {
    let output = Command::new(cmd)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .with_context(|| format!("Failed to run {cmd}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let code = output.status.code().unwrap_or(-1);
        anyhow::bail!(
            "Command failed: exit {code}{}",
            if stderr.is_empty() {
                String::new()
            } else {
                format!("\n{stderr}")
            }
        );
    }

    Ok(CmdOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

pub fn exec_with_spinner(
    cmd: &str,
    args: &[&str],
    start_message: &str,
    error_message: &str,
    success_message: &str,
) -> bool {
    let pb = spinner(start_message);

    match run_cmd(cmd, args) {
        Ok(_) => {
            pb.finish_and_clear();
            crate::ui::log_success(success_message);
            true
        }
        Err(err) => {
            eprintln!("{err:#}");
            pb.finish_and_clear();
            crate::ui::log_error(error_message);
            false
        }
    }
}

#[allow(dead_code)]
pub fn command_output(cmd: &str, args: &[&str]) -> Result<Output> {
    Command::new(cmd)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .with_context(|| format!("Failed to run {cmd}"))
}
