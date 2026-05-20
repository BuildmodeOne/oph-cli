use crate::ui;
use anyhow::{bail, Context, Result};
use console::style;
use indicatif::{ProgressBar, ProgressStyle};
use reqwest::blocking::Client;
use serde::Deserialize;
use std::env;
use std::fs;
use std::path::PathBuf;
#[cfg(windows)]
use std::process::Command;
use std::time::Duration;

const GH_REPO: &str = "BuildmodeOne/oph-cli";

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    assets: Vec<GhAsset>,
}

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

fn get_asset_name() -> Result<String> {
    let ext = if cfg!(windows) { ".exe" } else { "" };

    let (platform, arch) = match (env::consts::OS, env::consts::ARCH) {
        ("linux", "x86_64") => ("linux", "x64"),
        ("linux", "aarch64") => ("linux", "arm64"),
        ("macos", "aarch64") => ("darwin", "arm64"),
        ("windows", "x86_64") => ("win32", "x64"),
        (os, arch) => bail!("Unsupported platform: {os}-{arch}"),
    };

    Ok(format!("oph-{platform}-{arch}{ext}"))
}

fn fetch_latest_release(client: &Client) -> Result<GhRelease> {
    let url = format!("https://api.github.com/repos/{GH_REPO}/releases/latest");
    let response = client
        .get(&url)
        .header("User-Agent", "oph")
        .header("Accept", "application/vnd.github+json")
        .send()
        .context("Failed to fetch release info")?;

    if !response.status().is_success() {
        bail!("HTTP {}", response.status());
    }

    response
        .json::<GhRelease>()
        .context("Failed to parse release info")
}

fn download_asset(client: &Client, url: &str, dest: &PathBuf) -> Result<()> {
    let mut response = client
        .get(url)
        .header("User-Agent", "oph")
        .send()
        .context("Download failed")?;

    if !response.status().is_success() {
        bail!("HTTP {}", response.status());
    }

    let mut file = fs::File::create(dest)?;
    response.copy_to(&mut file)?;
    Ok(())
}

#[cfg(unix)]
fn make_executable(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(windows)]
fn replace_binary_windows(temp_path: &PathBuf, current_binary: &PathBuf) -> Result<()> {
    use std::os::windows::process::CommandExt;
    let bat = env::temp_dir().join("oph-upgrade.bat");
    let bat_content = format!(
        "@echo off\r\n\
         timeout /t 2 /nobreak >nul\r\n\
         copy /y \"{}\" \"{}\"\r\n\
         del \"{}\"\r\n\
         del \"%~f0\"\r\n",
        temp_path.display(),
        current_binary.display(),
        temp_path.display()
    );
    fs::write(&bat, bat_content)?;

    const DETACHED_PROCESS: u32 = 0x00000008;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    Command::new("cmd.exe")
        .args(["/c", bat.to_str().unwrap_or("")])
        .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .context("Failed to spawn upgrade script")?;

    Ok(())
}

pub fn run() -> Result<()> {
    println!();
    ui::intro(" oph - Upgrade ");

    let client = Client::builder().user_agent("oph").build()?;

    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::default_spinner()
            .template("{spinner} {msg}")
            .unwrap(),
    );
    pb.set_message("Checking latest release…");
    pb.enable_steady_tick(Duration::from_millis(80));

    let release = match fetch_latest_release(&client) {
        Ok(r) => r,
        Err(_) => {
            pb.finish_and_clear();
            ui::log_error(&style("Failed to fetch release info").red().to_string());
            ui::outro(&style("Upgrade failed").red().to_string());
            std::process::exit(1);
        }
    };

    let latest_version = release.tag_name.trim_start_matches('v');
    let current_version = env!("CARGO_PKG_VERSION");

    if latest_version == current_version {
        pb.finish_and_clear();
        ui::log_success(&format!(
            "Already on latest version {}",
            style(current_version).green()
        ));
        ui::outro("Nothing to do");
        return Ok(());
    }

    pb.finish_and_clear();
    ui::log_success(&format!(
        "Latest: {}  Current: {}",
        style(&release.tag_name).green(),
        style(current_version).dim()
    ));

    let current_binary = env::current_exe().context("Could not determine current binary path")?;
    let asset_name = get_asset_name()?;

    let asset = release
        .assets
        .iter()
        .find(|a| a.name == asset_name)
        .with_context(|| format!("No binary found for this platform ({asset_name})"))?;

    let temp_path = env::temp_dir().join(&asset_name);

    let download_pb = ProgressBar::new_spinner();
    download_pb.set_style(
        ProgressStyle::default_spinner()
            .template("{spinner} {msg}")
            .unwrap(),
    );
    download_pb.set_message(format!("Downloading {asset_name}…"));
    download_pb.enable_steady_tick(Duration::from_millis(80));

    if download_asset(&client, &asset.browser_download_url, &temp_path).is_err() {
        download_pb.finish_and_clear();
        ui::log_error(&style("Download failed").red().to_string());
        ui::outro(&style("Upgrade failed").red().to_string());
        std::process::exit(1);
    }

    download_pb.finish_and_clear();
    ui::log_success("Downloaded");

    ui::log_step(&format!(
        "Replacing {}…",
        style(current_binary.display()).dim()
    ));

    #[cfg(windows)]
    {
        replace_binary_windows(&temp_path, &current_binary)?;
    }

    #[cfg(unix)]
    {
        make_executable(&temp_path)?;
        fs::rename(&temp_path, &current_binary).context("Failed to replace binary")?;
    }

    ui::outro(
        &style(format!("Upgraded to {}", release.tag_name))
            .green()
            .to_string(),
    );
    Ok(())
}
