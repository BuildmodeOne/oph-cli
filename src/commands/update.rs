use crate::ui;
use crate::utils::git::{is_branch_up_to_date, is_git_repo};
use crate::utils::package_json::{
    get_installed_version, is_dev_dependency, is_package_installed, read_project_package_json,
};
use crate::utils::process::exec_with_spinner;
use crate::utils::versions::{get_next_minor_version, get_next_patch_version};
use anyhow::{bail, Result};
use console::style;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PackageManager {
    Bun,
    Pnpm,
}

impl PackageManager {
    fn as_str(self) -> &'static str {
        match self {
            Self::Bun => "bun",
            Self::Pnpm => "pnpm",
        }
    }
}

fn detect_package_manager_in(cwd: &Path) -> Result<PackageManager> {
    if cwd.join("bun.lock").exists() || cwd.join("bun.lockb").exists() {
        return Ok(PackageManager::Bun);
    }

    if cwd.join("pnpm-lock.yaml").exists() {
        return Ok(PackageManager::Pnpm);
    }

    bail!(
        "Could not detect a supported package manager. \
         Expected a pnpm-lock.yaml (pnpm) or bun.lock / bun.lockb (bun) in the current directory."
    )
}

fn detect_package_manager() -> Result<PackageManager> {
    detect_package_manager_in(Path::new("."))
}

fn update_to_next_minor(pm: PackageManager, package_name: &str, is_dev: bool) {
    let Some(current_version) = get_installed_version(package_name) else {
        ui::log_warn(&format!(
            "Could not determine installed version of {}, skipping minor update",
            style(package_name).bold()
        ));
        return;
    };

    let dev_args: Vec<&str> = match (pm, is_dev) {
        (PackageManager::Bun, true) => vec!["--dev"],
        (PackageManager::Pnpm, true) => vec!["--save-dev"],
        _ => vec![],
    };

    if let Some(next_minor) = get_next_minor_version(package_name, &current_version) {
        let mut args = vec!["add"];
        args.extend_from_slice(&dev_args);
        let spec = format!("{package_name}@^{next_minor}");
        args.push(&spec);

        exec_with_spinner(
            pm.as_str(),
            &args,
            &format!("Updating {package_name} from v{current_version} to v{next_minor}"),
            &format!("Failed to update {package_name} to v{next_minor}"),
            &format!("Updated {package_name} from v{current_version} to v{next_minor}"),
        );
        return;
    }

    let Some(next_patch) = get_next_patch_version(package_name, &current_version) else {
        ui::log_info(&format!(
            "{} v{current_version} - already on the latest version",
            style(package_name).bold().dim()
        ));
        return;
    };

    let mut args = vec!["add"];
    args.extend_from_slice(&dev_args);
    let spec = format!("{package_name}@^{next_patch}");
    args.push(&spec);

    exec_with_spinner(
        pm.as_str(),
        &args,
        &format!("Updating {package_name} from v{current_version} to v{next_patch}"),
        &format!("Failed to update {package_name} to v{next_patch}"),
        &format!("Updated {package_name} from v{current_version} to v{next_patch}"),
    );
}

pub fn run(force: bool) -> Result<()> {
    println!();

    let pm = match detect_package_manager() {
        Ok(pm) => pm,
        Err(err) => {
            ui::log_error(&style(err.to_string()).red().to_string());
            std::process::exit(1);
        }
    };

    ui::intro(&format!(
        " oph - Update Project Dependencies ({}) ",
        pm.as_str()
    ));

    if is_git_repo() {
        if force {
            ui::log_warn(
                &style("Git branch check skipped (--force)")
                    .yellow()
                    .to_string(),
            );
        } else {
            let status = is_branch_up_to_date();
            if !status.up_to_date {
                ui::log_error(&style(status.reason).red().to_string());
                ui::log_info(
                    &style("Use --force or -f to bypass this check")
                        .dim()
                        .to_string(),
                );
                ui::outro(&style("Update aborted").red().to_string());
                std::process::exit(1);
            }
            ui::log_success(&style("Git branch is up to date").green().to_string());
        }
    }

    if pm == PackageManager::Pnpm {
        exec_with_spinner(
            "corepack",
            &["use", "pnpm@latest"],
            "Updating pnpm",
            "Failed to update pnpm",
            "Updated pnpm successfully",
        );
    }

    exec_with_spinner(
        pm.as_str(),
        &["update"],
        "Updating dependencies",
        "Failed to update dependencies",
        "Updated dependencies successfully",
    );

    let package_json = read_project_package_json()?;
    let framework_packages = ["react", "react-dom", "next"];
    let installed: Vec<_> = framework_packages
        .iter()
        .filter(|pkg| is_package_installed(&package_json, pkg))
        .copied()
        .collect();

    if !installed.is_empty() {
        let names: String = installed
            .iter()
            .map(|p| style(*p).bold().to_string())
            .collect::<Vec<_>>()
            .join(", ");
        ui::log_info(&format!("Detected {names} - checking for minor updates"));

        for pkg in installed {
            let is_dev = is_dev_dependency(&package_json, pkg);
            update_to_next_minor(pm, pkg, is_dev);
        }
    }

    if is_package_installed(&package_json, "tailwindcss") {
        let exec_prefix = match pm {
            PackageManager::Bun => "bunx",
            PackageManager::Pnpm => "pnpx",
        };
        exec_with_spinner(
            exec_prefix,
            &["@tailwindcss/upgrade", "--force"],
            "Upgrading Tailwind CSS",
            "Failed to upgrade Tailwind CSS",
            "Upgraded Tailwind CSS successfully",
        );
    }

    let add_exact_args: &[&str] = match pm {
        PackageManager::Bun => &["--dev", "--exact"],
        PackageManager::Pnpm => &["--save-dev", "--save-exact"],
    };

    let biome_version_before = get_installed_version("@biomejs/biome");

    exec_with_spinner(
        pm.as_str(),
        &[
            "add",
            add_exact_args[0],
            add_exact_args[1],
            "@biomejs/biome@latest",
        ],
        "Updating Biome",
        "Failed to update Biome",
        "Updated Biome successfully",
    );

    let biome_version_after = get_installed_version("@biomejs/biome");
    let biome_was_updated = matches!(
        (&biome_version_before, &biome_version_after),
        (Some(before), Some(after)) if before != after
    );

    let (biome_cmd, biome_base_args): (&str, &[&str]) = match pm {
        PackageManager::Bun => ("bunx", &[]),
        PackageManager::Pnpm => ("pnpm", &["exec"]),
    };

    let mut migrate_args: Vec<&str> = biome_base_args.to_vec();
    migrate_args.extend(["biome", "migrate", "--write"]);
    exec_with_spinner(
        biome_cmd,
        &migrate_args,
        "Updating Biome configuration",
        "Failed to update Biome configuration",
        "Updated Biome configuration successfully",
    );

    if biome_was_updated {
        if let (Some(before), Some(after)) = (&biome_version_before, &biome_version_after) {
            ui::log_info(&format!(
                "Biome updated from v{before} to v{after} - applying new formatting rules"
            ));
        }

        let mut check_args: Vec<&str> = biome_base_args.to_vec();
        check_args.extend(["biome", "check", "--write", "."]);

        exec_with_spinner(
            biome_cmd,
            &check_args,
            "Applying Biome formatting and lint fixes",
            "Failed to apply Biome formatting and lint fixes",
            "Applied Biome formatting and lint fixes successfully",
        );
    }

    exec_with_spinner(
        pm.as_str(),
        &["audit"],
        "Auditing for known vulnerabilities",
        "Vulnerability audit found issues - review the output above",
        "Vulnerability audit passed",
    );

    ui::outro(
        &style("Project dependencies updated successfully!")
            .green()
            .to_string(),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn detects_bun_from_lockfile() -> Result<()> {
        let dir = tempdir()?;
        fs::write(dir.path().join("bun.lock"), "")?;
        assert_eq!(detect_package_manager_in(dir.path())?, PackageManager::Bun);
        Ok(())
    }

    #[test]
    fn detects_pnpm_from_lockfile() -> Result<()> {
        let dir = tempdir()?;
        fs::write(dir.path().join("pnpm-lock.yaml"), "")?;
        assert_eq!(detect_package_manager_in(dir.path())?, PackageManager::Pnpm);
        Ok(())
    }
}
