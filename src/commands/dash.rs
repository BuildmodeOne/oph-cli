use crate::ui;
use anyhow::Result;
use console::style;
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use indicatif::{ProgressBar, ProgressStyle};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const MAX_DEPTH: usize = 50;
const SAMPLE_SIZE: usize = 8192;

const BINARY_EXTENSIONS: &[&str] = &[
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".ico", ".svg", ".mp3", ".mp4", ".wav",
    ".ogg", ".flac", ".avi", ".mov", ".mkv", ".zip", ".tar", ".gz", ".bz2", ".xz", ".rar", ".7z",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".exe", ".dll", ".so", ".dylib",
    ".bin", ".wasm", ".ttf", ".otf", ".woff", ".woff2", ".eot", ".db", ".sqlite", ".sqlite3",
    ".lock",
];

fn build_ignore(cwd: &Path) -> Result<Gitignore> {
    let mut builder = GitignoreBuilder::new(cwd);
    builder.add_line(None, ".git")?;

    let gitignore_path = cwd.join(".gitignore");
    if gitignore_path.exists() {
        builder.add(gitignore_path);
    }

    Ok(builder.build()?)
}

fn is_binary_path(file_path: &Path) -> bool {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default()
        .to_lowercase();
    BINARY_EXTENSIONS.contains(&ext.as_str())
}

fn has_binary_content(buffer: &[u8]) -> bool {
    let sample_size = buffer.len().min(SAMPLE_SIZE);
    buffer[..sample_size].contains(&0)
}

fn walk_files(dir: &Path, cwd: &Path, ig: &Gitignore, depth: usize) -> Vec<PathBuf> {
    if depth > MAX_DEPTH {
        return Vec::new();
    }

    let mut files = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return files,
    };

    for entry in entries.flatten() {
        let full_path = entry.path();
        let rel_path = match full_path.strip_prefix(cwd) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let rel_str = rel_path.to_string_lossy().replace('\\', "/");

        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if ig.matched(rel_path, true).is_ignore()
                || ig
                    .matched(Path::new(&format!("{rel_str}/")), true)
                    .is_ignore()
            {
                continue;
            }
            files.extend(walk_files(&full_path, cwd, ig, depth + 1));
        } else if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if ig.matched(rel_path, false).is_ignore() {
                continue;
            }
            files.push(full_path);
        }
    }

    files
}

fn contains_dashes(content: &str) -> bool {
    content.contains(['\u{2014}', '\u{2013}'])
}

fn replace_dashes(content: &str) -> String {
    content
        .chars()
        .map(|c| match c {
            '\u{2014}' | '\u{2013}' => '-',
            other => other,
        })
        .collect()
}

pub fn run(dry_run: bool) -> Result<()> {
    ui::intro(" oph - Dash Replacer ");

    let cwd = std::env::current_dir()?;
    let ig = build_ignore(&cwd)?;

    let gitignore_path = cwd.join(".gitignore");
    if gitignore_path.exists() {
        ui::log_info(&format!(
            "Using .gitignore from {}",
            style(gitignore_path.display()).bold()
        ));
    } else {
        ui::log_warn("No .gitignore found - scanning all files");
    }

    if dry_run {
        ui::log_warn("Dry-run mode: no files will be modified");
    }

    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::default_spinner()
            .template("{spinner} {msg}")
            .unwrap(),
    );
    pb.set_message("Scanning files…");
    pb.enable_steady_tick(Duration::from_millis(80));

    let all_files = walk_files(&cwd, &cwd, &ig, 0);
    pb.finish_and_clear();
    ui::log_info(&format!(
        "Found {} file(s) to inspect",
        style(all_files.len().to_string()).bold()
    ));

    let mut scanned = 0usize;
    let mut changed = 0usize;
    let mut skipped = 0usize;

    for file_path in &all_files {
        scanned += 1;

        if is_binary_path(file_path) {
            skipped += 1;
            continue;
        }

        let buffer = match fs::read(file_path) {
            Ok(b) => b,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        if has_binary_content(&buffer) {
            skipped += 1;
            continue;
        }

        let original = match String::from_utf8(buffer) {
            Ok(s) => s,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };

        if !contains_dashes(&original) {
            continue;
        }

        let replaced = replace_dashes(&original);
        let rel_path = file_path
            .strip_prefix(&cwd)
            .unwrap_or(file_path)
            .to_string_lossy()
            .replace('\\', "/");

        if !dry_run && fs::write(file_path, replaced).is_err() {
            ui::log_warn(&format!("Could not write: {rel_path}"));
            continue;
        }

        changed += 1;
        let prefix = if dry_run {
            format!("{} ", style("[dry-run]").dim())
        } else {
            String::new()
        };
        ui::log_success(&format!("{prefix}{}", style(rel_path).green()));
    }

    println!();
    ui::log_info(&format!(
        "Scanned : {} file(s)\n          Modified: {} file(s)\n          Skipped : {} binary/unreadable file(s)",
        style(scanned.to_string()).bold(),
        style(changed.to_string()).green().bold(),
        style(skipped.to_string()).dim()
    ));

    if changed == 0 {
        ui::outro("No em dashes found - nothing to do.");
    } else if dry_run {
        ui::outro(&format!(
            "Dry-run complete. {changed} file(s) would have been modified."
        ));
    } else {
        ui::outro(&format!("Done! Replaced em dashes in {changed} file(s)."));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn replace_dashes_replaces_em_and_en() {
        let input = "foo-bar-baz";
        assert_eq!(replace_dashes(input), "foo-bar-baz");
    }

    #[test]
    fn respects_gitignore() -> Result<()> {
        let dir = tempdir()?;
        fs::write(dir.path().join(".gitignore"), "ignored/\n")?;
        fs::create_dir_all(dir.path().join("ignored"))?;
        fs::write(dir.path().join("ignored").join("file.txt"), "-")?;
        fs::write(dir.path().join("visible.txt"), "-")?;

        let ig = build_ignore(dir.path())?;
        let files = walk_files(dir.path(), dir.path(), &ig, 0);
        let names: Vec<_> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
            .collect();

        assert!(names.contains(&"visible.txt".to_string()));
        assert!(!names.iter().any(|n| n == "file.txt"));
        Ok(())
    }

    #[test]
    fn dry_run_does_not_write() -> Result<()> {
        let dir = tempdir()?;
        let file = dir.path().join("test.txt");
        fs::write(&file, "hello-world")?;

        let content = fs::read_to_string(&file)?;
        assert!(contains_dashes(&content));
        let _ = replace_dashes(&content);
        assert!(fs::read_to_string(&file)?.contains('-'));
        Ok(())
    }
}
